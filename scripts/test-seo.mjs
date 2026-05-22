import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.SEO_TEST_PORT) || 3457;

const config = JSON.parse(fs.readFileSync(path.join(root, "seo.config.json"), "utf8"));
const { stops } = JSON.parse(fs.readFileSync(path.join(root, "data", "stops.json"), "utf8"));
const pilotSlugs = config.pilotSpotSlugs || [];

const checks = [];
function ok(msg) {
  checks.push({ pass: true, msg });
}
function fail(msg) {
  checks.push({ pass: false, msg });
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assertIncludes(haystack, needle, label) {
  if (haystack.includes(needle)) ok(label);
  else fail(`${label} — missing: ${needle}`);
}

function parseJsonLd(html) {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no ld+json script");
  JSON.parse(m[1]);
}

// --- file checks ---
assertIncludes(read("robots.txt"), "Sitemap: https://explore.seasonsofeastvan.com/sitemap.xml", "robots.txt sitemap URL");
assertIncludes(read("sitemap.xml"), "<loc>https://explore.seasonsofeastvan.com/</loc>", "sitemap homepage");

for (const slug of pilotSlugs) {
  assertIncludes(
    read("sitemap.xml"),
    `<loc>https://explore.seasonsofeastvan.com/spots/${slug}/</loc>`,
    `sitemap ${slug}`
  );
}

const index = read("index.html");
assertIncludes(index, 'name="description"', "index meta description");
assertIncludes(index, 'rel="canonical"', "index canonical");
assertIncludes(index, 'property="og:image"', "index og:image");
if (config.gaMeasurementId) {
  assertIncludes(index, config.gaMeasurementId, "index Google Analytics");
}
try {
  parseJsonLd(index);
  ok("index JSON-LD parses");
} catch (e) {
  fail(`index JSON-LD parses — ${e.message}`);
}

for (const slug of pilotSlugs) {
  const stop = stops.find((s) => s.slug === slug);
  if (!stop) {
    fail(`stop missing in stops.json: ${slug}`);
    continue;
  }
  const spotPath = `spots/${slug}/index.html`;
  if (!fs.existsSync(path.join(root, spotPath))) {
    fail(`spot page file missing: ${spotPath}`);
    continue;
  }
  const spot = read(spotPath);
  assertIncludes(spot, `<h1>${stop.name}</h1>`, `${slug} h1`);
  assertIncludes(spot, "Open interactive guide", `${slug} CTA`);
  if (config.gaMeasurementId) {
    assertIncludes(spot, config.gaMeasurementId, `${slug} Google Analytics`);
  }
  try {
    parseJsonLd(spot);
    ok(`${slug} JSON-LD parses`);
  } catch (e) {
    fail(`${slug} JSON-LD parses — ${e.message}`);
  }
}

const faviconTarget = path.join(root, "assets", "favicon.png");
if (fs.existsSync(faviconTarget)) ok("favicon file exists");
else fail("favicon file missing at assets/favicon.png");

const logo = path.join(root, "assets", "logo.png");
if (fs.existsSync(logo)) ok("og logo file exists");
else fail("assets/logo.png missing (OG image)");

// --- HTTP smoke test ---
function serve() {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".xml": "application/xml",
    ".txt": "text/plain",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".json": "application/json",
  };
  return http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = path.join(root, urlPath.replace(/^\//, ""));
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(fs.readFileSync(filePath));
  });
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      })
      .on("error", reject);
  });
}

const server = serve();
await new Promise((resolve) => server.listen(PORT, resolve));

const routes = [
  ["/", "homepage"],
  ["/robots.txt", "robots"],
  ["/sitemap.xml", "sitemap"],
  ["/assets/logo.png", "logo png"],
  ...pilotSlugs.map((slug) => [`/spots/${slug}/`, `${slug} spot`]),
];

for (const [route, label] of routes) {
  const { status, body } = await fetch(`http://127.0.0.1:${PORT}${route}`);
  if (status === 200) ok(`HTTP 200 ${label} (${route})`);
  else fail(`HTTP ${status} ${label} (${route})`);
  if (label === "homepage" && !body.includes('name="description"')) {
    fail("homepage missing meta description in response");
  } else if (label === "homepage") {
    ok("homepage serves meta description");
  }
}

server.close();

console.log("\nSEO test results:\n");
let failed = 0;
for (const c of checks) {
  console.log((c.pass ? "PASS" : "FAIL") + " — " + c.msg);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed (${pilotSlugs.length} pilot spots)`);
process.exit(failed ? 1 : 0);
