#!/usr/bin/env node
/**
 * Fill Mount Pleasant Main-spine cross streets from latitude (nearest avenue band).
 * Targets stops still at "Main St" or the bad bulk "Main St & 20th Ave" placeholder.
 *
 * Usage: node scripts/fill-main-cross-streets.mjs [--dry-run] [--write]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const write = process.argv.includes("--write");

const MAIN_SPINE_LNG = -123.1004;
const PLACEHOLDER_CROSS = new Set(["Main St", "Main St & 20th Ave"]);

function ordinal(n) {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

function crossStreetLabel(ave) {
  if (ave === 3) return "Main St & E 3rd Ave";
  if (ave === 2) return "Main St & 2nd Ave";
  if (ave === 7) return "Main St & 7th Ave";
  return `Main St & ${ordinal(ave)} Ave`;
}

function buildAvenueModel(stops) {
  const byAve = new Map();
  for (const stop of stops) {
    const m = String(stop.crossStreet || "").match(
      /Main St & (?:[EW] )?(\d+)(?:th|st|nd|rd)/i
    );
    if (!m || stop.lat == null) continue;
    const ave = Number(m[1]);
    if (!byAve.has(ave)) byAve.set(ave, []);
    byAve.get(ave).push(stop.lat);
  }
  return [...byAve.entries()]
    .map(([ave, lats]) => ({
      ave,
      lat: lats.reduce((sum, lat) => sum + lat, 0) / lats.length,
    }))
    .sort((a, b) => b.lat - a.lat);
}

function inferAvenue(lat, model) {
  if (!model.length) return null;
  const n = model.length;
  const sx = model.reduce((sum, p) => sum + p.ave, 0);
  const sy = model.reduce((sum, p) => sum + p.lat, 0);
  const sxx = model.reduce((sum, p) => sum + p.ave * p.ave, 0);
  const sxy = model.reduce((sum, p) => sum + p.ave * p.lat, 0);
  const denom = n * sxx - sx * sx;
  if (!denom) return model[0].ave;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const raw = (lat - intercept) / slope;
  return Math.max(2, Math.min(35, Math.round(raw)));
}

function isMainSpineStop(stop) {
  if (stop.lat == null || stop.lng == null) return false;
  if (stop.coords?.x != null && stop.coords.x < 140) return false;
  if (/\b(quebec|ontario|columbia|kingsway)\b/i.test(stop.crossStreet || "")) {
    return false;
  }
  return Math.abs(stop.lng - MAIN_SPINE_LNG) < 0.002;
}

const stopsPath = path.join(root, "data", "stops.json");
const data = JSON.parse(fs.readFileSync(stopsPath, "utf8"));
const mpStops = data.stops.filter((s) => s.neighborhood === "mount-pleasant");
const model = buildAvenueModel(mpStops);

if (model.length < 5) {
  console.error("Need more anchored Main St cross streets in stops.json first.");
  process.exit(1);
}

let updated = 0;
for (const stop of data.stops) {
  if (stop.neighborhood !== "mount-pleasant") continue;
  if (!isMainSpineStop(stop)) continue;

  const ave = inferAvenue(stop.lat, model);
  if (!ave) continue;

  const next = crossStreetLabel(ave);
  if (!PLACEHOLDER_CROSS.has(stop.crossStreet || "")) continue;
  if (next === stop.crossStreet) continue;

  console.log(`${stop.id} ${stop.name}: ${stop.crossStreet || "(empty)"} → ${next}`);
  if (write) {
    stop.crossStreet = next;
    if (Array.isArray(stop._review)) {
      stop._review = stop._review.filter((item) => item !== "crossStreet");
      if (!stop._review.length) delete stop._review;
    }
  }
  updated++;
}

if (write && updated) {
  fs.writeFileSync(stopsPath, JSON.stringify(data, null, 4) + "\n");
  console.log(`\nUpdated ${updated} stops in data/stops.json`);
} else if (dryRun || !write) {
  console.log(`\nWould update ${updated} stops. Re-run with --write to save.`);
} else {
  console.log("\nNo stops needed updates.");
}
