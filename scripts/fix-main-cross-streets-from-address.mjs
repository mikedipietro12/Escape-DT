#!/usr/bin/env node
/**
 * Fix Mount Pleasant cross streets + walk minutes from Google data.
 *
 * Cross streets: fetches each stop's formattedAddress via its googlePlaceId,
 * then derives the nearest cross avenue from the Main St street number using
 * Vancouver's block grid (block 31xx spans 15th→16th, so the south-end avenue
 * of block N is N-15; verified: Heritage Hall 3102 @ 15th, The Narrow 1898 @
 * E 3rd, Gene Coffee 2404 @ Broadway). Only stops whose address is on Main St
 * are auto-labeled; everything else is reported for manual review.
 *
 * Walk minutes: fits walkFromStation against straight-line distance from the
 * station and recomputes any stop deviating >3 min via the Routes API.
 *
 * Usage:
 *   node scripts/fix-main-cross-streets-from-address.mjs            # dry run
 *   node scripts/fix-main-cross-streets-from-address.mjs --write
 *
 * Needs GOOGLE_MAPS_API_KEY in .env.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getPlaceDetails,
  loadEnvFromRoot,
  walkMinutesFromStation,
} from "./enrich-lib.mjs";

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");

loadEnvFromRoot(root);
const key = process.env.GOOGLE_MAPS_API_KEY;
if (!key || key === "your-key-here") {
  console.error("Missing GOOGLE_MAPS_API_KEY in .env");
  process.exit(1);
}

const stopsPath = path.join(root, "data", "stops.json");
const data = JSON.parse(fs.readFileSync(stopsPath, "utf8"));
const neighborhoods = JSON.parse(
  fs.readFileSync(path.join(root, "data", "neighborhoods.json"), "utf8")
);
const station = neighborhoods.neighborhoods["mount-pleasant"].station;

const mpStops = data.stops.filter((s) => s.neighborhood === "mount-pleasant");

function ordinal(n) {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

function avenueName(ave) {
  if (ave === 9) return "Broadway";
  if (ave === 25) return "King Edward Ave";
  return `${ordinal(ave)} Ave`;
}

/** Nearest cross avenue for a Main St street number (East Van grid). */
function avenueFromMainNumber(num) {
  const block = Math.floor(num / 100);
  const northAve = block - 16;
  const southAve = block - 15;
  return num % 100 < 50 ? northAve : southAve;
}

function parseStreetAddress(formattedAddress) {
  const first = String(formattedAddress || "").split(",")[0].trim();
  const m = first.match(/^(\d+)\s+(.+)$/);
  if (!m) return null;
  return { number: Number(m[1]), street: m[2].trim() };
}

async function fixCrossStreets() {
  console.log("=== Cross streets (from Google addresses) ===");
  let changed = 0;
  for (const stop of mpStops) {
    if (!stop.googlePlaceId) {
      console.log(`${stop.id} ${stop.name}: no googlePlaceId — skipped`);
      continue;
    }
    let place;
    try {
      place = await getPlaceDetails(stop.googlePlaceId, key);
    } catch (err) {
      console.log(`${stop.id} ${stop.name}: place lookup failed (${err.message})`);
      continue;
    }
    const addr = parseStreetAddress(place.formattedAddress);
    if (!addr) {
      console.log(`${stop.id} ${stop.name}: unparseable address "${place.formattedAddress}"`);
      continue;
    }
    if (!/^main st/i.test(addr.street)) {
      console.log(
        `${stop.id} ${stop.name}: not on Main (${addr.number} ${addr.street}) — review manually [current: ${stop.crossStreet}]`
      );
      continue;
    }
    const ave = avenueFromMainNumber(addr.number);
    if (ave < 2 || ave > 35) {
      console.log(`${stop.id} ${stop.name}: derived avenue ${ave} out of range — skipped`);
      continue;
    }
    const next = `Main St & ${avenueName(ave)}`;
    if (next === stop.crossStreet) continue;
    console.log(
      `${stop.id} ${stop.name} (${addr.number} Main): ${stop.crossStreet || "(empty)"} → ${next}`
    );
    if (write) stop.crossStreet = next;
    changed++;
  }
  console.log(`${changed} cross streets ${write ? "updated" : "would change"}.\n`);
  return changed;
}

async function fixWalkMinutes() {
  console.log("=== Walk minutes (outliers vs straight-line fit) ===");
  const samples = mpStops
    .filter((s) => s.walkFromStation != null && s.lat != null)
    .map((s) => ({ stop: s, km: haversineKm(station.lat, station.lng, s.lat, s.lng) }));
  // Least-squares fit: walk ≈ a + b·km
  const n = samples.length;
  const sx = samples.reduce((t, p) => t + p.km, 0);
  const sy = samples.reduce((t, p) => t + p.stop.walkFromStation, 0);
  const sxx = samples.reduce((t, p) => t + p.km * p.km, 0);
  const sxy = samples.reduce((t, p) => t + p.km * p.stop.walkFromStation, 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const a = (sy - b * sx) / n;

  let changed = 0;
  for (const { stop, km } of samples) {
    const expected = a + b * km;
    if (Math.abs(stop.walkFromStation - expected) <= 3) continue;
    let minutes;
    try {
      minutes = await walkMinutesFromStation(station, stop.lat, stop.lng, key);
    } catch (err) {
      console.log(`${stop.id} ${stop.name}: directions failed (${err.message})`);
      continue;
    }
    if (minutes == null || minutes === stop.walkFromStation) {
      console.log(
        `${stop.id} ${stop.name}: walk ${stop.walkFromStation} vs fit ${expected.toFixed(1)} — Google still says ${minutes}`
      );
      continue;
    }
    console.log(
      `${stop.id} ${stop.name}: walk ${stop.walkFromStation} → ${minutes} (fit expected ~${expected.toFixed(0)})`
    );
    if (write) stop.walkFromStation = minutes;
    changed++;
  }
  console.log(`${changed} walk values ${write ? "updated" : "would change"}.\n`);
  return changed;
}

const labelChanges = await fixCrossStreets();
const walkChanges = await fixWalkMinutes();

if (write && (labelChanges || walkChanges)) {
  fs.writeFileSync(stopsPath, JSON.stringify(data, null, 4) + "\n");
  console.log("Saved data/stops.json");
} else if (!write) {
  console.log("Dry run — re-run with --write to save.");
}
