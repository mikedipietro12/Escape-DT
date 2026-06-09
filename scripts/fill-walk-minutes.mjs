#!/usr/bin/env node
/**
 * One-off helper: fill walkFromStation for stops still at 0 (SkyTrain neighborhoods only).
 * Usage: node scripts/fill-walk-minutes.mjs [--dry-run]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadEnvFromRoot,
  walkMinutesFromStation,
  stationForNeighborhood,
} from "./enrich-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");

loadEnvFromRoot(root);
const key = process.env.GOOGLE_MAPS_API_KEY;
if (!key || key === "your-key-here") {
  console.error("Missing GOOGLE_MAPS_API_KEY in .env");
  process.exit(1);
}

const neighborhoodsData = JSON.parse(
  fs.readFileSync(path.join(root, "data", "neighborhoods.json"), "utf8")
);
const stopsData = JSON.parse(fs.readFileSync(path.join(root, "data", "stops.json"), "utf8"));

const files = [
  { rel: path.join("data", "stops.json"), indent: 4 },
  { rel: path.join("data", "mount-pleasant-draft.json"), indent: 2 },
  { rel: path.join("data", "chinatown-draft.json"), indent: 2 },
  { rel: path.join("data", "hastings-sunrise-draft.json"), indent: 2 },
];

function usesSkytrain(nbh) {
  return neighborhoodsData.neighborhoods[nbh]?.usesSkytrainStation !== false;
}

let updated = 0;

for (const file of files) {
  const abs = path.join(root, file.rel);
  if (!fs.existsSync(abs)) continue;
  const data = JSON.parse(fs.readFileSync(abs, "utf8"));
  if (!Array.isArray(data.stops)) continue;

  let changed = false;
  for (const stop of data.stops) {
    const nbh = (stop.neighborhood || "commercial").toLowerCase();
    if (!usesSkytrain(nbh)) continue;
    if (stop.walkFromStation !== 0) continue;
    if (stop.lat == null || stop.lng == null) {
      console.warn(`skip ${stop.id} ${stop.name}: missing lat/lng`);
      continue;
    }

    const station = stationForNeighborhood(nbh, neighborhoodsData, stopsData);
    if (!station) {
      console.warn(`skip ${stop.id} ${stop.name}: no station for ${nbh}`);
      continue;
    }

    try {
      const mins = await walkMinutesFromStation(station, stop.lat, stop.lng, key);
      console.log(`${file.rel}: ${stop.id} ${stop.name} → ${mins} min`);
      if (!dryRun) {
        stop.walkFromStation = mins;
        if (Array.isArray(stop._review)) {
          stop._review = stop._review.filter((item) => item !== "walkFromStation");
          if (!stop._review.length) delete stop._review;
        }
        changed = true;
        updated++;
      }
    } catch (err) {
      console.error(`${stop.id} ${stop.name}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  if (changed && !dryRun) {
    fs.writeFileSync(abs, JSON.stringify(data, null, file.indent) + "\n");
    console.log(`saved ${file.rel}`);
  }
}

console.log(dryRun ? `Would update ${updated} stops` : `Updated ${updated} stops`);
