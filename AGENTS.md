# Escape DT — adding a location

**Source of truth:** `data/stops.json` (not the inline array in `commercial-drive.html`).

**Photos (optional at add time):** Stops appear on the site without photos. Until files exist, **omit** `images` / `image` and set `placeholderColor` (6-char hex, no `#`). When photos are ready, save under `assets/stops/<slug>.jpg` (hero), optional `<slug>-2.jpg`, `<slug>-3.jpg`, … and reference in JSON as `"images": ["assets/stops/<slug>.jpg", ...]`. A lone `"image"` path still works (treated as a one-item gallery). Keep `slug` stable so filenames match later.

**Preview locally:** run a static server from the repo root (required for `fetch`):

```bash
npx --yes serve .
```

(Or `python -m http.server 3000` if you have Python.)

Then open `http://localhost:3000/commercial-drive.html` → Path 3 ("Browse all spots") to see every stop including new ones.

Opening the HTML file directly (`file://`) will **not** load locations — you'll see a yellow banner at the top.

---

## When the user says "add a new location"

Collect or infer each field below. Copy `data/stop-template.json` for structure.

| Field | Who provides | Notes |
|--------|----------------|-------|
| `slug` | You / user | kebab-case; stable name for future photo files |
| `name` | User | Display name |
| `tags` | User | One or more: `coffee`, `food`, `drinks`, `shopping`, `hangout`, `groceries` |
| `cost` | User | Single: `"$"`, `"$$"`, or `"$$$"`. Range: `{ "min": "$", "max": "$$$" }` or `["$", "$$$"]` (editorial, not Google) |
| `timeOfDay` | User | `morning`, `afternoon`, `evening`, and/or `allday` |
| `description` | User | Their voice — required |
| `crossStreet` | User or Google | Map label on the illustrated route |
| `images` | User (later) | **Optional at insert.** Add when photo files exist under `assets/stops/`. First path is the hero thumbnail. Legacy single `image` still supported. |
| `lat`, `lng` | Google Maps link / Places API | From share URL or place search |
| `googlePlaceId` | Google | Optional; for future enrich script |
| `walkFromStation` | Google Directions (later) or estimate | Minutes walking from station |
| `coords.x` | Usually `150` | SVG map: fixed x along Commercial Dr |
| `coords.y` | You | SVG map: higher y = closer to station (see existing stops) |
| `id` | You | Next `sN` id (read highest in `data/stops.json`) |
| `placeholderColor` | You | **Required when no photos.** 6-char hex **without** `#`. Pick distinct values when adding many stops. |

**Do not** scrape Google Maps HTML. Use Places API in a future `scripts/enrich-from-google` step, or manual lat/lng from the user's link.

**After adding:** remove `"_test": true` entries when the user confirms. Delete test stop `s13` when replacing with a real place.

---

## Bulk add (photos later)

Use when the user pastes many locations at once (no photos yet). Fill-in template: `data/bulk-stops-template.md`.

| Step | Who | Action |
|------|-----|--------|
| 1 | User | Build a doc using the bulk block format below; include a Google Maps link per stop |
| 2 | User | Paste the full doc in chat (or attach `.md` / `.txt`) |
| 3 | Agent | Read `data/stops.json`; assign sequential `id`s after the highest `sN` |
| 4 | Agent | Per entry: valid JSON object, `slug` (kebab-case, stable for future photos), `lat`/`lng` from Maps link, `coords.x` usually `150`, `coords.y` from latitude band (~195 south to ~535 north, consistent with existing stops), unique `placeholderColor` |
| 5 | Agent | **Do not** add `images` / `image` until files exist in `assets/stops/` |
| 6 | User | Preview via `npx serve .` → Path 3 |
| 7 | Later | Add JPGs + `"images": ["assets/stops/<slug>.jpg", ...]` when ready |

**Bulk block format** (repeat per location, separated by `---`):

```markdown
---
Google Maps link: [paste]
Name: [business name]
Slug: [optional kebab-case; agent can derive from name if omitted]
Tags: coffee, hangout
Cost: $$
Time of day: morning, afternoon
Cross street: E 8th Ave
Description: [1-2 sentences]
Optional: walk minutes from station
---
```

**Per stop minimum from user:** Maps link, name, tags, cost, time of day, description, cross street. **Agent fills:** `id`, `coords`, `placeholderColor`, `slug` if omitted. **Skip until later:** `images`, photo files, `googlePlaceId`.

---

## Add photos to an existing stop

1. Save files as `assets/stops/<slug>.jpg` (and `-2`, `-3` if needed).
2. Add to that stop in `data/stops.json`: `"images": ["assets/stops/<slug>.jpg", ...]`.
3. `placeholderColor` can stay (fallback if a path breaks).

---

## Copy-paste prompt for the user

**Single stop:**

```
Add a new Commercial Drive stop.

Google Maps link: [paste]
Photos (optional — skip if adding later): [assets/stops/my-place.jpg, my-place-2.jpg, …]

My details:
- Tags: coffee, hangout
- Cost: $$
- Time of day: morning, afternoon
- Cross street label: E 8th Ave
- Description: [your 1-2 sentences]

Optional: walking minutes from station if you know it.
```

**Bulk stops (photos later):** copy blocks from `data/bulk-stops-template.md` or use:

```
Bulk add Commercial Drive stops (photos later).

---
Google Maps link: [paste]
Name: [business name]
Slug: [optional]
Tags: coffee, hangout
Cost: $$
Time of day: morning, afternoon
Cross street: E 8th Ave
Description: [1-2 sentences]
Optional: walk minutes from station
---
(repeat for each stop)
```

---

## Checklist for the agent

1. Read `data/stops.json` and pick the next `id` (`s15`, `s16`, … after the highest existing).
2. Add new object(s) to the `stops` array (valid JSON).
3. **Photos:**
   - **(A) Placeholder only (bulk or no photos yet):** set `placeholderColor` only; omit `images` / `image`. Do not reference files that do not exist.
   - **(B) Photos ready:** save file(s) to `assets/stops/<slug>.jpg` (and `-2`, … if multiple); set `images` (or legacy `image`).
4. Set `coords.y` between ~195 (south/Venables) and ~535 (north/Broadway) consistent with `lat`.
5. Tell user to preview via `npx serve .` → Path 3 and category pickers (e.g. Coffee).
6. **Bulk:** process all `---` blocks in one edit; assign unique `placeholderColor` per stop.
7. Remove `_test` flag and test entries when done.