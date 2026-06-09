#!/usr/bin/env node
/**
 * Normalize stop tags across data files using scripts/tag-rules.mjs.
 *
 *   node scripts/cleanup-tags.mjs          # dry run
 *   node scripts/cleanup-tags.mjs --write  # apply changes
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeTags } from "./tag-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");

const FILES = [
  path.join("data", "stops.json"),
  path.join("data", "mount-pleasant-draft.json"),
  path.join("data", "chinatown-draft.json"),
  path.join("data", "hastings-sunrise-draft.json"),
];

let totalChanges = 0;

for (const rel of FILES) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;

  const raw = fs.readFileSync(abs, "utf8");
  const data = JSON.parse(raw);
  const indent = rel.endsWith("stops.json") ? 4 : 2;
  let fileChanges = 0;

  for (const stop of data.stops || []) {
    const before = [...(stop.tags || [])];
    const after = normalizeTags(before, stop.categories || []);
    const same =
      before.length === after.length &&
      before.every((t, i) => t.toLowerCase() === after[i]?.toLowerCase());
    if (!same) {
      fileChanges += 1;
      totalChanges += 1;
      console.log(`  ${stop.id} "${stop.name}"`);
      console.log(`    − ${before.join(", ") || "(none)"}`);
      console.log(`    + ${after.join(", ") || "(none)"}`);
      if (write) stop.tags = after;
    }
  }

  if (fileChanges) {
    console.log(`${rel}: ${fileChanges} stop(s) updated`);
    if (write) {
      fs.writeFileSync(abs, `${JSON.stringify(data, null, indent)}\n`, "utf8");
    }
  }
}

if (!totalChanges) {
  console.log("No tag changes needed.");
} else if (!write) {
  console.log(`\n${totalChanges} stop(s) would change. Re-run with --write to apply.`);
} else {
  console.log(`\nWrote ${totalChanges} stop(s).`);
}
