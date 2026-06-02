import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const stopsPath = path.join(root, "data", "stops.json");

const onlyMissing = process.argv.includes("--missing");

function readStops() {
  return JSON.parse(fs.readFileSync(stopsPath, "utf8"));
}

// Re-serialize with goto placed right after description for tidy diffs.
function withGotoAfterDescription(stop, value) {
  const out = {};
  for (const [key, val] of Object.entries(stop)) {
    if (key === "goto") continue; // we re-add it in the right place
    out[key] = val;
    if (key === "description") out.goto = value;
  }
  if (!("description" in stop)) out.goto = value; // fallback if no description key
  return out;
}

function saveStops(data) {
  fs.writeFileSync(stopsPath, JSON.stringify(data, null, 4) + "\n");
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

function divider() {
  console.log("─".repeat(60));
}

async function main() {
  const data = readStops();
  const stops = Array.isArray(data.stops) ? data.stops : [];

  const queue = stops
    .map((stop, index) => ({ stop, index }))
    .filter(({ stop }) => (onlyMissing ? !(stop.goto && String(stop.goto).trim()) : true));

  if (!queue.length) {
    console.log(onlyMissing ? "Every stop already has a goto. Nothing to do." : "No stops found.");
    rl.close();
    return;
  }

  console.log(`\nAdding "My go-to:" notes to ${queue.length} stop(s).`);
  console.log("Enter = keep current / skip · type text = set · '-' = clear · 'q' = save & quit\n");

  for (let i = 0; i < queue.length; i++) {
    const { stop, index } = queue[i];
    const current = stop.goto ? String(stop.goto).trim() : "";

    divider();
    console.log(`[${i + 1}/${queue.length}] ${stop.name}  (${(stop.categories || []).join(", ")})`);
    if (stop.description) console.log(`  ${stop.description}`);
    if (current) console.log(`  Current goto: ${current}`);
    divider();

    const answer = (await ask("My go-to> ")).trim();

    if (answer.toLowerCase() === "q") {
      console.log("\nSaving and quitting…");
      break;
    }
    if (answer === "") {
      continue; // keep / skip
    }
    if (answer === "-") {
      data.stops[index] = withGotoAfterDescription(stop, "");
      delete data.stops[index].goto;
      saveStops(data);
      console.log("  cleared.");
      continue;
    }
    data.stops[index] = withGotoAfterDescription(stop, answer);
    saveStops(data);
    console.log("  saved.");
  }

  console.log(`\nDone. Wrote ${path.relative(root, stopsPath)}.`);
  console.log("Run `npm run build` to refresh static spot pages (optional).");
  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exitCode = 1;
});
