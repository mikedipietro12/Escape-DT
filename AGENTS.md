# Escape DT — adding a location

**Source of truth:** `data/stops.json` (not inline data in `index.html`).

**Photos (optional at add time):** Stops appear on the site without photos. Until files exist, **omit** `images` / `image` and set `placeholderColor` (6-char hex, no `#`). When photos are ready, save under `assets/stops/<slug>.jpg` (hero), optional `<slug>-2.jpg`, `<slug>-3.jpg`, … and reference in JSON as `"images": ["assets/stops/<slug>.jpg", ...]`. A lone `"image"` path still works (treated as a one-item gallery). Keep `slug` stable so filenames match later.

**Preview locally:** run a static server from the repo root (required for `fetch`):

```bash
npx --yes serve .
```

(Or `python -m http.server 3000` if you have Python.)

Then open `http://localhost:3000/index.html` → Path 3 ("See All Spots") to browse stops, or Path 2 ("See Pre-Built Plans") for curated routes.

Opening the HTML file directly (`file://`) will **not** load locations — you'll see a yellow banner at the top.

---

## When the user says "add a new location"

Collect or infer each field below. Copy `data/stop-template.json` for structure.

| Field | Who provides | Notes |
|--------|----------------|-------|
| `slug` | You / user | kebab-case; stable name for future photo files |
| `name` | User | Display name |
| `categories` | User / you | **Required.** 1–3 browse filters: `coffee`, `food`, `drinks`, `shopping`, `hangout`, `groceries`. Used by Path 1 (build route) and Path 3 category filters. |
| `tags` | User | **Descriptive only** — cuisine, vibes, service style (`sit down`, `grab and go`, `take out`, `vintage`, `patio`, …). Shown as chips on cards; Path 1 Step D filters (see below) and Path 3 style/vintage filters. **Do not** put canonical category values here — use `categories` instead. |
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

### Path 1 Step D filter tags

Path 1 “Choose” screens filter by **exact tag strings** (case-insensitive match). Use these when they apply:

| Category | Filter tags |
|----------|-------------|
| Coffee | `sit down`, `grab and go`, `cookies` |
| Drinks | `sit down`, `patio`, `tvs` |
| Food | `sit down`, `grab and go` — plus any other tag on food stops for **Cuisine** (cuisine/vibe; not categories) |
| Hangout | `shops`, `art gallery`, `activities`, `park` (Parks button hidden until a hangout stop has `park`) |
| Shopping / groceries | no Step D filters |

Multi-category stops share one `tags` array — include tags needed for every category the stop uses.

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
Categories: coffee, hangout
Tags (optional): patio, grab and go
Cost: $$
Time of day: morning, afternoon
Cross street: E 8th Ave
Description: [1-2 sentences]
Optional: walk minutes from station
---
```

**Per stop minimum from user:** Maps link, name, **categories** (1–3), cost, time of day, description, cross street. **Optional:** descriptive tags, walk minutes. **Agent fills:** `id`, `coords`, `placeholderColor`, `slug` if omitted. **Skip until later:** `images`, photo files, `googlePlaceId`.

---

## Pre-built plans (Path 2)

**Source of truth:** `data/plans.json` (not the inline `PLANS` object in `index.html`).

Each plan references **stop IDs** from `data/stops.json` only (`"s1"`, `"s2"`, …). Do not duplicate location fields in plans.

| Field | Notes |
|--------|--------|
| Plan key | Stable id in `plans` object (e.g. `quick-sip-shop`); listed in `planOrder` for picker order |
| `title` | Experience name (headline on cards and plan view) |
| `duration` | Time guide under the title (e.g. `"45 mins"`, `"1.5–2 hours"`, `"All day"`) |
| `description` | Optional; 1–2 sentences in your voice, shown on the plan detail screen |
| `stops` | Ordered array of stop IDs — **visit order** = map order and walk totals |

**`planOrder`:** array of plan keys — controls the order of cards on Path 2.

**Curation tips (by duration, not title):**

- **~45 min:** 3–4 stops, mostly `walkFromStation` ≤ 15
- **~1 hr:** 4 stops, south / mid cluster
- **~1.5–2 hr:** 5–6 stops, coffee + shop + lunch
- **All day:** 8+ stops; coffee, shop, lunch, activity (gallery/vintage), dinner; order geographically (higher `coords.y` = closer to station when walking up the Drive)

**Preview:** `npx --yes serve .` → **See Pre-Built Plans** → pick an experience.

**Checklist for the agent:**

1. Read `data/plans.json` and `data/stops.json`; every ID in `stops` must exist in `stops.json`.
2. Keep array order as the intended walking route (station → …).
3. Do not add `lat`/`lng` to plans — only IDs.

---

## When the user says "populate" or "update" a pre-built plan

Fill-in template: `data/plan-edit-template.md`.

| Field | Who provides | Notes |
|--------|----------------|-------|
| Plan | User | Key (`quick-sip-shop`) or title ("Quick Sip & Shop") |
| `title` | User | Only if changing the headline |
| `duration` | User | Shown under title on picker (e.g. `45 mins`) |
| `description` | User | 1–2 sentences — required for a good plan detail screen |
| Stops | User | **Ordered list** of stop **names** (or `sN` ids); visit order = array order |
| Vibe notes | User (optional) | e.g. "less walking", "more vintage", "skip dinner" |

**Agent:** map names → ids from `data/stops.json`; reorder geographically if the user’s list is thematic but not walk order; write `data/plans.json` only.

**Do not** add new locations in a plan-only request — if a stop is missing, say so and offer to add it via the location workflow first.

**Copy-paste prompt for the user:**

```
Update pre-built plan.

Plan: quick-sip-shop

Title: Quick Sip & Shop
Duration: 45 mins
Description: [your 1–2 sentences]

Stops in order (visit order):
1. [stop name] — [optional why / role in the plan]
2. [stop name]
3. [stop name]

Optional: stay near station / less walking / etc.
```

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
- Categories: coffee, hangout
- Tags (optional): patio, grab and go, greek
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
Categories: coffee, hangout
Tags: patio, grab and go
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
2. Add new object(s) to the `stops` array (valid JSON) with **`categories`** (1–3) and optional descriptive **`tags`**.
3. **Photos:**
   - **(A) Placeholder only (bulk or no photos yet):** set `placeholderColor` only; omit `images` / `image`. Do not reference files that do not exist.
   - **(B) Photos ready:** save file(s) to `assets/stops/<slug>.jpg` (and `-2`, … if multiple); set `images` (or legacy `image`).
4. Set `coords.y` between ~195 (south/Venables) and ~535 (north/Broadway) consistent with `lat`.
5. Tell user to preview via `npx serve .` → Path 3 and category pickers (e.g. Coffee).
6. **Bulk:** process all `---` blocks in one edit; assign unique `placeholderColor` per stop.
7. Remove `_test` flag and test entries when done.