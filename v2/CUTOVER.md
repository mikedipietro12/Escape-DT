# v2 cutover checklist

Run this when the new experience is ready to replace the live homepage. **Do not execute prematurely.**

## Pre-cutover

- [ ] v2 feature-complete per [`DESIGN.md`](DESIGN.md) (grid, drag-to-map, map animation, share/export)
- [ ] Mobile fallback tested (tap-to-add if drag unavailable)
- [ ] Share URL strategy decided (`?route=` compatibility or migration note)
- [ ] Side-by-side QA: `localhost:3000/` vs `localhost:3000/v2/`

## Cutover steps

1. **Backup** — tag or branch current `index.html` (e.g. `git tag pre-v2-cutover`).
2. **Replace entry point** — either:
   - Move v2 to root (`v2/index.html` → `index.html`, relocate assets), or
   - Redirect `/` → `/v2/` via host config (keeps old app at `/legacy/` if desired).
3. **SEO** — update [`seo.config.json`](../seo.config.json) meta copy if positioning changed.
4. **Build** — `npm run build` (regenerates `spots/`, `plans/`, sitemap, `index.html` SEO block).
5. **Test** — `npm run test:data` and `npm run test:seo`.
6. **Deploy** — commit generated SEO files with the cutover.
7. **Docs** — merge relevant `v2/AGENTS.md` rules into root `AGENTS.md` or keep v2 folder as archive.

## Post-cutover

- [ ] Remove or archive `comingSoon` hacks if any area was hidden for v1 only
- [ ] Update root `AGENTS.md` pointer (v2 is now production)
- [ ] Optional: keep `/v2/` redirect to `/` for bookmarked preview links

## Not in scope at cutover

- Static `/spots/<slug>/` and `/plans/<key>/` pages can stay as-is initially
- Admin (`npm run admin`) unchanged
- Hastings/Chinatown draft neighborhoods unchanged
