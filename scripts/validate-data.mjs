import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relPath) {
  const abs = path.join(root, relPath);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const stopsData = readJson(path.join("data", "stops.json"));
  const neighborhoodsData = readJson(path.join("data", "neighborhoods.json"));

  const neighborhoods = neighborhoodsData?.neighborhoods || {};
  const allowedNeighborhoodIds = new Set(Object.keys(neighborhoods));
  assert(allowedNeighborhoodIds.size > 0, "No neighborhoods found in data/neighborhoods.json");

  const stops = Array.isArray(stopsData?.stops) ? stopsData.stops : [];
  assert(stops.length > 0, "No stops found in data/stops.json");

  const errors = [];

  for (const stop of stops) {
    const id = stop?.id || "(missing id)";
    const raw = stop?.neighborhood;
    const n = String(raw || "commercial").toLowerCase();
    if (!allowedNeighborhoodIds.has(n)) {
      errors.push(
        `${id} "${stop?.name || ""}" has unknown neighborhood "${raw}". ` +
        `Add it to data/neighborhoods.json or fix the stop.`
      );
    }
  }

  if (errors.length) {
    console.error("Data validation failed:\n- " + errors.join("\n- "));
    process.exitCode = 1;
    return;
  }

  console.log(`OK: validated ${stops.length} stops against ${allowedNeighborhoodIds.size} neighborhoods.`);
}

main();

