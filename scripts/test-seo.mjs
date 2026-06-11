import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.SEO_TEST_PORT) || 3457;

const config = JSON.parse(fs.readFileSync(path.join(root, "seo.config.json"), "utf8"));
const { stops } = JSON.parse(fs.readFileSync(path.join(root, "data", "stops.json"), "utf8"));
const plans = JSON.parse(fs.readFileSync(path.join(root, "data", "plans.json"), "utf8"));
const spotSlugs = stops.map((s) => s.slug).filter(Boolean);
const planKeys = plans.planOrder?.length
  ? plans.planOrder
  : config.seoPlanSlugs?.length
    ? config.seoPlanSlugs
    : Object.keys(plans.plans || {});

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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- file checks ---
assertIncludes(read("robots.txt"), "Sitemap: https://explore.seasonsofeastvan.com/sitemap.xml", "robots.txt sitemap URL");
assertIncludes(read("sitemap.xml"), "<loc>https://explore.seasonsofeastvan.com/</loc>", "sitemap homepage");

for (const slug of spotSlugs) {
  assertIncludes(
    read("sitemap.xml"),
    `<loc>https://explore.seasonsofeastvan.com/spots/${slug}/</loc>`,
    `sitemap ${slug}`
  );
}

for (const planKey of planKeys) {
  assertIncludes(
    read("sitemap.xml"),
    `<loc>https://explore.seasonsofeastvan.com/plans/${planKey}/</loc>`,
    `sitemap plan ${planKey}`
  );
  const plan = plans.plans?.[planKey];
  if (!plan) {
    fail(`plan missing in plans.json: ${planKey}`);
    continue;
  }
  const planPath = `plans/${planKey}/index.html`;
  if (!fs.existsSync(path.join(root, planPath))) {
    fail(`plan page file missing: ${planPath}`);
    continue;
  }
  const html = read(planPath);
  assertIncludes(html, `<h1>${escapeHtml(plan.title)}</h1>`, `${planKey} h1`);
  assertIncludes(html, "Build this route in the guide", `${planKey} CTA`);
  try {
    parseJsonLd(html);
    ok(`${planKey} JSON-LD parses`);
  } catch (e) {
    fail(`${planKey} JSON-LD parses — ${e.message}`);
  }
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

for (const slug of spotSlugs) {
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
  assertIncludes(spot, `<h1 class="choice-title">${escapeHtml(stop.name)}</h1>`, `${slug} h1`);
  assertIncludes(spot, "Add to route in guide", `${slug} CTA`);
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

const ogImageRel = (config.ogImage || "assets/logo.png").replace(/^\//, "");
const ogImageFile = path.join(root, ogImageRel.split("/").join(path.sep));
if (fs.existsSync(ogImageFile)) ok(`og image file exists (${ogImageRel})`);
else fail(`og image missing (${ogImageRel})`);

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
  [`/${ogImageRel}`, "og image"],
  ...spotSlugs.map((slug) => [`/spots/${slug}/`, `${slug} spot`]),
  ...planKeys.map((key) => [`/plans/${key}/`, `${key} plan`]),
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
console.log(`\n${checks.length - failed}/${checks.length} passed (${spotSlugs.length} spot pages, ${planKeys.length} plan pages)`);
process.exit(failed ? 1 : 0);
