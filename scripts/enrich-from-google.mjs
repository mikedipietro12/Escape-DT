import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/*
 * Enrich new stops from a Google Maps saved-list CSV (Google Takeout).
 *
 * Usage:
 *   node scripts/enrich-from-google.mjs <path-to-csv>           # dry run -> data/_enriched-preview.json
 *   node scripts/enrich-from-google.mjs <path-to-csv> --write   # append enriched stops to data/stops.json
 *
 * Needs GOOGLE_MAPS_API_KEY in .env (Places API enabled, billing on).
 *
 * Auto-fills: name, slug, lat, lng, googlePlaceId, coords.y, crossStreet (best
 * guess), cost (from priceLevel), categories (from types), placeholderColor, id.
 * Leaves for you (flagged in _review): description (required), tags, timeOfDay.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const stopsPath = path.join(root, "data", "stops.json");
const previewPath = path.join(root, "data", "_enriched-preview.json");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

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
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents: Café -> Cafe, Pantitlán -> Pantitlan
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function costFromPriceLevel(level) {
  if (level == null) return null;
  if (level === "PRICE_LEVEL_FREE" || level === "PRICE_LEVEL_INEXPENSIVE") return "$";
  if (level === "PRICE_LEVEL_MODERATE") return "$$";
  if (level === "PRICE_LEVEL_EXPENSIVE" || level === "PRICE_LEVEL_VERY_EXPENSIVE") return "$$$";
  return null;
}

const TYPE_TO_CATEGORY = [
  [["cafe", "coffee_shop"], "coffee"],
  [["bakery"], "food"],
  [["bar", "night_club", "liquor_store"], "drinks"],
  [["restaurant", "meal_takeaway", "meal_delivery", "food"], "food"],
  [["supermarket", "grocery_or_supermarket", "grocery_store", "convenience_store"], "groceries"],
  [["clothing_store", "store", "shopping_mall", "book_store", "shoe_store", "home_goods_store", "furniture_store"], "shopping"],
  [["park", "art_gallery", "museum", "tourist_attraction", "movie_theater", "amusement_center"], "hangout"],
];

function categoriesFromTypes(types = []) {
  const out = [];
  for (const [keys, cat] of TYPE_TO_CATEGORY) {
    if (types.some((t) => keys.includes(t)) && !out.includes(cat)) out.push(cat);
  }
  return out.slice(0, 3);
}

function timeOfDayGuess(types = []) {
  if (types.some((t) => ["bar", "night_club"].includes(t))) return ["evening"];
  if (types.some((t) => ["cafe", "coffee_shop", "bakery"].includes(t))) return ["morning", "afternoon"];
  return ["allday"];
}

function buildLatToYFit(stops) {
  const pts = stops
    .filter((s) => typeof s.lat === "number" && s.coords && typeof s.coords.y === "number")
    .map((s) => ({ x: s.lat, y: s.coords.y }));
  const n = pts.length;
  if (n < 2) return (lat) => 360;
  const sx = pts.reduce((a, p) => a + p.x, 0);
  const sy = pts.reduce((a, p) => a + p.y, 0);
  const sxx = pts.reduce((a, p) => a + p.x * p.x, 0);
  const sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
  const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const b = (sy - m * sx) / n;
  return (lat) => Math.max(180, Math.min(545, Math.round(m * lat + b)));
}

function randomColor(used) {
  for (let i = 0; i < 200; i++) {
    const c = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
    if (!used.has(c)) { used.add(c); return c; }
  }
  return "cccccc";
}

function crossStreetFrom(components = [], formatted = "") {
  const route = components.find((c) => (c.types || []).includes("route"));
  const street = route ? (route.shortText || route.longText) : (formatted.split(",")[0] || "").replace(/^\d+\s*/, "");
  if (/victoria/i.test(formatted) || /victoria/i.test(street || "")) {
    return { value: `Victoria & ?`, review: true };
  }
  return { value: street || "", review: true };
}

// Geocoding bias center per neighborhood (helps disambiguate same-named places).
const NEIGHBORHOOD_BIAS = {
  commercial: { latitude: 49.2634, longitude: -123.0694, radius: 3000 },
  "main-street": { latitude: 49.2487, longitude: -123.1009, radius: 3500 },
  chinatown: { latitude: 49.2796, longitude: -123.0992, radius: 2500 },
  "hastings-sunrise": { latitude: 49.281, longitude: -123.048, radius: 4500 },
};

// Places API (New) — one searchText call returns id, name, location, price, types, address.
async function searchPlace(query, key, bias) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.priceLevel,places.types,places.addressComponents",
    },
    body: JSON.stringify({
      textQuery: query,
      locationBias: { circle: { center: { latitude: bias.latitude, longitude: bias.longitude }, radius: bias.radius } },
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`${data.error.status || res.status}: ${data.error.message}`);
  }
  if (!data.places?.length) throw new Error("no match");
  return data.places[0];
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const nIdx = args.indexOf("--neighborhood");
  const neighborhood = nIdx >= 0 ? args[nIdx + 1] : "commercial";
  const csvArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--neighborhood");
  const key = process.env.GOOGLE_MAPS_API_KEY;

  if (!csvArg) {
    console.error("Usage: node scripts/enrich-from-google.mjs <path-to-csv> [--neighborhood <id>] [--write]");
    process.exit(1);
  }

  const neighborhoodsData = JSON.parse(fs.readFileSync(path.join(root, "data", "neighborhoods.json"), "utf8"));
  if (!neighborhoodsData.neighborhoods[neighborhood]) {
    console.error(`Unknown neighborhood "${neighborhood}". Valid: ${Object.keys(neighborhoodsData.neighborhoods).join(", ")}`);
    process.exit(1);
  }
  const bias = NEIGHBORHOOD_BIAS[neighborhood] || NEIGHBORHOOD_BIAS.commercial;
  if (!key || key === "your-key-here") {
    console.error("Missing GOOGLE_MAPS_API_KEY in .env");
    process.exit(1);
  }

  const csvPath = path.isAbsolute(csvArg) ? csvArg : path.join(process.cwd(), csvArg);
  if (!fs.existsSync(csvPath)) {
    console.error("CSV not found:", csvPath);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  const titleIdx = header.findIndex((h) => h === "title" || h.includes("name"));
  const urlIdx = header.findIndex((h) => h === "url" || h.includes("link"));
  if (titleIdx === -1) {
    console.error('Could not find a "Title" column in the CSV header:', header.join(", "));
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(stopsPath, "utf8"));
  const stops = data.stops;
  const usedColors = new Set(stops.map((s) => s.placeholderColor).filter(Boolean));
  const usedSlugs = new Set(stops.map((s) => s.slug));
  const latToY = buildLatToYFit(stops);
  let maxId = stops.reduce((m, s) => {
    const n = parseInt(String(s.id).replace(/^s/, ""), 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);

  const enriched = [];
  const failures = [];

  for (const row of rows) {
    const title = (row[titleIdx] || "").trim();
    const url = urlIdx >= 0 ? (row[urlIdx] || "").trim() : "";
    if (!title) continue;
    try {
      const d = await searchPlace(`${title} Vancouver`, key, bias);
      const name = d.displayName?.text || title;
      const lat = d.location.latitude;
      const lng = d.location.longitude;
      const types = d.types || [];
      const review = ["description"];

      let slug = slugify(name);
      let s = slug, i = 2;
      while (usedSlugs.has(s)) s = `${slug}-${i++}`;
      slug = s;
      usedSlugs.add(slug);

      const cost = costFromPriceLevel(d.priceLevel);
      if (cost == null) review.push("cost");
      const categories = categoriesFromTypes(types);
      if (!categories.length) review.push("categories");
      else review.push("categories?");
      const cs = crossStreetFrom(d.addressComponents, d.formattedAddress);
      if (cs.review) review.push("crossStreet");

      maxId += 1;
      enriched.push({
        id: `s${maxId}`,
        slug,
        name,
        categories,
        tags: [],
        neighborhood,
        cost: cost || "$$",
        timeOfDay: timeOfDayGuess(types),
        description: "",
        crossStreet: cs.value,
        walkFromStation: 0,
        coords: { y: latToY(lat) },
        lat,
        lng,
        googlePlaceId: d.id,
        placeholderColor: randomColor(usedColors),
        _sourceUrl: url || undefined,
        _googleTypes: types,
        _review: [...new Set([...review, "timeOfDay?", "tags"])],
      });
      console.log(`ok   ${title}  ->  ${name}  [${categories.join(", ") || "no category"}]`);
    } catch (err) {
      failures.push({ title, error: err.message });
      console.warn(`FAIL ${title}: ${err.message}`);
    }
  }

  if (write) {
    for (const e of enriched) {
      const clean = { ...e };
      delete clean._review;
      delete clean._sourceUrl;
      delete clean._googleTypes;
      stops.push(clean);
    }
    fs.writeFileSync(stopsPath, JSON.stringify(data, null, 4) + "\n");
    console.log(`\nWrote ${enriched.length} stops into data/stops.json. Fill in the blank descriptions, then review guessed fields.`);
  } else {
    fs.writeFileSync(previewPath, JSON.stringify({ enriched, failures }, null, 2) + "\n");
    console.log(`\nDry run. ${enriched.length} enriched, ${failures.length} failed.`);
    console.log(`Preview: data/_enriched-preview.json`);
    console.log(`Re-run with --write to append into data/stops.json.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
