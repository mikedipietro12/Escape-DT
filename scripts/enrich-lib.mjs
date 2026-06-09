import fs from "fs";
import path from "path";

export const DRAFT_FILES = {
  "mount-pleasant": { rel: path.join("data", "mount-pleasant-draft.json"), indent: 2 },
  chinatown: { rel: path.join("data", "chinatown-draft.json"), indent: 2 },
};

export const NEIGHBORHOOD_BIAS = {
  commercial: { latitude: 49.2634, longitude: -123.0694, radius: 3000 },
  "mount-pleasant": { latitude: 49.2647, longitude: -123.1009, radius: 2500 },
  chinatown: { latitude: 49.2796, longitude: -123.0992, radius: 2500 },
  "hastings-sunrise": { latitude: 49.281, longitude: -123.048, radius: 4500 },
};

const TYPE_TO_CATEGORY = [
  [["cafe", "coffee_shop"], "coffee"],
  [["bakery"], "food"],
  [["bar", "night_club", "liquor_store"], "drinks"],
  [["restaurant", "meal_takeaway", "meal_delivery", "food"], "food"],
  [["supermarket", "grocery_or_supermarket", "grocery_store", "convenience_store"], "groceries"],
  [["clothing_store", "store", "shopping_mall", "book_store", "shoe_store", "home_goods_store", "furniture_store"], "shopping"],
  [["park", "art_gallery", "museum", "tourist_attraction", "movie_theater", "amusement_center"], "hangout"],
];

export function loadEnvFromRoot(root) {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

export function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseLatLngFromMapsLink(raw) {
  const url = String(raw || "").trim();
  if (!url) return null;
  const num = "(-?\\d{1,3}\\.\\d+)";
  let m = url.match(new RegExp("!3d" + num + "!4d" + num));
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  m = url.match(new RegExp("@" + num + "," + num));
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  m = url.match(new RegExp("[?&]q=(?:loc:)?" + num + "," + num));
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  return null;
}

export function parsePlaceIdFromMapsLink(raw) {
  const url = String(raw || "").trim();
  if (!url) return null;
  let m = url.match(/[?&](?:query_place_id|place_id)=([^&]+)/i);
  if (m) return decodeURIComponent(m[1]);
  m = url.match(/\/place\/(ChIJ[a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = url.match(/!1s(ChIJ[a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return null;
}

export function costFromPriceLevel(level) {
  if (level == null) return null;
  if (level === "PRICE_LEVEL_FREE") return "Free";
  if (level === "PRICE_LEVEL_INEXPENSIVE") return "$";
  if (level === "PRICE_LEVEL_MODERATE") return "$$";
  if (level === "PRICE_LEVEL_EXPENSIVE" || level === "PRICE_LEVEL_VERY_EXPENSIVE") return "$$$";
  return null;
}

export function categoriesFromTypes(types = []) {
  const out = [];
  for (const [keys, cat] of TYPE_TO_CATEGORY) {
    if (types.some((t) => keys.includes(t)) && !out.includes(cat)) out.push(cat);
  }
  return out.slice(0, 3);
}

export function timeOfDayGuess(types = []) {
  if (types.some((t) => ["bar", "night_club"].includes(t))) return ["evening"];
  if (types.some((t) => ["cafe", "coffee_shop", "bakery"].includes(t))) return ["morning", "afternoon"];
  return ["allday"];
}

export function buildLatToYFit(stops) {
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

export function randomColor(used) {
  for (let i = 0; i < 200; i++) {
    const c = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
    if (!used.has(c)) {
      used.add(c);
      return c;
    }
  }
  return "cccccc";
}

function crossStreetFrom(components = [], formatted = "") {
  const route = components.find((c) => (c.types || []).includes("route"));
  const street = route ? (route.shortText || route.longText) : (formatted.split(",")[0] || "").replace(/^\d+\s*/, "");
  if (/victoria/i.test(formatted) || /victoria/i.test(street || "")) {
    return { value: "Victoria & ?", review: true };
  }
  return { value: street || "", review: true };
}

export function stationForNeighborhood(neighborhood, neighborhoodsData, stopsData) {
  const hood = neighborhoodsData?.neighborhoods?.[neighborhood];
  if (hood?.station?.lat != null && hood?.station?.lng != null) {
    return { lat: hood.station.lat, lng: hood.station.lng, name: hood.station.name || hood.title };
  }
  if (neighborhood === "commercial" && stopsData?.station) {
    return { lat: stopsData.station.lat, lng: stopsData.station.lng, name: stopsData.station.name };
  }
  return null;
}

export async function walkMinutesFromStation(station, destLat, destLng, key) {
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.duration",
    },
    body: JSON.stringify({
      origin: {
        location: {
          latLng: { latitude: station.lat, longitude: station.lng },
        },
      },
      destination: {
        location: {
          latLng: { latitude: destLat, longitude: destLng },
        },
      },
      travelMode: "WALK",
      computeAlternativeRoutes: false,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || data.error_message || res.statusText || "Routes API error");
  }
  const duration = data.routes?.[0]?.duration;
  if (!duration) throw new Error("no walking route");
  const seconds = Number.parseFloat(String(duration).replace(/s$/, ""));
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("no walking route");
  return Math.max(1, Math.round(seconds / 60));
}

const PLACE_FIELD_MASK =
  "id,displayName,formattedAddress,location,priceLevel,types,addressComponents";

export async function searchPlace(query, key, bias) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": `places.${PLACE_FIELD_MASK.replace(/,/g, ",places.")}`,
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

export async function getPlaceDetails(placeId, key) {
  const id = String(placeId).replace(/^places\//, "");
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": PLACE_FIELD_MASK,
    },
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`${data.error.status || res.status}: ${data.error.message}`);
  }
  if (!data.id && !data.location) throw new Error("place not found");
  return data;
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.lat);
  const dLng = toRad(b.longitude - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function resolvePlace({ title, mapsUrl = "", neighborhood = "commercial", key }) {
  const linkCoords = mapsUrl ? parseLatLngFromMapsLink(mapsUrl) : null;
  const placeId = mapsUrl ? parsePlaceIdFromMapsLink(mapsUrl) : null;
  const hoodBias = NEIGHBORHOOD_BIAS[neighborhood] || NEIGHBORHOOD_BIAS.commercial;

  if (placeId) {
    try {
      return { place: await getPlaceDetails(placeId, key), linkCoords };
    } catch {
      /* fall through to text search */
    }
  }

  const queries = [`${title} Vancouver`, title];
  const biasAttempts = linkCoords
    ? [
        { latitude: linkCoords.lat, longitude: linkCoords.lng, radius: 120 },
        { latitude: linkCoords.lat, longitude: linkCoords.lng, radius: 400 },
        hoodBias,
      ]
    : [hoodBias];

  let lastErr;
  for (const bias of biasAttempts) {
    for (const query of queries) {
      try {
        const place = await searchPlace(query, key, bias);
        if (linkCoords && place.location) {
          const dist = haversineMeters(linkCoords, place.location);
          if (dist > 600 && bias.radius <= 400) continue;
        }
        return { place, linkCoords };
      } catch (err) {
        lastErr = err;
      }
    }
  }
  throw lastErr || new Error("no match");
}

export function loadAllStopsContext(root) {
  const stopsPath = path.join(root, "data", "stops.json");
  const stopsData = JSON.parse(fs.readFileSync(stopsPath, "utf8"));
  const allStops = [...(stopsData.stops || [])];
  for (const def of Object.values(DRAFT_FILES)) {
    const abs = path.join(root, def.rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
      if (Array.isArray(parsed.stops)) allStops.push(...parsed.stops);
    } catch {
      /* skip unreadable draft */
    }
  }
  const neighborhoodsData = JSON.parse(
    fs.readFileSync(path.join(root, "data", "neighborhoods.json"), "utf8")
  );
  return { stopsData, allStops, neighborhoodsData };
}

export function nextStopId(allStops) {
  let max = 0;
  for (const s of allStops) {
    const m = /^s(\d+)$/.exec(String(s.id || ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `s${max + 1}`;
}

export async function buildEnrichedStop({
  title,
  mapsUrl = "",
  neighborhood = "commercial",
  place,
  linkCoords = null,
  allStops,
  stopsData,
  neighborhoodsData,
  key,
}) {
  const usesSkytrain = neighborhoodsData.neighborhoods[neighborhood]?.usesSkytrainStation !== false;
  const skytrainStation = usesSkytrain
    ? stationForNeighborhood(neighborhood, neighborhoodsData, stopsData)
    : null;

  const usedColors = new Set(allStops.map((s) => s.placeholderColor).filter(Boolean));
  const usedSlugs = new Set(allStops.map((s) => s.slug));
  const fitStops = allStops.filter((s) => (s.neighborhood || "commercial") === neighborhood);
  const latToY = buildLatToYFit(fitStops.length >= 2 ? fitStops : allStops);

  const name = place.displayName?.text || title;
  const lat = linkCoords?.lat ?? place.location.latitude;
  const lng = linkCoords?.lng ?? place.location.longitude;
  const types = place.types || [];
  const review = ["description"];

  let slug = slugify(name);
  let candidate = slug;
  let i = 2;
  while (usedSlugs.has(candidate)) {
    candidate = `${slug}-${i++}`;
  }
  slug = candidate;
  usedSlugs.add(slug);

  const cost = costFromPriceLevel(place.priceLevel);
  const isPark = types.includes("park");
  if (cost == null && !isPark) review.push("cost");
  const categories = categoriesFromTypes(types);
  if (!categories.length) review.push("categories");
  else review.push("categories?");
  const cs = crossStreetFrom(place.addressComponents, place.formattedAddress);
  if (cs.review) review.push("crossStreet");

  const stop = {
    id: nextStopId(allStops),
    slug,
    name,
    categories,
    tags: [],
    neighborhood,
    cost: cost || (isPark ? "Free" : "$$"),
    timeOfDay: timeOfDayGuess(types),
    description: "",
    crossStreet: cs.value,
    coords: { y: latToY(lat) },
    lat,
    lng,
    googlePlaceId: place.id,
    placeholderColor: randomColor(usedColors),
    _googleTypes: types,
    _review: [...new Set([...review, "timeOfDay?", "tags"])],
  };

  if (usesSkytrain) {
    if (skytrainStation) {
      try {
        stop.walkFromStation = await walkMinutesFromStation(skytrainStation, lat, lng, key);
      } catch {
        stop.walkFromStation = 0;
        stop._review.push("walkFromStation");
      }
    } else {
      stop.walkFromStation = 0;
      stop._review.push("walkFromStation");
    }
  }

  return stop;
}

export async function enrichStopFromInput({ title, mapsUrl, neighborhood = "commercial", root, key }) {
  if (!String(title || "").trim()) throw new Error("Name is required");
  if (!String(mapsUrl || "").trim()) throw new Error("Google Maps link is required");
  if (/goo\.gl|maps\.app\.goo\.gl/i.test(mapsUrl)) {
    throw new Error("Short links cannot be read — open in Maps and copy the full URL");
  }
  const linkCoords = parseLatLngFromMapsLink(mapsUrl);
  if (!linkCoords) {
    throw new Error("Could not parse coordinates from that Maps link — use the full maps.google.com URL");
  }

  const { stopsData, allStops, neighborhoodsData } = loadAllStopsContext(root);
  if (!neighborhoodsData.neighborhoods[neighborhood]) {
    throw new Error(`Unknown neighborhood "${neighborhood}"`);
  }

  const { place, linkCoords: coords } = await resolvePlace({ title, mapsUrl, neighborhood, key });
  const stop = await buildEnrichedStop({
    title: String(title).trim(),
    mapsUrl,
    neighborhood,
    place,
    linkCoords: coords,
    allStops,
    stopsData,
    neighborhoodsData,
    key,
  });

  return { stop, stopsData, neighborhoodsData };
}

export function targetFileForNeighborhood(neighborhood) {
  const draftDef = DRAFT_FILES[neighborhood];
  if (draftDef) return draftDef;
  return { rel: path.join("data", "stops.json"), indent: 4 };
}

export function appendStopToFile(root, stop, neighborhood) {
  const target = targetFileForNeighborhood(neighborhood);
  const targetPath = path.join(root, target.rel);
  const targetObj =
    target.rel.endsWith("stops.json")
      ? JSON.parse(fs.readFileSync(targetPath, "utf8"))
      : JSON.parse(fs.readFileSync(targetPath, "utf8"));
  if (!Array.isArray(targetObj.stops)) targetObj.stops = [];
  targetObj.stops.push(stop);
  fs.writeFileSync(targetPath, JSON.stringify(targetObj, null, target.indent) + "\n");
  return target;
}
