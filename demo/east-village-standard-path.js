/**
 * East Village (Hastings-Sunrise) — standard path map + Step E cards.
 * Alternate map style: demo/east-village-curved-paths.js
 */

const WALK_SPEED_KMH = 5;

const HMAP = {
  ySpine: 130,
  yOffNorth: 88,
  yOffSouth: 172,
  xMin: 44,
  xMax: 556,
  defaultViewBox: "0 0 600 260",
  legDurationMs: 900,
  viewBoxPad: 20,
};

/** Angled street name at each dot — upper-right above spine, lower-right below (~45°). */
const LABEL = {
  angleDeg: 45,
  offset: 9,
};

const MAP_LEG_COLORS = ["#3d8f4a", "#52a362", "#6ab87a", "#84cc94", "#9ad4a8", "#ffeea1"];
const MAP_BACKWARD_COLOR = "#c9a227";

const PRESETS = {
  "west-east": {
    label: "West → East crawl (5 stops)",
    ids: ["s46", "s47", "s49", "s52", "s54"],
  },
  coffee: {
    label: "Coffee hop",
    ids: ["s46", "s47", "s60", "s52"],
  },
  evening: {
    label: "Evening out",
    ids: ["s53", "s57", "s58", "s54"],
  },
  park: {
    label: "Park + bites",
    ids: ["s46", "s55", "s50", "s52"],
  },
};

let allStops = [];
let currentRoute = [];
let mapAnimationGeneration = 0;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function placeholderImg(color) {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='100%25' height='100%25' fill='%23${color}'/%3E%3C/svg%3E`;
}

/** Paths in JSON are repo-root relative; this page lives under /demo/. */
function resolveAssetUrl(path) {
  if (!path || path.startsWith("data:") || path.startsWith("http") || path.startsWith("/")) {
    return path;
  }
  return `/${String(path).replace(/^\.\//, "")}`;
}

function hydrateStop(stop) {
  const color = stop.placeholderColor || "cccccc";
  const rawPaths =
    Array.isArray(stop.images) && stop.images.length
      ? stop.images
      : stop.image
        ? [stop.image]
        : [];
  const paths = rawPaths.map(resolveAssetUrl);
  const fallback = placeholderImg(color);
  const image = paths.length ? paths[0] : fallback;
  return { ...stop, image, images: paths.length ? paths : [fallback], placeholderFallback: fallback };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getWalkLeg(lat1, lng1, lat2, lng2) {
  const km = haversineKm(lat1, lng1, lat2, lng2);
  if (km < 0.001) return { km: 0, minutes: 0 };
  return { km, minutes: Math.max(1, Math.round((km / WALK_SPEED_KMH) * 60)) };
}

function formatKm(km) {
  return km < 1 ? km.toFixed(2) : km.toFixed(1);
}

function getSeasonFadeTop() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--fade-top").trim();
  return v || "#b2fdb5";
}

function getSeasonRouteColors() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--map-route-colors").trim();
  const colors = v.split(",").map((color) => color.trim()).filter(Boolean);
  return colors.length ? colors : [...MAP_LEG_COLORS, getSeasonFadeTop()];
}

function getMapBackwardColor() {
  const colors = getSeasonRouteColors();
  return colors[colors.length - 1] || MAP_BACKWARD_COLOR;
}

function getMapForwardColors() {
  const colors = getSeasonRouteColors();
  return colors.length > 1 ? colors.slice(0, -1) : colors;
}

function isOnHastingsSpine(stop) {
  const cs = String(stop.crossStreet || "").toLowerCase();
  if (/\b(hastings|e hastings)\b/.test(cs)) return true;
  if ((stop.tags || []).includes("park")) return false;
  return !/\b(triumph|franklin|pandora|nanaimo\s*&\s*franklin)\b/i.test(cs);
}

function isStopNorthOfSpine(stop) {
  return Number(stop.lat) > 49.2818;
}

function getStopMapY(stop) {
  if (isOnHastingsSpine(stop)) return HMAP.ySpine;
  return isStopNorthOfSpine(stop) ? HMAP.yOffNorth : HMAP.yOffSouth;
}

function isHastingsPart(part) {
  return /\bhastings\b/i.test(String(part || ""));
}

function isVerticalSpinePart(part) {
  return /\b(victoria|nanaimo)\b/i.test(String(part || ""));
}

function normalizeMapSideStreet(name) {
  const raw = String(name || "").trim();
  const key = raw.replace(/\./g, "").toLowerCase();
  if (key === "seminl" || key === "seminl dr") return "Semlin";
  return raw;
}

/**
 * Map label = visit number + one street name (Hastings stripped).
 * On the Hastings spine: the intersecting north–south street (Nanaimo, Semlin, …).
 * Off-spine (north/south of Hastings): the east–west side street where the venue sits
 * (Triumph, Franklin, Powell, …) — not Victoria/Nanaimo, which are vertical connectors.
 */
function mapLabelCrossStreet(crossStreet, stop) {
  const cs = String(crossStreet || "").trim();
  if (!cs) return "";
  const parts = cs.split("&").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return normalizeMapSideStreet(cs.length > 24 ? `${cs.slice(0, 22)}…` : cs);
  }

  const sideParts = parts.filter((p) => !isHastingsPart(p));
  if (!sideParts.length) return normalizeMapSideStreet(parts[0]);

  if (stop && !isOnHastingsSpine(stop)) {
    const horizontal = sideParts.find((p) => !isVerticalSpinePart(p));
    if (horizontal) return normalizeMapSideStreet(horizontal);
  }

  const vertical = sideParts.find((p) => isVerticalSpinePart(p));
  if (vertical) return normalizeMapSideStreet(vertical);

  return normalizeMapSideStreet(sideParts[0]);
}

/** Same lat/lng → one dot / one combined label (e.g. "1. & 3. Semlin"). */
function mapPositionKey(stop) {
  return `${Number(stop.lat).toFixed(6)},${Number(stop.lng).toFixed(6)}`;
}

function formatMapStopLabel(routeIndices, streetName) {
  const nums = routeIndices.map((i) => `${i + 1}.`);
  const numPart = nums.length === 1 ? nums[0] : nums.join(" & ");
  if (!streetName) return numPart;
  return `${numPart} ${streetName}`;
}

function attachMapLabelGroups(points) {
  const groups = new Map();
  points.forEach((p) => {
    const key = mapPositionKey(p.stop);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        indices: [],
        street: mapLabelCrossStreet(p.stop.crossStreet, p.stop),
        anchor: p,
      });
    }
    const group = groups.get(key);
    group.indices.push(p.idx);
    p.labelGroup = group;
  });
  points.forEach((p) => {
    p.isLabelAnchor = p.labelGroup.anchor === p;
  });
  return groups;
}

function assignLabelSides(points) {
  const sides = [];
  points.forEach((p, idx) => {
    let above = idx % 2 === 0;
    if (idx > 0 && Math.abs(p.x - points[idx - 1].x) < 52 && sides[idx - 1] === above) {
      above = !above;
    }
    sides.push(above);
  });
  return sides;
}

function layoutAngledLabels(points) {
  const sides = assignLabelSides(points);
  points.forEach((p) => {
    p.labelAbove = sides[p.idx];
    p.labelRotate = p.labelAbove ? -LABEL.angleDeg : LABEL.angleDeg;
    const rad = (p.labelRotate * Math.PI) / 180;
    p.labelX = p.x + LABEL.offset * Math.cos(rad);
    p.labelY = p.y + LABEL.offset * Math.sin(rad);
  });
}

function lngToX(lng, lngMin, lngMax) {
  const span = lngMax - lngMin || 1e-6;
  const t = (lng - lngMin) / span;
  return HMAP.xMin + t * (HMAP.xMax - HMAP.xMin);
}

function layoutHorizontalMapPoints(route) {
  const lngs = route.map((s) => s.lng);
  const lngMin = Math.min(...lngs);
  const lngMax = Math.max(...lngs);
  const lngPad = Math.max((lngMax - lngMin) * 0.12, 0.0008);
  const lo = lngMin - lngPad;
  const hi = lngMax + lngPad;

  const points = route.map((stop, idx) => ({
    stop,
    idx,
    x: lngToX(stop.lng, lo, hi),
    y: getStopMapY(stop),
  }));

  attachMapLabelGroups(points);
  layoutAngledLabels(points);

  return { points, lngBounds: { lo, hi } };
}

function isStopOffSpine(stop) {
  return !isOnHastingsSpine(stop);
}

function isMapLegBackward(x1, x2) {
  return x2 < x1;
}

function getHorizontalLegPathD(x1, y1, x2, y2, fromOffSpine, toOffSpine) {
  const spine = HMAP.ySpine;
  const onSpineY = (y) => Math.abs(y - spine) <= 10;

  if (toOffSpine && !fromOffSpine) {
    const parts = [`M ${x1} ${y1}`];
    if (!onSpineY(y1)) parts.push(`L ${x1} ${spine}`);
    if (Math.abs(x1 - x2) > 1) parts.push(`L ${x2} ${spine}`);
    parts.push(`L ${x2} ${y2}`);
    return parts.join(" ");
  }

  if (fromOffSpine && !toOffSpine) {
    const parts = [`M ${x1} ${y1}`, `L ${x1} ${spine}`];
    if (Math.abs(x1 - x2) > 1) parts.push(`L ${x2} ${spine}`);
    if (!onSpineY(y2)) parts.push(`L ${x2} ${y2}`);
    return parts.join(" ");
  }

  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function buildRouteLegs(route) {
  const legs = [];
  for (let i = 0; i < route.length - 1; i++) {
    legs.push({ fromStopIndex: i, toStopIndex: i + 1, legKind: "stopToStop" });
  }
  return legs;
}

function getRouteMapLayout(route) {
  const { points } = layoutHorizontalMapPoints(route);
  const routeLegs = buildRouteLegs(route);

  const legs = routeLegs.map((leg, i) => {
    const a = points[leg.fromStopIndex];
    const b = points[leg.toStopIndex];
    const fromOffSpine = isStopOffSpine(a.stop);
    const toOffSpine = isStopOffSpine(b.stop);
    return {
      ...leg,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      pathD: getHorizontalLegPathD(a.x, a.y, b.x, b.y, fromOffSpine, toOffSpine),
      legIndex: i,
      isBackward: isMapLegBackward(a.x, b.x),
    };
  });

  return { points, legs };
}

function estimateLabelBounds(point, text) {
  const len = Math.max(String(text).length * 5.5, 28);
  const rad = (point.labelRotate * Math.PI) / 180;
  const x0 = point.labelX;
  const y0 = point.labelY;
  const x1 = x0 + len * Math.cos(rad);
  const y1 = y0 + len * Math.sin(rad);
  return {
    minX: Math.min(x0, x1) - 4,
    maxX: Math.max(x0, x1) + 4,
    minY: Math.min(y0, y1) - 8,
    maxY: Math.max(y0, y1) + 8,
  };
}

function computeMapViewBox(points, legs) {
  const xs = [HMAP.xMin, HMAP.xMax];
  const ys = [HMAP.ySpine - 12, HMAP.ySpine + 22];
  const labelGroupsSeen = new Set();
  points.forEach((p) => {
    xs.push(p.x - 8, p.x + 8);
    ys.push(p.y - 8, p.y + 8);
    if (!p.isLabelAnchor || labelGroupsSeen.has(p.labelGroup.key)) return;
    labelGroupsSeen.add(p.labelGroup.key);
    const b = estimateLabelBounds(p, formatMapStopLabel(p.labelGroup.indices, p.labelGroup.street));
    xs.push(b.minX, b.maxX);
    ys.push(b.minY, b.maxY);
  });
  legs.forEach((leg) => {
    xs.push(leg.x1, leg.x2);
    ys.push(leg.y1, leg.y2);
  });
  if (!points.length) return HMAP.defaultViewBox;
  const pad = HMAP.viewBoxPad;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  return `${minX} ${minY} ${Math.max(maxX - minX, 200)} ${Math.max(maxY - minY, 100)}`;
}

function renderMapStaticSvg() {
  return `
    <line class="map-line map-spine" x1="${HMAP.xMin}" y1="${HMAP.ySpine}" x2="${HMAP.xMax}" y2="${HMAP.ySpine}" />
    <text class="map-text map-spine-label" x="${HMAP.xMin + 6}" y="${HMAP.ySpine + 14}" text-anchor="start">W</text>
    <text class="map-text map-spine-label" x="${HMAP.xMax - 6}" y="${HMAP.ySpine + 14}" text-anchor="end">E</text>
  `;
}

function renderMapStopSvg(point) {
  return `
    <g class="map-stop-group map-stop-group--hidden" data-stop-index="${point.idx}">
      <circle class="map-stop" cx="${point.x}" cy="${point.y}" r="5" />
    </g>
  `;
}

function renderMapLabelSvg(group) {
  const anchor = group.anchor;
  return `
    <g class="map-label-group map-stop-group--hidden" data-label-key="${escapeHtml(group.key)}">
      <text
        class="map-text map-stop-label"
        x="${anchor.labelX}"
        y="${anchor.labelY}"
        text-anchor="start"
        dominant-baseline="middle"
        transform="rotate(${anchor.labelRotate}, ${anchor.labelX}, ${anchor.labelY})"
      ></text>
    </g>
  `;
}

function getMapLegColor(leg) {
  if (leg.isBackward) return getMapBackwardColor();
  const colors = getMapForwardColors();
  return colors[leg.legIndex % colors.length];
}

function animateMapPath(pathEl, options = {}) {
  const { duration = 900, onComplete = null } = options;
  if (!pathEl) {
    onComplete?.();
    return;
  }
  const length = pathEl.getTotalLength();
  if (!length) {
    onComplete?.();
    return;
  }
  pathEl.style.transition = "none";
  pathEl.style.strokeDasharray = `${length}`;
  pathEl.style.strokeDashoffset = `${length}`;
  requestAnimationFrame(() => {
    pathEl.style.transition = `stroke-dashoffset ${duration}ms ease-in-out`;
    pathEl.style.strokeDashoffset = "0";
  });
  if (onComplete) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onComplete();
    };
    pathEl.addEventListener("transitionend", function handler(e) {
      if (e.propertyName !== "stroke-dashoffset") return;
      pathEl.removeEventListener("transitionend", handler);
      finish();
    });
    setTimeout(finish, duration + 150);
  }
}

function drawMap(route, options = {}) {
  const svg = document.getElementById("route-map");
  if (!svg) return;

  const gen = ++mapAnimationGeneration;
  const isStale = () => gen !== mapAnimationGeneration;
  const legDuration = options.legDuration ?? HMAP.legDurationMs;
  const layout = getRouteMapLayout(route);
  const { points, legs } = layout;

  svg.innerHTML = `${renderMapStaticSvg()}<g class="map-route-layer"></g>`;
  svg.setAttribute("viewBox", route.length ? computeMapViewBox(points, legs) : HMAP.defaultViewBox);

  const routeLayer = svg.querySelector(".map-route-layer");
  if (!route.length) return;

  let legIndex = 0;
  const revealedStopIndices = new Set();

  const showStop = (idx) => {
    const g = svg.querySelector(`.map-stop-group[data-stop-index="${idx}"]`);
    if (g) g.classList.remove("map-stop-group--hidden");

    revealedStopIndices.add(idx);
    const point = points[idx];
    const group = point?.labelGroup;
    if (!group) return;

    const revealedInGroup = group.indices.filter((i) => revealedStopIndices.has(i));
    if (!revealedInGroup.length) return;

    const labelGroup = svg.querySelector(`.map-label-group[data-label-key="${group.key}"]`);
    if (!labelGroup) return;

    const textEl = labelGroup.querySelector(".map-stop-label");
    if (textEl) {
      textEl.textContent = formatMapStopLabel(revealedInGroup, group.street);
    }
    labelGroup.classList.remove("map-stop-group--hidden");
  };

  const drawNextLeg = () => {
    if (isStale()) return;
    if (legIndex >= legs.length) {
      options.onComplete?.();
      return;
    }
    const leg = legs[legIndex];
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "map-path");
    path.setAttribute("d", leg.pathD);
    path.setAttribute("stroke", getMapLegColor(leg));
    routeLayer.appendChild(path);

    if (legIndex === 0) showStop(0);

    animateMapPath(path, {
      duration: legDuration,
      onComplete: () => {
        if (isStale()) return;
        showStop(leg.toStopIndex);
        legIndex += 1;
        drawNextLeg();
      },
    });
  };

  const labelGroupsSeen = new Set();
  points.forEach((p) => {
    routeLayer.insertAdjacentHTML("beforebegin", renderMapStopSvg(p));
    if (p.isLabelAnchor && !labelGroupsSeen.has(p.labelGroup.key)) {
      labelGroupsSeen.add(p.labelGroup.key);
      routeLayer.insertAdjacentHTML("beforebegin", renderMapLabelSvg(p.labelGroup));
    }
  });

  if (legDuration === 0) {
    legs.forEach((leg) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "map-path");
      path.setAttribute("d", leg.pathD);
      path.setAttribute("stroke", getMapLegColor(leg));
      routeLayer.appendChild(path);
    });
    points.forEach((_, i) => showStop(i));
    options.onComplete?.();
    return;
  }

  drawNextLeg();
}

function gotoHtml(spot) {
  const value = spot.goto?.trim();
  if (!value) return "";
  return `<p class="goto"><strong>My go-to:</strong> ${escapeHtml(value)}</p>`;
}

function heroFocusStyleAttr(spot) {
  const raw = spot.heroFocus;
  if (!raw || typeof raw !== "object") return "";
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
  if (x === 50 && y === 50) return "";
  return ` style="object-position:${Math.min(100, Math.max(0, x))}% ${Math.min(100, Math.max(0, y))}%"`;
}

function renderRouteCardHtml(s, idx) {
  const tags = (s.tags || []).slice(0, 3);
  const tagsHtml = tags.length
    ? `<div class="tags">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";
  const descHtml = s.description
    ? `<p class="desc">${escapeHtml(String(s.description)).replace(/\n/g, "<br>")}</p>`
    : "";

  return `
    <div class="route-card" role="button" tabindex="0" aria-expanded="false" data-stop-id="${escapeHtml(s.id)}">
      <img src="${s.image}" alt="${escapeHtml(s.name)}" loading="${idx < 2 ? "eager" : "lazy"}" decoding="async"${heroFocusStyleAttr(s)} data-fallback="${escapeHtml(s.placeholderFallback)}" onerror="if(this.dataset.fallback){this.onerror=null;this.src=this.dataset.fallback;}">
      <div class="content">
        <h3>${idx + 1}. ${escapeHtml(s.name)}</h3>
        <div class="meta">${escapeHtml(s.crossStreet)}</div>
      </div>
      <div class="route-card__details" aria-hidden="true">
        ${tagsHtml}
        ${descHtml}
        ${gotoHtml(s)}
      </div>
    </div>
  `;
}

function renderRouteCards(route) {
  const el = document.getElementById("route-cards");
  if (!el) return;
  el.innerHTML = route.map((s, idx) => renderRouteCardHtml(s, idx)).join("");
  el.querySelectorAll(".route-card").forEach((card) => {
    card.addEventListener("click", toggleRouteCardExpanded);
    card.addEventListener("keydown", routeCardKeydown);
  });
}

function routeCardKeydown(e) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleRouteCardExpanded.call(e.currentTarget, e);
  }
}

function toggleRouteCardExpanded(e) {
  const card = e.currentTarget;
  const isExpanded = card.classList.toggle("route-card--expanded");
  card.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  const details = card.querySelector(".route-card__details");
  if (details) details.setAttribute("aria-hidden", isExpanded ? "false" : "true");
}

function getRouteWalkTotals(route) {
  let totalKm = 0;
  let totalMin = 0;
  for (let i = 1; i < route.length; i++) {
    const leg = getWalkLeg(route[i - 1].lat, route[i - 1].lng, route[i].lat, route[i].lng);
    totalKm += leg.km;
    totalMin += leg.minutes;
  }
  return { totalKm, totalMin };
}

function renderRouteTotals(route) {
  const el = document.getElementById("route-totals");
  if (!el || !route.length) return;
  const { totalKm, totalMin } = getRouteWalkTotals(route);
  el.innerHTML = `
    <div>Total walking (your route order): ~${formatKm(totalKm)} km · ~${totalMin} min</div>
    <p class="walk-disclaimer">Straight-line estimates between stops in visit order. No SkyTrain anchor for East Village — walking totals only. Does not include time spent at locations.</p>
  `;
}

function showRouteSummary(route) {
  const summary = document.getElementById("route-summary-panel");
  const summaryTitle = document.getElementById("route-export-summary");
  if (summaryTitle) {
    summaryTitle.textContent = `YOUR EAST VILLAGE ROUTE — ${route.length} STOP${route.length === 1 ? "" : "S"}`;
  }
  renderRouteCards(route);
  renderRouteTotals(route);
  if (summary) summary.hidden = false;
}

function runRouteReview(route, options = {}) {
  currentRoute = route;

  const summary = document.getElementById("route-summary-panel");
  const cardsEl = document.getElementById("route-cards");
  const totalsEl = document.getElementById("route-totals");
  if (summary) summary.hidden = true;
  if (cardsEl) cardsEl.innerHTML = "";
  if (totalsEl) totalsEl.innerHTML = "";

  drawMap(route, {
    legDuration: options.skipAnimation ? 0 : undefined,
    onComplete: () => showRouteSummary(route),
  });
}

function routeFromPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return [];
  return preset.ids
    .map((id) => allStops.find((s) => s.id === id))
    .filter(Boolean);
}

function bindControls() {
  document.getElementById("preset-select")?.addEventListener("change", (e) => {
    const route = routeFromPreset(e.target.value);
    if (route.length) runRouteReview(route);
  });

  document.getElementById("btn-replay")?.addEventListener("click", () => {
    if (currentRoute.length) runRouteReview(currentRoute);
  });
}

async function init() {
  if (window.location.protocol === "file:") {
    const warn = document.getElementById("demo-warn");
    if (warn) warn.hidden = false;
    return;
  }

  try {
    const res = await fetch("/data/stops.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allStops = (data.stops || [])
      .filter((s) => (s.neighborhood || "commercial") === "hastings-sunrise")
      .map(hydrateStop);
  } catch (err) {
    document.querySelector(".demo-shell")?.insertAdjacentHTML(
      "afterbegin",
      `<p class="demo-banner" style="border-color:#c00">Could not load East Village stops: ${escapeHtml(err.message)}. Run <code>npm run dev</code> from the repo root.</p>`
    );
    return;
  }

  bindControls();
  const presetSelect = document.getElementById("preset-select");
  if (presetSelect) presetSelect.value = "west-east";
  runRouteReview(routeFromPreset("west-east"));
}

init();
