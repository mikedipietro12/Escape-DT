# Escape DT — adding a location

> **Roadmap / not yet built — Hastings-Sunrise area.** When the user is ready to add Hastings-Sunrise locations, build the feature and add the locations *simultaneously*. Two parts:
> 1. **Horizontal (east-west) route map + single-area scoping** — full plan at `.cursor/plans/horizontal_route_map_+_single-area_725c1795.plan.md`. Commercial Drive's map is vertical (N-S); Hastings runs left-to-right (W-E). Single area at a time (no multi-area filtering).
> 2. **18 geocoded draft stops** already prepared in `data/hastings-sunrise-draft.json` (via `npm run enrich`). Pending: descriptions, photos, real cross streets, and a category/cost review (East End Billiards should be `hangout`; trim long Google names). These are NOT yet in `data/stops.json`.
>
> Enrich tooling: `npm run enrich -- <csv> --neighborhood hastings-sunrise` (Google Places key in `.env`). `hastings-sunrise` is already a valid id in `data/neighborhoods.json`.

**Source of truth:** `data/stops.json` (not inline data in `index.html`).

**Photos (optional at add time):** Stops appear on the site without photos. Until files exist, **omit** `images` / `image` and set `placeholderColor` (6-char hex, no `#`). When photos are ready, save under `assets/stops/<slug>.jpg` (hero), optional `<slug>-2.jpg`, `<slug>-3.jpg`, … and reference in JSON as `"images": ["assets/stops/<slug>.jpg", ...]`. A lone `"image"` path still works (treated as a one-item gallery). Keep `slug` stable so filenames match later.

**Preview locally:** run a static server from the repo root (required for `fetch`):

```bash
npx --yes serve .
```

(Or `python -m http.server 3000` if you have Python.)

Then open `http://localhost:3000/index.html` → **Explore Commercial Drive** → **See All Spots** to browse stops, or **See Pre-Built Plans** for curated routes. **Choose Your Own Adventure** is the build-your-own path.

Opening the HTML file directly (`file://`) will **not** load locations — you'll see a yellow banner at the top.

---

## Theme colours (UI)

Page backgrounds use a vertical fade: `linear-gradient(to bottom, var(--bg-top), var(--bg-bottom))` on `body` in [`index.html`](index.html). Set `--bg-top` and `--bg-bottom` per screen or theme.

**Fade endpoint colours** (canonical values for background gradients):

| Name | RGB | Hex |
|------|-----|-----|
| Yellow | `rgb(255, 238, 161)` | `#ffeea1` |
| Green | `rgb(178, 253, 181)` | `#b2fdb5` |
| Red | `rgb(253, 105, 108)` | `#fd696c` |
| Blue | `rgb(142, 220, 238)` | `#8edcee` |
| Orange | `rgb(255, 175, 100)` | `#ffaf64` |
| White | | `#ffffff` |

**CSS variables:** `--fade-top` and `--fade-bottom` on `:root` (set before paint by [`js/season-theme.js`](js/season-theme.js)). Gradients and `body.landing-active` use these vars; the lightest route-map leg colour follows `--fade-top`.

**Automatic year-round themes** (Northern hemisphere). Six calendar labels overlap; the app uses **half-month windows** (change on the **16th**) so every date has a top→bottom gradient. See `themeKeyFromDate` in `js/season-theme.js`.

| Calendar label | Half-month window | Fade (top → bottom) | `?season=` |
|----------------|-------------------|---------------------|------------|
| Dec – Feb | Dec 16 – Feb 15 | White → blue | `winter` |
| Feb – Apr | Feb 16 – Apr 15 | Blue → green | `thaw` |
| Apr – Jun | Apr 16 – Jun 15 | Green → yellow | `spring` |
| Jun – Sept | Jun 16 – Sep 15 | Yellow → orange | `summer` |
| Sept – Oct | Sep 16 – Oct 15 | Yellow → red | `autumn` |
| Oct – Dec | Oct 16 – Dec 15 | Red → blue | `late-fall` |

Logic lives in `js/season-theme.js` (loaded synchronously in `<head>` of `index.html`). `<html data-season="…">` reflects the active theme key.

**Preview locally:** `http://localhost:3000/index.html?season=summer` — keys: `winter`, `thaw`, `spring`, `summer`, `autumn`, `late-fall`. Invalid values fall back to the date-based theme.

**Hero mascot** on the landing page uses the same `?season=` override and half-month schedule. PNGs live in `assets/hero/` (`shy-winter`, `shy-spring`, `shy-summer`, `shy-fall`); `thaw` reuses winter, `late-fall` reuses fall until dedicated art exists. `season-theme.js` sets `data-hero-logo` on `<html>` before paint; the landing `<img id="hero-logo">` reads it via an inline script (no flash). Regenerate transparent PNGs from source art: `powershell -File scripts/process-hero-logos.ps1`.

### Hero speech bubble (prototype — not on landing yet)

Interactive prototype: `demo/hero-speech-bubble.html` (`npm run dev` → `/demo/hero-speech-bubble.html`). Assets: `demo/hero-speech-bubble.css`, `demo/hero-speech-bubble.js`.

**Approved tuning** (copy into landing CSS/JS when implementing): [`demo/hero-speech-bubble-tuning.json`](demo/hero-speech-bubble-tuning.json)

| Setting | Value | CSS variable |
|---------|-------|----------------|
| Tail Y (points at mouth) | `46px` | `--tail-y` |
| Bubble vertical offset | `18px` | `--bubble-offset-y` |
| Gap to mascot | `-12px` | `--bubble-gap` |
| White background opacity | `0.15` | `--bubble-bg-opacity` |

The demo also persists slider tweaks in `localStorage` (`hero-speech-bubble-tuning`); **Reset tuning** restores the approved JSON defaults above.

---

## Home page areas

The landing screen in [`index.html`](index.html) is two levels:

1. **Area cards** — e.g. **Explore Commercial Drive** (same tile style as path cards).
2. **Path cards** — shown after choosing an area; today all three paths are Commercial Drive only.

**Source of truth:** [`data/areas.json`](data/areas.json) (not inline in `index.html`).

| Field | Notes |
|--------|--------|
| `areaOrder` | Array of area ids — order on the home screen |
| `areas[id].title` | Card headline (e.g. `Explore Commercial Drive`) |
| `areas[id].label` | Subtitle under the title |
| `areas[id].paths[]` | Path menu for that area |
| `paths[].start` | `path1` → Choose Your Own Adventure, `path2` → Pre-Built Plans, `path3` → See All Spots |
| `paths[].title`, `paths[].label` | Path card copy |

**Navigation:** **Start Over** returns to the area list. **Back** from a path’s first step (or Path 3) returns to that area’s path menu, not the area list.

**Adding a new area (later):** append id to `areaOrder`, add an `areas` entry with its own `paths` array. Set `areas[id].neighborhood` to the matching id in `data/neighborhoods.json` (e.g. `hastings-sunrise`) so the app can filter stops and respect `usesSkytrainStation: false` (no SkyTrain walk minutes, no station on the route map, no “start/end at station” prompts). When stops belong to multiple neighborhoods, tag stops (e.g. `neighborhood`) and filter in the app loader — not implemented yet; all stops/plans are Commercial Drive.

**Stops and plans:** still in [`data/stops.json`](data/stops.json) and [`data/plans.json`](data/plans.json). New locations default to Commercial Drive (`neighborhood: "commercial"`) until multi-area filtering exists.

### Neighborhood ids (data-only, UI unchanged for now)

**Canonical list:** `data/neighborhoods.json`

When you add stops outside Commercial Drive, set `neighborhood` to one of these ids:

- `commercial` (live)
- `hastings-sunrise` (Hastings-Sunrise / East Village — draft)
- `mount-pleasant` (Mount Pleasant — draft)
- `chinatown` (Chinatown — draft)

Draft neighborhoods are staged in their own `data/<id>-draft.json` file (not loaded by the live app). Enrich them straight from a list of place names: `npm run enrich -- <list.txt> --neighborhood <id> --write`.

**SkyTrain distance:** `data/neighborhoods.json` may set `"usesSkytrainStation": false` (Hastings-Sunrise does). Those stops **omit** `walkFromStation`; the admin editor hides the field and the live app must not show “min from Commercial-Broadway Skytrain” on cards or use station-based route start/end when that area ships. Commercial Drive keeps `walkFromStation` and station anchors.

**Validation:** run `npm run test:data` to verify every stop’s `neighborhood` is in `data/neighborhoods.json`.

---

## SEO build (before deploy)

**Config:** `seo.config.json` (site URL, meta copy, `pilotSpotSlugs` for static spot pages).

**Command** (from repo root):

```bash
npm run build
```

This runs `scripts/build-seo.mjs` and:

- Writes `robots.txt` and `sitemap.xml` at the repo root
- Regenerates the `<!-- build:seo-head -->` block in `index.html` (meta, Open Graph, JSON-LD)
- Regenerates `spots/<slug>/index.html` for each slug in `pilotSpotSlugs`
- Regenerates `plans/<plan-key>/index.html` for each key in `seoPlanSlugs` (from `data/plans.json`)

**When to run:** After changing `seo.config.json`, `data/stops.json` (descriptions/names for pilot spots), `data/plans.json` (for SEO plan pages), or when adding a slug to `pilotSpotSlugs` / `seoPlanSlugs`. Commit the generated files with your deploy.

**Adding more static spot pages:** append the new stop’s `slug` to `pilotSpotSlugs` in `seo.config.json` (currently all stops in `data/stops.json`), then `npm run build`. The interactive app (`index.html`) is unchanged unless you add deep links later.

**Adding a crawlable pre-built plan page:** add the plan to `data/plans.json`, append its key to `seoPlanSlugs`, then `npm run build` → `/plans/<plan-key>/` (story + stop list; links to `/spots/<slug>/` when the stop is in `pilotSpotSlugs`).

---

## Shared route links (in-app)

After **Finalize** on Step E (or on a pre-built plan), **Share with a friend** copies or shares a URL that reopens the same visit order in the interactive app.

**Query parameters** (on `index.html`):

| Param | Meaning |
|--------|---------|
| `route` | Comma-separated stop ids in visit order (required), e.g. `route=s1,s4,s19` |
| `rs` | Route start: omit or `station` (default); `first` = start at first stop |
| `re` | Route end: omit or `station` (default); `last` = end at last stop |
| `plan` | Optional pre-built plan key when sharing a customized Path 2 route, e.g. `plan=world-cup-day` |

Example: `https://explore.seasonsofeastvan.com/?route=s3,s1,s19&rs=station&re=station`

**Notes:** Links break if a stop id is removed from `data/stops.json`. Renaming stops does not change ids (`s1`, `s2`, …). **Save as PDF** opens a compact one-page print layout (map + numbered stop list side by side) via the browser print dialog — choose Save as PDF there.

---

## When the user says "add a new location"

**Descriptions:** Leave `description` empty (`""` or omit the field). Do **not** invent or paste marketing copy — the user writes descriptions in their own voice (admin **Fill info** wizard, or later). If they paste a description in the request, use it; otherwise skip the field.

Collect or infer each field below. Copy `data/stop-template.json` for structure.

| Field | Who provides | Notes |
|--------|----------------|-------|
| `slug` | You / user | kebab-case; stable name for future photo files |
| `name` | User | Display name |
| `categories` | User / you | **Required.** 1–3 browse filters: `coffee`, `food`, `drinks`, `shopping`, `hangout`, `groceries`. Used by Path 1 (build route) and Path 3 category filters. |
| `tags` | User | **Descriptive only** — cuisine, vibes, service style (`sit down`, `grab and go`, `take out`, `vintage`, `patio`, …). Shown as chips on cards; Path 1 Step D filters (see below) and Path 3 style/vintage filters. **Do not** put canonical category values here — use `categories` instead. |
| `cost` | User | Single: `"$"`, `"$$"`, or `"$$$"`. Range: `{ "min": "$", "max": "$$$" }` or `["$", "$$$"]` (editorial, not Google) |
| `timeOfDay` | User | `morning`, `afternoon`, `evening`, and/or `allday` |
| `description` | User only | **Agent leaves empty** unless the user supplied copy in the request |
| `goto` | User | **Optional.** What you usually order/grab here. Rendered as a **My go-to:** line under the description (app cards + static spot pages). Bulk-fill existing stops with `npm run gotos`. |
| `crossStreet` | User or Google | Map label on the illustrated route and cards. For **Victoria** (east of Commercial), include the word **Victoria** (e.g. `Victoria & Grant`) so the route map places the stop east of the spine — see **Victoria (off-Commercial)** below |
| `images` | User (later) | **Optional at insert.** Add when photo files exist under `assets/stops/`. First path is the hero thumbnail. Legacy single `image` still supported. |
| `lat`, `lng` | Google Maps link / Places API | From share URL or place search |
| `googlePlaceId` | Google | Optional; for future enrich script |
| `walkFromStation` | Google Directions (later) or estimate | Minutes walking from station. **Omit** when the stop’s neighborhood has `usesSkytrainStation: false` (e.g. Hastings-Sunrise) |
| `coords.x` | Usually `150` | Optional. **Route map** east–west: `150` = Commercial spine; `~175` = east (Victoria). If omitted and `crossStreet` contains `Victoria`, the app uses the east column automatically |
| `coords.y` | You | **Browse / geographic sort** only (not route-map north–south). Higher y = closer to station (see existing stops). Route map **Y** uses `walkFromStation` |
| `id` | You | Next `sN` id (read highest in `data/stops.json`) |
| `placeholderColor` | You | **Required when no photos.** 6-char hex **without** `#`. Pick distinct values when adding many stops. |

**Do not** scrape Google Maps HTML. Use Places API in a future `scripts/enrich-from-google` step, or manual lat/lng from the user's link.

**After adding:** remove `"_test": true` entries when the user confirms. Delete test stop `s13` when replacing with a real place.

### Path 1 Step D filter tags

Path 1 “Choose” screens filter by **exact tag strings** (case-insensitive match). Use these when they apply:

| Category | Filter tags |
|----------|-------------|
| Coffee | `sit down`, `grab and go`, `cookies` |
| Drinks | `sit down`, `patio`, `tvs`, `cocktails`, `beer` |
| Food | `sit down`, `grab and go` — plus any other tag on food stops for **Cuisine** (cuisine/vibe; not categories) |
| Hangout | `shops`, `art gallery`, `activities`, `park` (Parks button hidden until a hangout stop has `park`) |
| Shopping / groceries | no Step D filters |

Multi-category stops share one `tags` array — include tags needed for every category the stop uses.

### Victoria (off-Commercial)

Spots on **Victoria Street** (east of Commercial Drive) still use `neighborhood: "commercial"`. They are part of the Commercial Drive experience but not on the Drive itself.

| Field | Victoria-side stops |
|--------|---------------------|
| `crossStreet` | Include **Victoria** in the label, e.g. `Victoria & Grant`, `Victoria & Georgia`. Do **not** use bare `Grant` / `E Georgia` (those are Commercial-side labels at the same latitude). |
| `lat`, `lng` | Pin on **Victoria** from the user’s Google Maps link (lng is less negative / farther east than Commercial addresses at the same corner). |
| `walkFromStation` | Walking minutes from station (often slightly more than a Commercial storefront at the same cross street). Drives **Y** on the illustrated route map. |
| `coords.y` | Match latitude band of peers: Grant area ~351–372, Georgia area ~188 (see existing stops in `data/stops.json`). |
| `coords.x` | Optional override (`~175`). Omit if `crossStreet` already contains `Victoria` — the app detects it and draws the stop east of the centerline. |

**Illustrated route map:** legs to or from Victoria use an **L-shape** — travel north/south on the Commercial spine (`MAP.xCenter`), then a **90° turn east** onto Victoria (or west back to the spine when leaving). Victoria-to-Victoria legs stay on the east column. Walk distances still come from real `lat`/`lng`.

---

## Bulk add (photos later)

Use when the user pastes many locations at once (no photos yet). Fill-in template: `data/bulk-stops-template.md`.

| Step | Who | Action |
|------|-----|--------|
| 1 | User | Build a doc using the bulk block format below; include a Google Maps link per stop |
| 2 | User | Paste the full doc in chat (or attach `.md` / `.txt`) |
| 3 | Agent | Read `data/stops.json`; assign sequential `id`s after the highest `sN` |
| 4 | Agent | Per entry: valid JSON object, `slug` (kebab-case, stable for future photos), `lat`/`lng` from Maps link, `coords.y` from latitude band (~195 south to ~535 north). `coords.x` usually `150` on Commercial; omit or `~175` for Victoria if `crossStreet` includes `Victoria`. Unique `placeholderColor`. **Omit or `""` for `description`** unless the user provided text in that block |
| 5 | Agent | **Do not** add `images` / `image` until files exist in `assets/stops/` |
| 6 | User | Preview via `npx serve .` → Explore Commercial Drive → See All Spots |
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
Description: [optional — you fill in later]
Optional: walk minutes from station
---
```

**Per stop minimum from user:** Maps link, name, **categories** (1–3), cost, time of day, cross street. **Optional:** descriptive tags, walk minutes, description (if provided, use it; otherwise leave empty). **Agent fills:** `id`, `coords`, `placeholderColor`, `slug` if omitted. **Agent does not fill:** `description` (unless user supplied). **Skip until later:** `images`, photo files, `googlePlaceId`.

---

## Pre-built plans (Path 2)

**Source of truth:** `data/plans.json` (not the inline `PLANS` object in `index.html`).

Each plan references **stop IDs** from `data/stops.json` only (`"s1"`, `"s2"`, …). Do not duplicate location fields in plans.

| Field | Notes |
|--------|--------|
| Plan key | Stable id in `plans` object (e.g. `quick-sip-shop`); listed in `planOrder` for picker order |
| `title` | Experience name (headline on cards and plan view) |
| `duration` | Time guide under the title (e.g. `"45 mins"`, `"1.5–2 hours"`, `"All day"`) |
| `description` | Optional; **short teaser** (1–2 sentences) on picker cards only |
| `introduction` | Optional; **full narrative** on plan detail (multi-paragraph; `introduction` or fallback to `description`). Keep for SEO static pages even when `narrative` is set. |
| `narrative` | Optional; **interleaved story + cards** on the interactive plan screen (see below). Plans without it use a single `introduction` block. |
| `stops` | Ordered array of stop IDs — **visit order** = map order and walk totals |

**`narrative` (Path 2 detail):** array of segments that alternate prose and removable stop cards as the user reads. Removing a card (inline or in the route list below) updates `stops` for the map and totals. All plans in `planOrder` should include `narrative` when authoring new or updating existing plans.

| Segment `type` | Fields | Notes |
|----------------|--------|--------|
| `prose` | `text` | One paragraph of guide copy (escaped in the app). Stays visible if the user removes a nearby stop. |
| `stops` | `ids` | Array of stop IDs — renders one removable route card per id still in the active route. Group related stops (e.g. pizza + park). Every id here should appear in `stops`; ids in `stops` but not in `narrative` still appear on the map only (e.g. Victoria Park on a Victoria walk). |

Example:

```json
"narrative": [
  { "type": "prose", "text": "Walk north on Victoria…" },
  { "type": "stops", "ids": ["s32"] },
  { "type": "prose", "text": "Head back to Commercial for pizza…" },
  { "type": "stops", "ids": ["s19", "s34"] }
]
```

**`planOrder`:** array of plan keys — controls the order of cards on Path 2.

**Curation tips (by duration, not title):**

- **~45 min:** 3–4 stops, mostly `walkFromStation` ≤ 15
- **~1 hr:** 4 stops, south / mid cluster
- **~1.5–2 hr:** 5–6 stops, coffee + shop + lunch
- **All day:** 8+ stops; coffee, shop, lunch, activity (gallery/vintage), dinner; order geographically (higher `coords.y` = closer to station when walking up the Drive)

**Preview:** `npx --yes serve .` → **Explore Commercial Drive** → **See Pre-Built Plans** → pick an experience.

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
| `description` | User | Short picker teaser (1–2 sentences) |
| `introduction` | User | Multi-paragraph plan intro on detail screen; agent can **extract stop names** from prose |
| Stops | User | **Ordered list** of stop **names** (or `sN` ids), or implied by introduction; visit order = array order |
| Vibe notes | User (optional) | e.g. "less walking", "more vintage", "skip dinner" |

**Agent:** read introduction (and optional explicit `Stops in order:` line); map names → ids from `data/stops.json`; reorder geographically if prose order is thematic but not walk order; write `data/plans.json` only (`introduction`, `description`, `stops`).

**Do not** add new locations in a plan-only request — if a stop is missing, say so and offer to add it via the location workflow first.

**Copy-paste prompt for the user:**

```
Update pre-built plan.

Plan: quick-sip-shop

Title: Quick Sip & Shop
Duration: 45 mins
Description: [short teaser for the picker card]

Introduction:
[Multi-paragraph narrative in your voice — mention places you want on the route]

Stops in order (visit order, optional if clear from introduction):
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

## Stop editor (local "back end" page)

A friendly browser editor for stop data, instead of hand-editing JSON or running the CLI. **Local only — never deploy it** (it writes to disk).

```bash
npm run admin
```

Then open the printed `http://localhost:3001/`. It runs on its own port (3001) so it can coexist with `npm run dev` (3000).

**What it edits:**

- Loads `data/stops.json` (live) **plus every draft file** (`data/hastings-sunrise-draft.json`, `data/mount-pleasant-draft.json`, `data/chinatown-draft.json`) into one searchable list. Each stop is tagged `live` or `draft`.
- Saves each stop back to **its own file**, routed by `neighborhood`: `hastings-sunrise` → Hastings draft, `mount-pleasant` → Mount Pleasant draft, `chinatown` → Chinatown draft; everything else → `stops.json`. (Changing a stop's neighborhood moves it between files automatically.) This keeps not-yet-live neighborhoods out of the app until the horizontal route-map / multi-area feature ships.
- **Adding another draft neighborhood later:** create `data/<id>-draft.json` (`{ "_note": "…", "stops": [] }`) and add an entry to the `DRAFTS` array in `scripts/admin-server.mjs` (and `DRAFT_FILES` in `scripts/enrich-from-google.mjs`).
- File formatting is preserved (`stops.json` 4-space, draft 2-space) and per-stop meta (`_review`, `_googleTypes`) plus top-level keys (`station`, `version`, `_note`) are kept intact.

**Features:** search + neighborhood filter + a **Needs info** filter (flags empty description/tags, missing `walkFromStation` on SkyTrain neighborhoods only, or remaining `_review` items) so the 18 Hastings drafts are easy to work through; a full form for every editorial field (name, slug, categories, tags, cost single/range, time of day, description, `goto`, cross street, walk minutes when applicable, `coords`, lat/lng, placeholder color, image paths); a live card preview; and an **+ Add stop** button that assigns the next `sN` id.

**Guided "Fill info" wizard:** a per-stop **Fill** button (and a header **Fill info** button that runs through the whole filtered list) opens a step-by-step modal that shows **only the fields still missing** for that stop — one at a time, in the order tags, cost, time of day, categories, cross street, walk, description, go-to, images. A field counts as "missing" if it is empty **or** still listed in the stop's `_review` array; saving removes reviewed items from `_review`. You can **Save** at any step, **Skip** a field, or **Back** up. Finishing a stop saves it and automatically advances to the next stop that still needs info, so you can rip through the whole Hastings backlog in one pass.

**Photos:** the `images` field takes comma-separated paths, **and** the editor now has an uploader. Drag & drop (or pick) one or more image files in the **Upload photos…** zone under the Images field: each file is written to `assets/stops/` named after the stop's `slug` (`<slug>.jpg` hero, then `<slug>-2.jpg`, `<slug>-3.jpg`, … filling the next free slot), and the saved paths are appended to the `images` field. The uploader needs a `slug` (it derives one from the name if empty). Thumbnails show the current gallery; the **×** removes a path from the list (it does **not** delete the file on disk). Uploading writes the file immediately, but you still need to **Save** the stop to persist `images` into the JSON. You can also still drop files under `assets/stops/` by hand (see below).

After editing, run `npm run build` if you want the static `/spots/<slug>/` pages refreshed. The `npm run gotos` CLI still exists but the editor supersedes it.

---

## "My go-to:" notes (what you usually order)

Each stop can carry an optional **`goto`** string in `data/stops.json` — the thing you usually order or grab there. It renders as a bold **My go-to:** line under the description on the build-route tiles, expandable route cards, See-All-Spots detail, and static `/spots/<slug>/` pages. Leave it off to hide the line.

**Bulk-fill across every stop (interactive):**

```bash
npm run gotos            # walk through all stops
npm run gotos -- --missing   # only stops without a goto yet
```

Per stop: **Enter** keeps/skips, type text to set, `-` clears, `q` saves & quits. Progress saves to `data/stops.json` after each entry (`goto` is placed right after `description`).

After filling them in, run `npm run build` to refresh the static spot pages.

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
- Description: [optional — add when ready]

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
Description: [optional — add when ready]
Optional: walk minutes from station
---
(repeat for each stop)
```

---

## Checklist for the agent

1. Read `data/stops.json` and pick the next `id` (`s15`, `s16`, … after the highest existing).
2. Add new object(s) to the `stops` array (valid JSON) with **`categories`** (1–3) and optional descriptive **`tags`**. **Do not** set `description` unless the user included it in the request (otherwise omit or `""`).
3. **Photos:**
   - **(A) Placeholder only (bulk or no photos yet):** set `placeholderColor` only; omit `images` / `image`. Do not reference files that do not exist.
   - **(B) Photos ready:** save file(s) to `assets/stops/<slug>.jpg` (and `-2`, … if multiple); set `images` (or legacy `image`).
4. Set `coords.y` between ~195 (south/Venables) and ~535 (north/Broadway) consistent with `lat`. Victoria-side: `crossStreet` includes `Victoria` (or `coords.x` ~175); pin `lat`/`lng` on Victoria.
5. Tell user to preview via `npx serve .` → Explore Commercial Drive → See All Spots (and category pickers, e.g. Coffee).
6. **Bulk:** process all `---` blocks in one edit; assign unique `placeholderColor` per stop.
7. Remove `_test` flag and test entries when done.