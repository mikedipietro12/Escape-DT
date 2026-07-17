# v2 rebuild — agent rules

> **Production app:** [`index.html`](../index.html) at repo root — **do not edit** during v2 work except urgent production fixes.
>
> **Data workflows** (add stops, enrich, admin, SEO): still follow root [`AGENTS.md`](../AGENTS.md).
>
> **Design north star:** [`DESIGN.md`](DESIGN.md)

## Scope

| Path | Role |
|------|------|
| `v2/` | New single-page experience (editorial tiles + central map + drag-to-add) |
| `data/` | Shared JSON — read only from v2; write via admin/enrich as today |
| `js/*-map.js`, `js/commercial-hybrid-map-core.js` | Shared map modules — prefer reuse via [`js/map-bridge.js`](js/map-bridge.js) |
| `css/route-map.css` | Shared map styles (extracted from live app) |
| `demo/` | Map/hero sandboxes — unchanged unless promoting stable pieces |
| `index.html` | **Frozen** until cutover ([`CUTOVER.md`](CUTOVER.md)) |

## UX rules

- **Not path-based** — no Path 1/2/3, no `showStep()` port from `index.html`.
- **Single page** — FULL editorial grid + central animated map.
- **Tiles first:** FULL compact (`No.` + photo + title + blurb + metadata). TILES editorial variant is deferred.
- **Interaction:** hover on tiles; drag tile onto map to add stop; map extends route animation.
- **Descriptions:** Do not invent stop copy — same as root AGENTS.md.

## Map

- Reuse hybrid SVG maps through `map-bridge.js`.
- Commercial draw uses `globalThis.CommercialMapDraw` from [`demo/commercial-map-prototype.js`](../demo/commercial-map-prototype.js) until extracted to `js/commercial-hybrid-map-draw.js`.
- v2 needs **incremental route adds** (not yet implemented — full redraw via bridge today).
- Tune timing in `demo/commercial-hybrid-paths.html` / `demo/mount-pleasant-hybrid-paths.html`.

## Preview

```bash
npm run dev
```

- Live app: `http://localhost:3000/`
- v2 app: `http://localhost:3000/v2/`
- Layout mock: `http://localhost:3000/v2/demo/layout-mock.html`

Requires `http://` — not `file://`.

## When adding v2 code

1. Read `DESIGN.md` first.
2. Do not duplicate `data/` or map geometry.
3. New CSS lives under `v2/css/` except shared `css/route-map.css`.
4. Run `npm run test:data` if you change JSON (usually you won't from v2 UI work).
