#!/usr/bin/env node
/**
 * Resize and recompress stop JPEGs in assets/stops/.
 * Overwrites files in place when the output is smaller (or dimensions shrink).
 *
 * Usage:
 *   node scripts/compress-stop-photos.mjs          # dry run (report only)
 *   node scripts/compress-stop-photos.mjs --write  # apply changes
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stopsDir = path.resolve(__dirname, "../assets/stops");
const write = process.argv.includes("--write");

/** Max long edge for detail/lightbox; enough for mobile retina. */
const MAX_EDGE = 1600;
/** JPEG quality — good balance for food/storefront photos on mobile. */
const QUALITY = 82;

function fmtBytes(n) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

const files = fs
  .readdirSync(stopsDir)
  .filter((f) => /\.jpe?g$/i.test(f))
  .sort();

if (!files.length) {
  console.log("No JPEGs found in assets/stops/");
  process.exit(0);
}

let beforeTotal = 0;
let afterTotal = 0;
let changed = 0;
let skipped = 0;

console.log(write ? "Compressing stop photos…" : "Dry run — pass --write to apply\n");

for (const name of files) {
  const filePath = path.join(stopsDir, name);
  const input = fs.readFileSync(filePath);
  const before = input.length;
  beforeTotal += before;

  const meta = await sharp(input, { failOn: "none" }).metadata();
  const needsResize =
    (meta.width && meta.width > MAX_EDGE) || (meta.height && meta.height > MAX_EDGE);

  const buffer = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer();
  const after = buffer.length;
  afterTotal += after;

  const shrink = after < before * 0.97 || needsResize;
  const tag = shrink ? (write ? "updated" : "would update") : "ok";

  if (shrink) {
    changed++;
    if (write) {
      const tmpPath = `${filePath}.tmp`;
      fs.writeFileSync(tmpPath, buffer);
      fs.renameSync(tmpPath, filePath);
    }
  } else {
    skipped++;
  }

  const dim = `${meta.width || "?"}×${meta.height || "?"}`;
  console.log(
    `${tag.padEnd(12)} ${name}  ${dim}  ${fmtBytes(before)} → ${fmtBytes(after)}`
  );
}

console.log("");
console.log(`Files: ${files.length}`);
console.log(`Before: ${fmtBytes(beforeTotal)}`);
console.log(`After:  ${fmtBytes(afterTotal)} (est.)`);
console.log(
  `Saved:  ${fmtBytes(Math.max(0, beforeTotal - afterTotal))} (${changed} file${changed === 1 ? "" : "s"} ${write ? "updated" : "to update"}, ${skipped} unchanged)`
);
if (!write && changed > 0) {
  console.log("\nRun with --write to apply.");
}
