import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const stopsDir = path.join(root, "assets", "stops");
const jsonPath = path.join(root, "data", "stops.json");

const RENAMES = [
  ["bar-corso2.jpg", "bar-corso-2.jpg"],
  ["belli-pizza1.jpg", "belli-pizza.jpg"],
  ["belli-pizza2.jpg", "belli-pizza-2.jpg"],
  ["belli-pizza3.jpg", "belli-pizza-3.jpg"],
  ["easy-shop1.jpg", "easy-shop-2.jpg"],
  ["havana1.jpg", "havana.jpg"],
  ["havana2.jpg", "havana-2.jpg"],
  ["loulas1.jpg", "loulas.jpg"],
  ["loulas2.jpg", "loulas-2.jpg"],
  ["loulas3.jpg", "loulas-3.jpg"],
  [
    "mediterranean-specialty-foods-turkish-market2.jpg",
    "mediterranean-specialty-foods-turkish-market-2.jpg",
  ],
  [
    "mediterranean-specialty-foods-turkish-market3.jpg",
    "mediterranean-specialty-foods-turkish-market-3.jpg",
  ],
  ["Mi-tierra.jpg", "mi-tierra.jpg"],
  ["Mi-tierra1.jpg", "mi-tierra-2.jpg"],
  ["mintage1.jpg", "mintage-2.jpg"],
  ["mintage2.jpg", "mintage-3.jpg"],
  ["mintage3.jpg", "mintage-4.jpg"],
  ["prado-cafe2.jpg", "prado-cafe-2.jpg"],
  ["prado-cafe3.jpg", "prado-cafe-3.jpg"],
  ["prado-cafe4.jpg", "prado-cafe-4.jpg"],
  ["sweet-cherubim2.jpg", "sweet-cherubim-2.jpg"],
  ["dont-argue-pizza1.jpg", "dont-argue-pizza-2.jpg"],
  ["arcade.jpg", "fun-haus.jpg"],
  ["vintage-sponsor1.jpg", "vintage-sponsor-2.jpg"],
  ["vintage-sponsor2.jpg", "vintage-sponsor-3.jpg"],
  ["vintage-sponsor3.jpg", "vintage-sponsor-4.jpg"],
];

const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const slugs = data.stops.map((s) => s.slug).sort((a, b) => b.length - a.length);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseFile(base) {
  for (const slug of slugs) {
    const re = escapeRe(slug);
    if (base.toLowerCase() === slug.toLowerCase()) return { slug, index: 0 };
    const m = base.match(new RegExp(`^${re}-(\\d+)$`, "i"));
    if (m) return { slug, index: parseInt(m[1], 10) };
    const m2 = base.match(new RegExp(`^${re}(\\d+)$`, "i"));
    if (m2) return { slug, index: parseInt(m2[1], 10) };
  }
  return null;
}

for (const [from, to] of RENAMES) {
  const src = path.join(stopsDir, from);
  const dest = path.join(stopsDir, to);
  if (!fs.existsSync(src)) {
    console.warn("skip rename (missing):", from);
    continue;
  }
  if (from.toLowerCase() === to.toLowerCase()) {
    // Windows: case-only renames need a temp hop (Mi-tierra.jpg -> mi-tierra.jpg).
    const tmp = path.join(stopsDir, `_tmp-${Date.now()}-${to}`);
    fs.renameSync(src, tmp);
    fs.renameSync(tmp, dest);
  } else {
    if (path.resolve(src) === path.resolve(dest)) continue;
    if (fs.existsSync(dest)) {
      throw new Error(`rename blocked, exists: ${to}`);
    }
    fs.renameSync(src, dest);
  }
  console.log("renamed:", from, "->", to);
}

const extRe = /\.(jpe?g|png|webp)$/i;
const bySlug = new Map();

for (const file of fs.readdirSync(stopsDir)) {
  if (!extRe.test(file)) continue;
  const base = file.replace(extRe, "");
  const parsed = parseFile(base);
  if (!parsed) {
    console.warn("unmatched file:", file);
    continue;
  }
  const rel = `assets/stops/${file}`;
  if (!bySlug.has(parsed.slug)) bySlug.set(parsed.slug, []);
  bySlug.get(parsed.slug).push({ index: parsed.index, rel });
}

for (const stop of data.stops) {
  const items = bySlug.get(stop.slug);
  if (!items?.length) continue;
  items.sort((a, b) => a.index - b.index);
  stop.images = items.map((x) => x.rel);
}

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 4) + "\n");
console.log("\nWired images for", bySlug.size, "stops");
for (const [slug, items] of [...bySlug.entries()].sort()) {
  console.log(" ", slug, "->", items.length, "photo(s)");
}
