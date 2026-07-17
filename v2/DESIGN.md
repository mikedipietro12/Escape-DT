# v2 experience — design brief

North star for the parallel rebuild. Production app remains [`index.html`](../index.html); this doc governs [`v2/`](.) only.

## Vision

**One single page** — not Path 1 / 2 / 3. Users browse an editorial magazine surface, drag stops onto a central animated route map, and build a shareable walk.

### Core interaction

1. **Browse** — small **square tiles** (~76px) on a **white field**, surrounding the central map (FULL magazine reference).
2. **Hover** — subtle scale on tiles.
3. **Drag** — drag a tile onto the map → stop joins the route → map animates new leg(s).
4. **Route** — numbered stops on the map; optional route list panel (later).

#### FULL layout (page shell — primary, implemented)

- Pure **white background** — no seasonal gradient in v2
- **Small square tiles** — photo, `No. N`, name, cross street + cost
- Map **centered**; tiles in nw/n/ne/w/e/sw/s/se regions (denser on left/right)
- Magazine chrome: kicker, serif title, uppercase metadata

#### TILES layout (deferred — featured stops)

- Dark header bar, hero photo, bio/quote blocks
- Use for highlighted stops after compact grid ships

### Map

- **Role:** Central hero — animated illustrated hybrid route map (same spine/L-shape language as today).
- **Placement:** Centered — [`v2/index.html`](index.html) and [`demo/layout-mock.html`](demo/layout-mock.html).
- **Incremental adds:** Drop tile → append stop → animate only new segment(s) (extends current `drawMap` contract).

## Reuse / adapt / replace

| Layer | Decision | Notes |
|-------|----------|-------|
| `data/stops.json`, `plans.json`, `neighborhoods.json` | **Reuse** | Same fetch paths from repo root |
| `assets/stops/` | **Reuse** | Hero images + placeholder colors |
| Illustrated map modules (`js/*-map.js`, `commercial-hybrid-map-core.js`) | **Reuse + extend** | [`v2/js/map-bridge.js`](js/map-bridge.js); incremental route TBD |
| Map CSS | **Adapt** | Shared [`css/route-map.css`](../css/route-map.css) extracted from live app |
| `season-theme.js` | **Reuse** | Leg colors + page gradients |
| Hero mascot / landing | **Replace** | Fold into single page or omit in v1 |
| App shell, tiles, drag-drop | **Replace** | All new in `v2/` |
| `areas.json` `paths[]` | **Ignore** | Path menu not ported; area title/order still useful |
| Tech stack | **Adapt** | Vanilla static for Phase 0–1; Vite when drag-drop + state grows |

## Tile data mapping (FULL compact)

| UI element | Stop field |
|------------|------------|
| `No. N` | Browse index or route order |
| Photo | `images[0]` or `placeholderColor` |
| Title | `name` |
| Blurb | `description` (truncated) |
| Fine print | `crossStreet`, `cost`, `tags`, `categories` |

## Open questions

- Map placement — pick from layout mock options
- Reorder on map vs add-only
- One neighborhood at a time vs switcher on same page
- `plans.json` as editorial spreads vs individual tiles only
- Mobile: tap-to-add fallback; grid collapse
- Share URLs: keep `?route=` shape for compatibility

## Phases

1. **Phase 0** — This doc, `AGENTS.md`, layout mock (`demo/layout-mock.html`)
2. **Phase 1** — `index.html` shell, `map-bridge.js`, preset route on map
3. **Phase 2** — Editorial grid from live data, hover, drag-to-map, incremental route
4. **Phase 3** — Cutover per [`CUTOVER.md`](CUTOVER.md)
