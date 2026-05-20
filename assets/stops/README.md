# Stop photos

Name files to match each stop’s `slug` in `data/stops.json`:

```
assets/stops/kafkas-coffee.jpg
assets/stops/kafkas-coffee-2.jpg
assets/stops/kafkas-coffee-3.jpg
```

In JSON (first path is the hero thumbnail everywhere):

```json
"images": [
  "assets/stops/kafkas-coffee.jpg",
  "assets/stops/kafkas-coffee-2.jpg"
]
```

A single legacy field still works:

```json
"image": "assets/stops/kafkas-coffee.jpg"
```

Until photos exist, omit `images` / `image` and use `placeholderColor` (6-char hex, no `#`).

**Where galleries appear:** Step D picker tiles and Path 3 when a spot is expanded (arrows + dots when there are 2+ photos). Collapsed Path 3 tiles show the hero only.