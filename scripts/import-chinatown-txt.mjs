import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  parseLatLngFromMapsLink,
  parsePlaceIdFromMapsLink,
  slugify,
  loadAllStopsContext,
  nextStopId,
  randomColor,
} from "./enrich-lib.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/import-chinatown-txt.mjs <path-to-CHINATOWN.txt>");
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, "utf8");
const lines = raw.split(/\r?\n/);
const entries = [];
let cur = null;

for (const line of lines) {
  const m = line.match(/^\s*(\d+)\.\s+(.+)$/);
  if (m) {
    if (cur) entries.push(cur);
    cur = { num: Number(m[1]), name: m[2].trim(), url: "" };
  } else if (cur && /maps|google\.com\/maps/i.test(line.trim())) {
    let url = line.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/\//, "")}`;
    cur.url = url;
  }
}
if (cur) entries.push(cur);

const { allStops } = loadAllStopsContext(root);
const usedColors = new Set(allStops.map((s) => s.placeholderColor).filter(Boolean));
const usedSlugs = new Set(allStops.map((s) => s.slug));

function latToY(lat) {
  const minLat = 49.274;
  const maxLat = 49.285;
  const minY = 195;
  const maxY = 520;
  return Math.round(minY + ((lat - minLat) / (maxLat - minLat)) * (maxY - minY));
}

function guessCategories(name) {
  const n = name.toLowerCase();
  if (/park|skatepark|field/.test(n)) {
    return {
      categories: ["hangout"],
      tags: [/skate/i.test(n) ? "activities" : "park"],
    };
  }
  if (/coffee|propaganda|prototype/.test(n)) {
    return { categories: ["coffee"], tags: [] };
  }
  if (/gelato|bruncheonette|bakery/.test(n)) {
    return { categories: ["food"], tags: /bakery/.test(n) ? ["grab and go"] : [] };
  }
  if (/cafe|deli|tea/.test(n) && !/marketplace/.test(n)) {
    return { categories: ["coffee"], tags: [] };
  }
  if (
    /pub|bar|cocktail|alibi|boxcar|keefer bar|tartare|beer company/.test(n) &&
    !/marketplace|program|garden/.test(n)
  ) {
    const tags = [];
    if (/cocktail|keefer|tartare/i.test(n)) tags.push("cocktails");
    if (/pub|beer|alibi|boxcar|heatley/i.test(n)) tags.push("beer");
    return { categories: ["drinks"], tags };
  }
  if (/the heatley/.test(n)) {
    return { categories: ["drinks"], tags: ["beer"] };
  }
  if (/vintage/.test(n)) {
    return { categories: ["shopping"], tags: ["vintage"] };
  }
  if (/finch.*market|union market/.test(n)) {
    return { categories: ["coffee", "hangout"], tags: ["sit down"] };
  }
  if (/marketplace|benny foods/.test(n)) {
    return { categories: ["groceries"], tags: [] };
  }
  if (/gym|fitness/.test(n)) {
    return { categories: ["hangout"], tags: ["activities"] };
  }
  return { categories: ["food"], tags: [] };
}

function guessTimeOfDay(name, categories) {
  if (categories.includes("drinks")) return ["afternoon", "evening"];
  if (categories.includes("coffee")) return ["morning", "afternoon"];
  if (/park|skate|gym|fitness/.test(name.toLowerCase())) return ["allday"];
  if (/bakery|bruncheonette|say hey|finch|propaganda|prototype/.test(name.toLowerCase())) {
    return ["morning", "afternoon"];
  }
  return ["allday"];
}

const stops = [];
const errors = [];

for (const e of entries) {
  const coords = parseLatLngFromMapsLink(e.url);
  if (!coords) {
    errors.push(e.name);
    continue;
  }
  let slug = slugify(e.name);
  let base = slug;
  let i = 2;
  while (usedSlugs.has(slug)) {
    slug = `${base}-${i++}`;
  }
  usedSlugs.add(slug);

  const { categories, tags } = guessCategories(e.name);
  const review = ["crossStreet", "cost"];
  if (!tags.length) review.push("tags");

  stops.push({
    id: nextStopId([...allStops, ...stops]),
    slug,
    name: e.name,
    categories,
    tags,
    neighborhood: "chinatown",
    cost: "$$",
    timeOfDay: guessTimeOfDay(e.name, categories),
    description: "",
    crossStreet: "",
    coords: { y: latToY(coords.lat) },
    lat: coords.lat,
    lng: coords.lng,
    googlePlaceId: parsePlaceIdFromMapsLink(e.url),
    placeholderColor: randomColor(usedColors),
    _review: review,
  });
}

const outPath = path.join(root, "data", "chinatown-draft.json");
const out = {
  _note:
    "DRAFT, not loaded by the app. Chinatown stops staged for grid route map. Pending: crossStreet (intersection format e.g. Main & Pender), descriptions, photos, cost/category review (_review). Imported from CHINATOWN.txt.",
  stops,
};

fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Parsed ${entries.length} entries → ${stops.length} stops → ${outPath}`);
console.log(`IDs: ${stops[0]?.id} – ${stops[stops.length - 1]?.id}`);
if (errors.length) {
  console.error("Could not parse coords:", errors.join(", "));
  process.exit(1);
}
