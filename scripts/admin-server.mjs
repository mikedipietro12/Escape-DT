#!/usr/bin/env node
/**
 * Local-only editor server for Escape DT stops.
 *
 * Serves admin.html and a tiny JSON API that reads/writes the stop data files.
 * NEVER deploy this — it writes to disk and is meant to run on your machine only.
 *
 * Usage: node scripts/admin-server.mjs [port]   (default 3001)
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  appendStopToFile,
  enrichStopFromInput,
  loadEnvFromRoot,
  stationForNeighborhood,
  walkMinutesFromStation,
} from "./enrich-lib.mjs";
import { normalizeTags, TAG_RULES_META } from "./tag-rules.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.argv[2]) || 3001;

const STOPS = {
  source: "stops",
  rel: path.join("data", "stops.json"),
  indent: 4,
};
const PLANS = {
  rel: path.join("data", "plans.json"),
  indent: 4,
};
// Draft files keep not-yet-live neighborhoods out of data/stops.json (which the
// app loads wholesale). Each one is keyed to a neighborhood id so saving a stop
// routes it to the right file. Add a new entry here to stage another area.
const DRAFTS = [
  {
    source: "chinatown-draft",
    rel: path.join("data", "chinatown-draft.json"),
    indent: 2,
    neighborhood: "chinatown",
  },
];
const FILES = [STOPS, ...DRAFTS];
const DRAFT_BY_SOURCE = Object.fromEntries(DRAFTS.map((d) => [d.source, d]));
const DRAFT_BY_NEIGHBORHOOD = Object.fromEntries(DRAFTS.map((d) => [d.neighborhood, d]));

const CANONICAL_CATEGORIES = ["coffee", "food", "drinks", "shopping", "hangout", "groceries"];
const TIME_OF_DAY = ["morning", "afternoon", "evening", "allday"];
const COSTS = ["Free", "$", "$$", "$$$"];

function normalizeCost(cost) {
  if (cost == null || cost === "") return "Free";
  if (typeof cost === "string") {
    return cost.toLowerCase() === "free" ? "Free" : cost;
  }
  if (Array.isArray(cost)) {
    return cost.map((v) => (String(v).toLowerCase() === "free" ? "Free" : v));
  }
  if (cost && typeof cost === "object") {
    const min = cost.min != null && String(cost.min).toLowerCase() === "free" ? "Free" : cost.min;
    const max = cost.max != null && String(cost.max).toLowerCase() === "free" ? "Free" : cost.max;
    if (min !== cost.min || max !== cost.max) return { ...cost, min, max };
  }
  return cost;
}

// Where stop photos live, relative to the repo root. Files are named
// <slug>.jpg (hero), then <slug>-2.jpg, <slug>-3.jpg, … for extra images.
const STOPS_IMG_DIR = path.join("assets", "stops");
const ALLOWED_IMG_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const types = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(root, file.rel), JSON.stringify(data, null, file.indent) + "\n");
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function loadAll() {
  // Returns { fileObjects: {source: parsedFile}, stops: [...annotated] }
  const fileObjects = {};
  const stops = [];
  for (const file of FILES) {
    let parsed;
    try {
      parsed = readJson(file.rel);
    } catch (err) {
      console.warn(`Could not read ${file.rel}: ${err.message}`);
      parsed = { stops: [] };
    }
    fileObjects[file.source] = parsed;
    const list = Array.isArray(parsed.stops) ? parsed.stops : [];
    for (const stop of list) {
      stops.push({ ...stop, _source: file.source });
    }
  }
  return { fileObjects, stops };
}

function collectTags(stops) {
  const set = new Set();
  for (const s of stops) {
    for (const t of s.tags || []) if (t) set.add(String(t));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function nextStopId(stops) {
  let max = 0;
  for (const s of stops) {
    const m = /^s(\d+)$/.exec(String(s.id || ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `s${max + 1}`;
}

function fileForStop(stop, sourceById) {
  if (DRAFT_BY_SOURCE[stop._source]) return DRAFT_BY_SOURCE[stop._source];
  if (stop._source === STOPS.source) return STOPS;
  const existing = sourceById[stop.id];
  if (existing) return existing;
  return DRAFT_BY_NEIGHBORHOOD[(stop.neighborhood || "").toLowerCase()] || STOPS;
}

function handleGetStops(res) {
  const { stops } = loadAll();
  sendJson(res, 200, {
    stops,
    capabilities: { walkFromStation: true },
    refs: {
      neighborhoods: readJson(path.join("data", "neighborhoods.json")),
      categories: CANONICAL_CATEGORIES,
      timeOfDay: TIME_OF_DAY,
      costs: COSTS,
      tags: collectTags(stops),
      nextId: nextStopId(stops),
      drafts: Object.fromEntries(DRAFTS.map((d) => [d.neighborhood, d.source])),
      tagRules: TAG_RULES_META,
    },
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

async function handleSaveStop(req, res, id) {
  let stop;
  try {
    stop = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }
  if (!stop || typeof stop !== "object") {
    return sendJson(res, 400, { error: "Body must be a stop object" });
  }
  if (!stop.id || stop.id !== id) {
    return sendJson(res, 400, { error: "Stop id missing or does not match URL" });
  }
  if (!String(stop.name || "").trim()) {
    return sendJson(res, 400, { error: "Stop name is required" });
  }

  if (Array.isArray(stop.tags)) {
    stop.tags = normalizeTags(stop.tags, stop.categories || []);
  }
  if (stop.cost != null && stop.cost !== "") {
    stop.cost = normalizeCost(stop.cost);
  }

  // Map every id to the file it currently lives in (for routing + cross-file moves).
  const { fileObjects, stops } = loadAll();
  const sourceById = {};
  for (const s of stops) {
    sourceById[s.id] = DRAFT_BY_SOURCE[s._source] || STOPS;
  }

  const target = fileForStop(stop, sourceById);
  const source = stop._source;
  delete stop._source;

  // If the stop moved between files, remove it from the old one first.
  const currentFile = sourceById[stop.id];
  if (currentFile && currentFile.source !== target.source) {
    const oldObj = fileObjects[currentFile.source];
    oldObj.stops = (oldObj.stops || []).filter((s) => s.id !== stop.id);
    writeJson(currentFile, oldObj);
  }

  const targetObj = fileObjects[target.source];
  if (!Array.isArray(targetObj.stops)) targetObj.stops = [];
  const idx = targetObj.stops.findIndex((s) => s.id === stop.id);
  if (idx >= 0) {
    targetObj.stops[idx] = stop;
  } else {
    targetObj.stops.push(stop);
  }
  try {
    writeJson(target, targetObj);
  } catch (err) {
    return sendJson(res, 500, { error: `Write failed: ${err.message}` });
  }

  console.log(`saved ${stop.id} "${stop.name}" -> ${target.rel}${source !== target.source ? " (moved)" : ""}`);
  sendJson(res, 200, { ok: true, id: stop.id, source: target.source });
}

function findPlanRefs(stopId) {
  try {
    const data = readJson(path.join("data", "plans.json"));
    const refs = [];
    for (const key of data.planOrder || Object.keys(data.plans || {})) {
      const plan = data.plans?.[key];
      if (!plan) continue;
      const ids = new Set(plan.stops || []);
      for (const seg of plan.narrative || []) {
        if (seg.type === "stops") for (const id of seg.ids || []) ids.add(id);
      }
      if (ids.has(stopId)) refs.push(key);
    }
    return refs;
  } catch {
    return [];
  }
}

async function handleDeleteStop(req, res, id) {
  let body = {};
  try {
    const raw = await readBody(req);
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const { fileObjects, stops } = loadAll();
  const stop = stops.find((s) => s.id === id);
  if (!stop) return sendJson(res, 404, { error: "Stop not found" });

  const planRefs = findPlanRefs(id);
  if (planRefs.length && !body.force) {
    return sendJson(res, 409, {
      error: "Stop is used in pre-built plans",
      plans: planRefs,
    });
  }

  const file = DRAFT_BY_SOURCE[stop._source] || STOPS;
  const obj = fileObjects[file.source];
  const before = (obj.stops || []).length;
  obj.stops = (obj.stops || []).filter((s) => s.id !== id);
  if (obj.stops.length === before) {
    return sendJson(res, 404, { error: "Stop not found in file" });
  }

  try {
    writeJson(file, obj);
  } catch (err) {
    return sendJson(res, 500, { error: `Write failed: ${err.message}` });
  }

  console.log(`deleted ${id} "${stop.name}" from ${file.rel}`);
  sendJson(res, 200, { ok: true, id, plans: planRefs });
}

// ---------- image uploads ----------
function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeExt(ext) {
  ext = String(ext || "").toLowerCase().replace(/^\./, "");
  return ext === "jpeg" ? "jpg" : ext;
}

function extFromContentType(ct) {
  ct = String(ct || "").toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("avif")) return "avif";
  if (ct.includes("gif")) return "gif";
  return "";
}

// All existing image files for a slug, with their index (hero = 1).
function listStopImages(slug) {
  const dir = path.join(root, STOPS_IMG_DIR);
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const re = new RegExp(`^${escapeRegex(slug)}(?:-(\\d+))?\\.(jpg|jpeg|png|webp|gif|avif)$`, "i");
  const found = [];
  for (const f of files) {
    const m = re.exec(f);
    if (m) found.push({ file: f, index: m[1] ? Number(m[1]) : 1 });
  }
  return found.sort((a, b) => a.index - b.index);
}

// Smallest free slot (1 = hero, then 2, 3, …).
function nextImageIndex(slug) {
  const used = new Set(listStopImages(slug).map((x) => x.index));
  let i = 1;
  while (used.has(i)) i++;
  return i;
}

function imageFilename(slug, index, ext) {
  return index <= 1 ? `${slug}.${ext}` : `${slug}-${index}.${ext}`;
}

function relImagePath(filename) {
  return `${STOPS_IMG_DIR.split(path.sep).join("/")}/${filename}`;
}

function readRawBody(req, limit = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        finish(reject, new Error(`File too large (max ${limit / (1024 * 1024)} MB)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => finish(resolve, Buffer.concat(chunks)));
    req.on("error", (err) => finish(reject, err));
    req.on("aborted", () => finish(reject, new Error("Upload cancelled")));
  });
}

function isPathInsideDir(filePath, dirPath) {
  const rel = path.relative(dirPath, filePath);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function handleListImages(res, query) {
  const slug = slugify(query.get("slug"));
  if (!slug) return sendJson(res, 200, { images: [] });
  const images = listStopImages(slug).map((x) => relImagePath(x.file));
  sendJson(res, 200, { images });
}

async function handleUpload(req, res, query) {
  const slug = slugify(query.get("slug"));
  if (!slug) return sendJson(res, 400, { error: "A slug (or name) is required to name the file" });

  let ext = normalizeExt(query.get("ext"));
  if (!ext) ext = normalizeExt(path.extname(query.get("filename") || ""));
  if (!ext) ext = extFromContentType(req.headers["content-type"]);
  if (!ALLOWED_IMG_EXT.has(ext)) {
    return sendJson(res, 400, { error: `Unsupported image type: ${ext || "unknown"}` });
  }
  ext = normalizeExt(ext);

  let buf;
  try {
    buf = await readRawBody(req);
  } catch (err) {
    return sendJson(res, 413, { error: err.message });
  }
  if (!buf.length) return sendJson(res, 400, { error: "Empty file" });

  const dir = path.join(root, STOPS_IMG_DIR);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    return sendJson(res, 500, { error: `Could not create ${STOPS_IMG_DIR}: ${err.message}` });
  }

  const index = nextImageIndex(slug);
  const filename = imageFilename(slug, index, ext);
  const dest = path.join(dir, filename);
  if (!isPathInsideDir(path.normalize(dest), path.normalize(dir))) {
    return sendJson(res, 400, { error: "Resolved path escapes the stops folder" });
  }

  try {
    fs.writeFileSync(dest, buf);
  } catch (err) {
    return sendJson(res, 500, { error: `Write failed: ${err.message}` });
  }

  const relPath = relImagePath(filename);
  console.log(`uploaded ${relPath} (${buf.length} bytes)`);
  sendJson(res, 200, { ok: true, path: relPath, filename, index, isHero: index <= 1 });
}

function serveStatic(req, res, urlPath) {
  const rel = urlPath === "/" ? "/admin.html" : urlPath;
  const filePath = path.normalize(path.join(root, decodeURIComponent(rel)));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

async function handleWalkFromStation(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const neighborhood = String(body.neighborhood || "commercial").trim().toLowerCase();

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return sendJson(res, 400, { error: "lat and lng are required" });
  }

  const neighborhoodsData = readJson(path.join("data", "neighborhoods.json"));
  const hood = neighborhoodsData?.neighborhoods?.[neighborhood];
  if (!hood) {
    return sendJson(res, 400, { error: `Unknown neighborhood "${neighborhood}"` });
  }
  if (hood.usesSkytrainStation === false) {
    return sendJson(res, 200, { ok: true, skipped: true });
  }

  loadEnvFromRoot(root);
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || key === "your-key-here") {
    return sendJson(res, 500, { error: "Missing GOOGLE_MAPS_API_KEY in .env" });
  }

  const stopsData = readJson(path.join("data", "stops.json"));
  const station = stationForNeighborhood(neighborhood, neighborhoodsData, stopsData);
  if (!station) {
    return sendJson(res, 400, { error: "No SkyTrain station configured for this neighborhood" });
  }

  try {
    const walkFromStation = await walkMinutesFromStation(station, lat, lng, key);
    sendJson(res, 200, { ok: true, walkFromStation });
  } catch (err) {
    sendJson(res, 400, { error: err.message || "Could not compute walking time" });
  }
}

function loadPlansFile() {
  try {
    return readJson(PLANS.rel);
  } catch (err) {
    console.warn(`Could not read ${PLANS.rel}: ${err.message}`);
    return { version: 2, planOrder: [], plans: {} };
  }
}

function writePlansFile(data) {
  writeJson(PLANS, data);
}

function loadAllStopIds() {
  const { stops } = loadAll();
  return new Set(stops.map((s) => s.id).filter(Boolean));
}

function asStopIdArray(ids) {
  if (Array.isArray(ids)) return ids.map((id) => String(id).trim()).filter(Boolean);
  if (typeof ids === "string") {
    const t = ids.trim();
    if (!t) return [];
    if (/^s\d+$/i.test(t)) return [t];
    return t.split(/,\s*/).map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function slugifyPlanKey(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "new-plan";
}

function uniquePlanKey(base, existingKeys) {
  let key = base;
  let n = 2;
  while (existingKeys.has(key)) {
    key = `${base}-${n}`;
    n += 1;
  }
  return key;
}

function deriveStopsFromNarrative(narrative) {
  const stops = [];
  const seen = new Set();
  for (const segment of narrative || []) {
    if (!segment || segment.type !== "stops") continue;
    for (const id of asStopIdArray(segment.ids)) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      stops.push(id);
    }
  }
  return stops;
}

function collectNarrativeStopIds(narrative) {
  const ids = new Set();
  for (const segment of narrative || []) {
    if (segment?.type === "stops") {
      for (const id of asStopIdArray(segment.ids)) if (id) ids.add(id);
    }
  }
  return ids;
}

function normalizePlanNeighborhood(value) {
  const hood = String(value || "commercial").trim().toLowerCase();
  return hood || "commercial";
}

function validatePlanPayload(plan, key, knownStopIds, neighborhoodsData) {
  const errors = [];
  const warnings = [];

  if (!String(plan.title || "").trim()) errors.push("Title is required");

  const neighborhood = normalizePlanNeighborhood(plan.neighborhood);
  if (!neighborhoodsData?.neighborhoods?.[neighborhood]) {
    errors.push(`Unknown neighborhood "${neighborhood}"`);
  }

  const narrative = Array.isArray(plan.narrative) ? plan.narrative : [];
  for (let i = 0; i < narrative.length; i += 1) {
    const seg = narrative[i];
    if (!seg || typeof seg !== "object") {
      errors.push(`Narrative segment ${i + 1} is invalid`);
      continue;
    }
    if (seg.type === "prose") {
      if (!String(seg.text || "").trim()) {
        warnings.push(`Narrative segment ${i + 1} (prose) is empty`);
      }
    } else if (seg.type === "stops") {
      const ids = asStopIdArray(seg.ids);
      if (!ids.length) {
        errors.push(`Narrative segment ${i + 1} (stops) has no stops`);
      } else {
        for (const id of ids) {
          if (!knownStopIds.has(id)) errors.push(`Unknown stop id in narrative: ${id}`);
        }
        if (seg.layout === "or" && ids.length < 2) {
          warnings.push(`Narrative segment ${i + 1}: "or" layout needs 2+ stops`);
        }
      }
    } else {
      errors.push(`Narrative segment ${i + 1} has unknown type "${seg.type}"`);
    }
  }

  const narrativeIds = collectNarrativeStopIds(narrative);
  const prevStops = asStopIdArray(plan.stops);
  const mapOnly = prevStops.filter((id) => !narrativeIds.has(id));
  if (mapOnly.length) {
    warnings.push(
      `These stops were in the route but not in narrative (removed on save): ${mapOnly.join(", ")}`
    );
  }

  return { errors, warnings, neighborhood, narrative, derivedStops: deriveStopsFromNarrative(narrative) };
}

function buildPlanSummary(data) {
  const order = data.planOrder?.length
    ? data.planOrder
    : Object.keys(data.plans || {});
  return order
    .map((key) => {
      const plan = data.plans?.[key];
      if (!plan) return null;
      return {
        key,
        title: plan.title || key,
        duration: plan.duration || "",
        neighborhood: normalizePlanNeighborhood(plan.neighborhood),
        stopCount: (plan.stops || []).length,
      };
    })
    .filter(Boolean);
}

function handleGetPlans(res) {
  const data = loadPlansFile();
  sendJson(res, 200, {
    ...data,
    summary: buildPlanSummary(data),
  });
}

function handleGetPlansRefs(res) {
  const neighborhoodsData = readJson(path.join("data", "neighborhoods.json"));
  sendJson(res, 200, {
    neighborhoods: neighborhoodsData,
    categories: CANONICAL_CATEGORIES,
  });
}

async function handleCreatePlan(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const title = String(body.title || "").trim();
  if (!title) return sendJson(res, 400, { error: "Title is required" });

  const neighborhoodsData = readJson(path.join("data", "neighborhoods.json"));
  const neighborhood = normalizePlanNeighborhood(body.neighborhood);
  if (!neighborhoodsData?.neighborhoods?.[neighborhood]) {
    return sendJson(res, 400, { error: `Unknown neighborhood "${neighborhood}"` });
  }

  const data = loadPlansFile();
  if (!data.plans || typeof data.plans !== "object") data.plans = {};
  if (!Array.isArray(data.planOrder)) data.planOrder = [];

  const existingKeys = new Set([...Object.keys(data.plans), ...data.planOrder]);
  const baseKey = slugifyPlanKey(title);
  const key = uniquePlanKey(baseKey, existingKeys);

  const plan = {
    title,
    duration: String(body.duration || "").trim(),
    description: String(body.description || "").trim(),
    introduction: "",
    narrative: [],
    stops: [],
    neighborhood,
  };

  data.plans[key] = plan;
  if (!data.planOrder.includes(key)) data.planOrder.push(key);

  try {
    writePlansFile(data);
  } catch (err) {
    return sendJson(res, 500, { error: `Write failed: ${err.message}` });
  }

  console.log(`created plan ${key} "${title}"`);
  sendJson(res, 200, { ok: true, key, plan });
}

async function handleSavePlan(req, res, key) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  if (!body || typeof body !== "object") {
    return sendJson(res, 400, { error: "Body must be a plan object" });
  }

  const data = loadPlansFile();
  if (!data.plans?.[key]) {
    return sendJson(res, 404, { error: "Plan not found — create it first via POST /api/plans" });
  }

  const knownStopIds = loadAllStopIds();
  const neighborhoodsData = readJson(path.join("data", "neighborhoods.json"));
  const { errors, warnings, neighborhood, narrative, derivedStops } = validatePlanPayload(
    body,
    key,
    knownStopIds,
    neighborhoodsData
  );
  if (errors.length) {
    return sendJson(res, 400, { error: errors.join("; "), errors });
  }

  const plan = {
    title: String(body.title || "").trim(),
    duration: String(body.duration || "").trim(),
    description: String(body.description || "").trim(),
    introduction: String(body.introduction || "").trim(),
    narrative: narrative.map((seg) => {
      if (seg.type === "prose") {
        return { type: "prose", text: String(seg.text || "").trim() };
      }
      const ids = asStopIdArray(seg.ids);
      const out = { type: "stops", ids };
      if (seg.layout === "or" && ids.length > 1) out.layout = "or";
      return out;
    }),
    stops: derivedStops,
  };
  if (neighborhood !== "commercial") plan.neighborhood = neighborhood;

  data.plans[key] = plan;

  try {
    writePlansFile(data);
  } catch (err) {
    return sendJson(res, 500, { error: `Write failed: ${err.message}` });
  }

  console.log(`saved plan ${key} "${plan.title}"`);
  sendJson(res, 200, { ok: true, key, plan, warnings });
}

async function handleEnrichStop(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const name = String(body.name || "").trim();
  const mapsUrl = String(body.mapsUrl || body.mapsLink || "").trim();
  const neighborhood = String(body.neighborhood || "commercial").trim().toLowerCase();

  loadEnvFromRoot(root);
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || key === "your-key-here") {
    return sendJson(res, 500, { error: "Missing GOOGLE_MAPS_API_KEY in .env" });
  }

  try {
    const { stop } = await enrichStopFromInput({ title: name, mapsUrl, neighborhood, root, key });
    const target = appendStopToFile(root, stop, neighborhood);
    console.log(`enriched ${stop.id} "${stop.name}" -> ${target.rel}`);
    sendJson(res, 200, {
      ok: true,
      id: stop.id,
      name: stop.name,
      source: DRAFT_BY_NEIGHBORHOOD[neighborhood]?.source || STOPS.source,
    });
  } catch (err) {
    sendJson(res, 400, { error: err.message || "Enrich failed" });
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  let urlPath = parsedUrl.pathname;
  if (urlPath.length > 1 && urlPath.endsWith("/")) urlPath = urlPath.slice(0, -1);
  const query = parsedUrl.searchParams;

  if (urlPath === "/api/stops" && req.method === "GET") {
    try {
      return handleGetStops(res);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (urlPath === "/api/plans" && req.method === "GET") {
    try {
      return handleGetPlans(res);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (urlPath === "/api/plans/refs" && req.method === "GET") {
    try {
      return handleGetPlansRefs(res);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (urlPath === "/api/plans" && req.method === "POST") {
    try {
      return await handleCreatePlan(req, res);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  const planSaveMatch = /^\/api\/plan\/([^/]+)$/.exec(urlPath);
  if (planSaveMatch && (req.method === "POST" || req.method === "PUT")) {
    const planKey = decodeURIComponent(planSaveMatch[1]);
    try {
      return await handleSavePlan(req, res, planKey);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (urlPath === "/api/images" && req.method === "GET") {
    try {
      return handleListImages(res, query);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (urlPath === "/api/upload" && req.method === "POST") {
    try {
      return await handleUpload(req, res, query);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (urlPath === "/api/enrich-stop" && req.method === "POST") {
    try {
      return await handleEnrichStop(req, res);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (urlPath === "/api/walk-from-station" && req.method === "POST") {
    try {
      return await handleWalkFromStation(req, res);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  const saveMatch = /^\/api\/stop\/([^/]+)$/.exec(urlPath);
  if (saveMatch) {
    const stopId = decodeURIComponent(saveMatch[1]);
    if (req.method === "POST" || req.method === "PUT") {
      try {
        return await handleSaveStop(req, res, stopId);
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }
    if (req.method === "DELETE") {
      try {
        return await handleDeleteStop(req, res, stopId);
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }
  serveStatic(req, res, urlPath);
});

server.on("clientError", (err, socket) => {
  console.error("client error:", err.message);
  if (!socket.destroyed) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(port, () => {
  console.log(`Escape DT stop editor:  http://localhost:${port}/`);
  console.log(`Escape DT plans editor: http://localhost:${port}/admin-plans.html`);
  const draftList = DRAFTS.map((d) => `${d.rel} (${d.neighborhood} draft)`).join(" + ");
  console.log(`Editing: ${STOPS.rel} (live) + ${draftList}, ${PLANS.rel}`);
  console.log("Local only — do not deploy. Ctrl+C to stop.");
});
