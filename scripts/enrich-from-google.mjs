import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  DRAFT_FILES,
  appendStopToFile,
  buildEnrichedStop,
  loadAllStopsContext,
  loadEnvFromRoot,
  resolvePlace,
  stationForNeighborhood,
  targetFileForNeighborhood,
} from "./enrich-lib.mjs";

/*
 * Enrich new stops from a list of place names (one per line) or a Google Maps
 * saved-list CSV (Google Takeout). A plain .txt/.md list is the easy path:
 * just the business names, and Google Places fills in the rest.
 *
 * Usage:
 *   node scripts/enrich-from-google.mjs <path-to-list>           # dry run -> data/_enriched-preview.json
 *   node scripts/enrich-from-google.mjs <path-to-list> --write   # append enriched stops to the target file
 *
 *   <path-to-list> is either a .csv (with a Title/Name column) or a plain text
 *   file with one place name per line (blank lines and lines starting with # are
 *   ignored; leading list markers like "-", "*", "1." are stripped).
 *
 * Needs GOOGLE_MAPS_API_KEY in .env (Places API enabled, billing on).
 *
 * Auto-fills: name, slug, lat, lng, googlePlaceId, coords.y, crossStreet (best
 * guess), cost (from priceLevel), categories (from types), placeholderColor, id.
 * When the neighborhood uses SkyTrain, walkFromStation via Google Directions
 * (station from data/stops.json for commercial, neighborhoods.json otherwise).
 * Leaves for you (flagged in _review): description (required), tags, timeOfDay.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewPath = path.join(root, "data", "_enriched-preview.json");

function parseCsv(text) {
  const rows = [];
  let cur = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function parseNameList(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((title) => ({ title, url: "" }));
}

function parseCsvEntries(text) {
  const rows = parseCsv(text);
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  const titleIdx = header.findIndex((h) => h === "title" || h.includes("name"));
  const urlIdx = header.findIndex((h) => h === "url" || h.includes("link"));
  if (titleIdx === -1) {
    throw new Error(`Could not find a "Title" column in the CSV header: ${header.join(", ")}`);
  }
  return rows
    .map((row) => ({ title: (row[titleIdx] || "").trim(), url: urlIdx >= 0 ? (row[urlIdx] || "").trim() : "" }))
    .filter((e) => e.title);
}

async function main() {
  loadEnvFromRoot(root);
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const nIdx = args.indexOf("--neighborhood");
  const neighborhood = nIdx >= 0 ? args[nIdx + 1] : "commercial";
  const inputArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--neighborhood");
  const key = process.env.GOOGLE_MAPS_API_KEY;

  if (!inputArg) {
    console.error("Usage: node scripts/enrich-from-google.mjs <path-to-list> [--neighborhood <id>] [--write]");
    console.error("  <path-to-list> is a .csv (Title/Name column) or a plain text file with one place name per line.");
    process.exit(1);
  }

  const { stopsData, allStops, neighborhoodsData } = loadAllStopsContext(root);
  if (!neighborhoodsData.neighborhoods[neighborhood]) {
    console.error(`Unknown neighborhood "${neighborhood}". Valid: ${Object.keys(neighborhoodsData.neighborhoods).join(", ")}`);
    process.exit(1);
  }
  const usesSkytrain = neighborhoodsData.neighborhoods[neighborhood]?.usesSkytrainStation !== false;
  if (!key || key === "your-key-here") {
    console.error("Missing GOOGLE_MAPS_API_KEY in .env");
    process.exit(1);
  }

  const inputPath = path.isAbsolute(inputArg) ? inputArg : path.join(process.cwd(), inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error("Input file not found:", inputPath);
    process.exit(1);
  }

  const inputText = fs.readFileSync(inputPath, "utf8");
  const isCsv = path.extname(inputPath).toLowerCase() === ".csv";
  let entries;
  try {
    entries = isCsv ? parseCsvEntries(inputText) : parseNameList(inputText);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  if (!entries.length) {
    console.error("No place names found in", inputPath);
    process.exit(1);
  }

  const target = targetFileForNeighborhood(neighborhood);
  const skytrainStation = usesSkytrain
    ? stationForNeighborhood(neighborhood, neighborhoodsData, stopsData)
    : null;
  if (usesSkytrain && !skytrainStation) {
    console.warn(`Warning: neighborhood "${neighborhood}" uses SkyTrain but has no station coords; walkFromStation will be 0.`);
  } else if (skytrainStation?.name) {
    console.log(`Walk minutes from: ${skytrainStation.name}`);
  }

  const enriched = [];
  const failures = [];
  let workingStops = [...allStops];

  for (const entry of entries) {
    const title = entry.title;
    if (!title) continue;
    try {
      const { place, linkCoords } = await resolvePlace({ title, mapsUrl: entry.url || "", neighborhood, key });
      const stop = await buildEnrichedStop({
        title,
        mapsUrl: entry.url || "",
        neighborhood,
        place,
        linkCoords,
        allStops: workingStops,
        stopsData,
        neighborhoodsData,
        key,
      });
      if (entry.url) stop._sourceUrl = entry.url;
      workingStops.push(stop);
      enriched.push(stop);
      const walkNote = usesSkytrain && stop.walkFromStation ? `, ${stop.walkFromStation} min walk` : "";
      console.log(`ok   ${title}  ->  ${stop.name}  [${stop.categories.join(", ") || "no category"}${walkNote}]`);
    } catch (err) {
      failures.push({ title, error: err.message });
      console.warn(`FAIL ${title}: ${err.message}`);
    }
  }

  if (write) {
    for (const e of enriched) {
      const stop = { ...e };
      delete stop._sourceUrl;
      if (!DRAFT_FILES[neighborhood]) {
        delete stop._review;
        delete stop._googleTypes;
      }
      appendStopToFile(root, stop, neighborhood);
    }
    console.log(`\nWrote ${enriched.length} stops into ${target.rel.replace(/\\/g, "/")}. Fill in the blank descriptions, then review guessed fields (npm run admin).`);
  } else {
    fs.writeFileSync(previewPath, JSON.stringify({ enriched, failures }, null, 2) + "\n");
    console.log(`\nDry run. ${enriched.length} enriched, ${failures.length} failed.`);
    console.log("Preview: data/_enriched-preview.json");
    console.log(`Re-run with --write to append into ${target.rel.replace(/\\/g, "/")}.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
