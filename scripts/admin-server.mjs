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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.argv[2]) || 3001;

const STOPS = {
  source: "stops",
  rel: path.join("data", "stops.json"),
  indent: 4,
};
// Draft files keep not-yet-live neighborhoods out of data/stops.json (which the
// app loads wholesale). Each one is keyed to a neighborhood id so saving a stop
// routes it to the right file. Add a new entry here to stage another area.
const DRAFTS = [
  {
    source: "hastings-draft",
    rel: path.join("data", "hastings-sunrise-draft.json"),
    indent: 2,
    neighborhood: "hastings-sunrise",
  },
  {
    source: "mount-pleasant-draft",
    rel: path.join("data", "mount-pleasant-draft.json"),
    indent: 2,
    neighborhood: "mount-pleasant",
  },
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
const COSTS = ["$", "$$", "$$$"];

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
    refs: {
      neighborhoods: readJson(path.join("data", "neighborhoods.json")),
      categories: CANONICAL_CATEGORIES,
      timeOfDay: TIME_OF_DAY,
      costs: COSTS,
      tags: collectTags(stops),
      nextId: nextStopId(stops),
      drafts: Object.fromEntries(DRAFTS.map((d) => [d.neighborhood, d.source])),
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

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  const urlPath = parsedUrl.pathname;
  const query = parsedUrl.searchParams;

  if (urlPath === "/api/stops" && req.method === "GET") {
    try {
      return handleGetStops(res);
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

  const saveMatch = /^\/api\/stop\/([^/]+)$/.exec(urlPath);
  if (saveMatch && (req.method === "POST" || req.method === "PUT")) {
    try {
      return await handleSaveStop(req, res, decodeURIComponent(saveMatch[1]));
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
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
  console.log(`Escape DT stop editor: http://localhost:${port}/`);
  const draftList = DRAFTS.map((d) => `${d.rel} (${d.neighborhood} draft)`).join(" + ");
  console.log(`Editing: ${STOPS.rel} (live) + ${draftList}`);
  console.log("Local only — do not deploy. Ctrl+C to stop.");
});
