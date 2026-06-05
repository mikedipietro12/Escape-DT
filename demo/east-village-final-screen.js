/**
 * East Village (Hastings-Sunrise) final-screen prototype.
 * Horizontal west→east map — planning only, not wired into index.html.
 */

const WALK_SPEED_KMH = 4.5;

const MAP = {
  yCenter: 140,
  yNorth: 78,
  ySouth: 202,
  xWest: 36,
  xEast: 584,
  xPad: 44,
  legDurationMs: 900,
  defaultViewBox: "0 0 620 280",
  viewBoxPad: 20,
};

const MAP_LEG_COLORS_BASE = ["#3d8f4a", "#52a362", "#6ab87a", "#84cc94", "#9ad4a8"];
const MAP_BACKWARD_COLOR = "#c9a227";

const SAMPLE_ROUTES = {
  "morning-crawl": {
    title: "Morning crawl (west cluster)",
    description: "Coffee, bakery, park — short west-end loop",
    stopIds: ["s46", "s47", "s60", "s52", "s50"],
  },
  "hastings-strip": {
    title: "Hastings strip (on-spine)",
    description: "Storefronts along E Hastings, west to east",
    stopIds: [
      "s46", "s51", "s55", "s59", "s52", "s58", "s57", "s56", "s53", "s54",
    ],
  },
  "breweries-bites": {
    title: "Breweries & bites",
    description: "Off-spine detours plus Hastings bars",
    stopIds: ["s47", "s49", "s48", "s53", "s57", "s51"],
  },
  "full-west-east": {
    title: "Full neighborhood (18 stops)",
    description: "Every draft stop, geographic west → east",
    stopIds: null,
  },
};

let allStops = [];
let lngBounds = { min: 0, max: 0 };
let mapAnimationGeneration = 0;
let showAllStops = false;
let activeRouteKey = "morning-crawl";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSeasonFadeTop() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--fade-top").trim();
  return v || "#b2fdb5";
}

function getMapLegColors() {
  return [...MAP_LEG_COLORS_BASE, getSeasonFadeTop()];
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

function formatKm(km) {
  if (km < 1) return km.toFixed(2);
  return km.toFixed(1);
}

function getWalkLeg(lat1, lng1, lat2, lng2) {
  const km = haversineKm(lat1, lng1, lat2, lng2);
  if (km < 0.001) return { km: 0, minutes: 0 };
  const minutes = Math.max(1, Math.round((km / WALK_SPEED_KMH) * 60));
  return { km, minutes };
}

function isOnHastingsSpine(crossStreet) {
  const cs = String(crossStreet || "");
  return /\bE Hastings\b/i.test(cs);
}

function isNorthOffSpine(stop) {
  const cs = String(stop.crossStreet || "");
  if (/\bfranklin\b/i.test(cs)) return true;
  if (/^Semlin\b/i.test(cs) || (/\bSemlin Dr\b/i.test(cs) && !/\bE Hastings\b/i.test(cs))) return true;
  return false;
}

function isSouthOffSpine(stop) {
  const cs = String(stop.crossStreet || "");
  if (/\bvictoria\b/i.test(cs)) return true;
  if (/\bpowell\b/i.test(cs)) return true;
  if (/\btriumph\b/i.test(cs)) return true;
  return false;
}

function isStopOffSpine(stop) {
  if (isOnHastingsSpine(stop.crossStreet)) return false;
  return isNorthOffSpine(stop) || isSouthOffSpine(stop);
}

function getStopMapY(stop) {
  if (isNorthOffSpine(stop)) return MAP.yNorth;
  if (isSouthOffSpine(stop)) return MAP.ySouth;
  return MAP.yCenter;
}

function lngToMapX(lng) {
  const span = lngBounds.max - lngBounds.min || 1e-6;
  const t = (lng - lngBounds.min) / span;
  const innerWest = MAP.xWest + MAP.xPad;
  const innerEast = MAP.xEast - MAP.xPad;
  return innerWest + t * (innerEast - innerWest);
}

function separateNearbyMapPoints(points) {
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(points[i].x - points[i - 1].x) < 10) {
      points[i].x = points[i - 1].x + 12;
    }
  }
  return points;
}

function getStopMapLocationKey(stop) {
  const lat = Number(stop.lat).toFixed(4);
  const lng = Number(stop.lng).toFixed(4);
  return `geo:${lat},${lng}`;
}

function stopsShareMapLocation(a, b) {
  return getStopMapLocationKey(a) === getStopMapLocationKey(b);
}

function buildRouteMapPointGroups(route) {
  const groups = [];
  route.forEach((stop, routeIdx) => {
    const prev = groups[groups.length - 1];
    if (prev && stopsShareMapLocation(prev.stop, stop)) {
      prev.routeIndices.push(routeIdx);
    } else {
      groups.push({ stop, routeIndices: [routeIdx] });
    }
  });
  return groups;
}

function layoutMapPointsForStops(stops) {
  const points = stops.map((stop, idx) => ({
    stop,
    x: lngToMapX(stop.lng),
    y: getStopMapY(stop),
    idx,
  }));
  return separateNearbyMapPoints(points);
}

function buildRouteMapPoints(route) {
  if (!route.length) return [];
  const groups = buildRouteMapPointGroups(route);
  const representatives = groups.map((g) => g.stop);
  const raw = layoutMapPointsForStops(representatives);
  return raw.map((point, mapIdx) => ({
    ...point,
    mapIdx,
    routeIndices: groups[mapIdx].routeIndices,
    idx: groups[mapIdx].routeIndices[0],
  }));
}

function getMapPointForRouteIndex(points, route, routeIdx) {
  const stop = route[routeIdx];
  return points.find((p) => p.stop.id === stop.id) ?? points[0];
}

function getRouteLegs(route) {
  if (!route.length) return [];
  const legs = [];
  for (let i = 0; i < route.length - 1; i++) {
    if (stopsShareMapLocation(route[i], route[i + 1])) continue;
    const a = route[i];
    const b = route[i + 1];
    legs.push({
      ...getWalkLeg(a.lat, a.lng, b.lat, b.lng),
      legKind: "stopToStop",
      fromStopIndex: i,
      toStopIndex: i + 1,
    });
  }
  return legs;
}

function isMapLegBackward(x1, x2) {
  return x2 < x1 - 2;
}

function getMapLegPathD(x1, y1, x2, y2, fromOffSpine, toOffSpine) {
  const spine = MAP.yCenter;
  const nearSpine = (y) => Math.abs(y - spine) <= 5;

  if (toOffSpine && !fromOffSpine) {
    const parts = [`M ${x1} ${y1}`];
    if (!nearSpine(y1)) parts.push(`L ${x1} ${spine}`);
    if (x1 !== x2) parts.push(`L ${x2} ${spine}`);
    parts.push(`L ${x2} ${y2}`);
    return parts.join(" ");
  }

  if (fromOffSpine && !toOffSpine) {
    const parts = [`M ${x1} ${y1}`, `L ${x1} ${spine}`];
    if (x1 !== x2) parts.push(`L ${x2} ${spine}`);
    if (!nearSpine(y2)) parts.push(`L ${x2} ${y2}`);
    return parts.join(" ");
  }

  if (fromOffSpine && toOffSpine && Math.abs(y1 - y2) > 5) {
    return `M ${x1} ${y1} L ${x1} ${spine} L ${x2} ${spine} L ${x2} ${y2}`;
  }

  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function getMapLegColor(leg) {
  if (leg.isBackward) return MAP_BACKWARD_COLOR;
  const colors = getMapLegColors();
  return colors[leg.legIndex % colors.length];
}

function getRouteMapLayout(route) {
  const routeLegs = getRouteLegs(route);
  if (!route.length) return { points: [], legs: [] };

  const points = buildRouteMapPoints(route);
  const legs = routeLegs.map((leg, i) => {
    const a = getMapPointForRouteIndex(points, route, leg.fromStopIndex);
    const b = getMapPointForRouteIndex(points, route, leg.toStopIndex);
    const fromOffSpine = isStopOffSpine(a.stop);
    const toOffSpine = isStopOffSpine(b.stop);
    const x1 = a.x;
    const y1 = a.y;
    const x2 = b.x;
    const y2 = b.y;
    return {
      ...leg,
      x1,
      y1,
      x2,
      y2,
      pathD: getMapLegPathD(x1, y1, x2, y2, fromOffSpine, toOffSpine),
      legIndex: i,
      isBackward: isMapLegBackward(x1, x2),
    };
  });

  return { points, legs };
}

function computeMapViewBox(points, legs) {
  const xs = [];
  const ys = [MAP.yNorth - 16, MAP.ySouth + 16, MAP.yCenter];

  points.forEach((p) => {
    const north = p.y < MAP.yCenter - 5;
    const south = p.y > MAP.yCenter + 5;
    xs.push(p.x - (south ? 12 : 90), p.x + 90);
    ys.push(p.y - (north ? 22 : 14), p.y + (south ? 22 : 14));
  });

  legs.forEach((leg) => {
    xs.push(leg.x1, leg.x2);
    ys.push(leg.y1, leg.y2);
  });

  const pad = MAP.viewBoxPad;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
}

function renderMapStaticSvg() {
  const y = MAP.yCenter;
  return `
    <line class="map-line" x1="${MAP.xWest}" y1="${y}" x2="${MAP.xEast}" y2="${y}" />
    <text class="map-text" x="${MAP.xWest}" y="${y - 14}" text-anchor="start">West</text>
    <text class="map-text" x="${MAP.xEast}" y="${y - 14}" text-anchor="end">East</text>
    <text class="map-text" x="${(MAP.xWest + MAP.xEast) / 2}" y="${y + 22}" text-anchor="middle">E Hastings St</text>
  `;
}

function shortCrossLabel(crossStreet) {
  const cs = String(crossStreet || "");
  const m = cs.match(/(?:&|@)\s*(.+)$/i) || cs.match(/^(?:E Hastings St|E Hastings)\s*&\s*(.+)$/i);
  if (m) return m[1].trim().replace(/\.$/, "");
  return cs.length > 22 ? `${cs.slice(0, 20)}…` : cs;
}

function renderMapStopSvg(point, options = {}) {
  const s = point.stop;
  const mapIdx = point.mapIdx ?? point.idx;
  const numLabel = options.ghost
    ? "·"
    : (() => {
        const indices = point.routeIndices || [point.idx];
        const first = indices[0] + 1;
        const last = indices[indices.length - 1] + 1;
        return first === last ? `${first}` : `${first}–${last}`;
      })();
  const south = point.y > MAP.yCenter + 5;
  const north = point.y < MAP.yCenter - 5;
  const labelY = south ? point.y + 16 : point.y - 10;
  const labelAnchor = point.x > (MAP.xWest + MAP.xEast) / 2 ? "end" : "start";
  const labelX = labelAnchor === "end" ? point.x - 10 : point.x + 10;
  const stopClass = options.ghost ? "map-stop map-stop--ghost" : "map-stop";
  const hiddenClass = options.ghost || options.visible ? "" : " map-stop-group--hidden";
  return `
    <g class="map-stop-group${hiddenClass}" data-stop-index="${mapIdx}" data-stop-id="${escapeHtml(s.id)}">
      <circle class="${stopClass}" cx="${point.x}" cy="${point.y}" r="${options.ghost ? 4 : 5}" />
      <text class="map-text" x="${labelX}" y="${labelY}" text-anchor="${labelAnchor}">
        ${options.ghost ? escapeHtml(shortCrossLabel(s.crossStreet)) : `${numLabel}. ${escapeHtml(shortCrossLabel(s.crossStreet))}`}
      </text>
    </g>
  `;
}

function animateMapPath(pathEl, options = {}) {
  const { duration = 1500, onComplete = null } = options;
  if (!pathEl || !duration) {
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
  pathEl.setAttribute("fill", "none");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      pathEl.style.transition = `stroke-dashoffset ${duration}ms ease-in-out`;
      pathEl.style.strokeDashoffset = "0";
    });
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
  const layout = getRouteMapLayout(route);
  const { points, legs } = layout;
  const legDuration = options.legDuration ?? MAP.legDurationMs;
  const instant = legDuration === 0;

  let html = renderMapStaticSvg();
  html += `<g class="map-ghost-layer"></g>`;
  html += `<g class="map-route-layer"></g>`;
  svg.innerHTML = html;
  svg.setAttribute("viewBox", route.length ? computeMapViewBox(points, legs) : MAP.defaultViewBox);

  const ghostLayer = svg.querySelector(".map-ghost-layer");
  const routeLayer = svg.querySelector(".map-route-layer");

  if (showAllStops) {
    const ghostPoints = layoutMapPointsForStops(
      allStops.filter((s) => !route.some((r) => r.id === s.id))
    );
    ghostPoints.forEach((p, i) => {
      ghostLayer.insertAdjacentHTML("beforeend", renderMapStopSvg({ ...p, mapIdx: `g${i}` }, { ghost: true, visible: true }));
    });
  }

  if (!route.length) {
    options.onComplete?.();
    return;
  }

  function revealStop(stopIndex) {
    const existing = routeLayer.querySelector(`[data-stop-index="${stopIndex}"]`);
    if (existing) {
      requestAnimationFrame(() => existing.classList.remove("map-stop-group--hidden"));
      return;
    }
    routeLayer.insertAdjacentHTML("beforeend", renderMapStopSvg(points[stopIndex]));
    const g = routeLayer.querySelector(`[data-stop-index="${stopIndex}"]`);
    requestAnimationFrame(() => g?.classList.remove("map-stop-group--hidden"));
  }

  if (!legs.length || instant) {
    if (instant && legs.length) {
      legs.forEach((leg) => {
        const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathEl.setAttribute("class", leg.isBackward ? "map-path map-path--backward" : "map-path");
        pathEl.setAttribute("d", leg.pathD);
        pathEl.style.stroke = getMapLegColor(leg);
        routeLayer.appendChild(pathEl);
      });
    }
    points.forEach((_, idx) => revealStop(idx));
    options.onComplete?.();
    return;
  }

  function runLeg(legIndex) {
    if (isStale()) return;
    if (legIndex >= legs.length) {
      options.onComplete?.();
      return;
    }

    const leg = legs[legIndex];
    const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEl.setAttribute("class", leg.isBackward ? "map-path map-path--backward" : "map-path");
    pathEl.setAttribute("d", leg.pathD);
    pathEl.style.stroke = getMapLegColor(leg);
    routeLayer.appendChild(pathEl);

    const afterLeg = () => {
      if (isStale()) return;
      const stopIdx = leg.toStopIndex;
      const mapPointIdx = points.findIndex((p) => p.routeIndices?.includes(stopIdx) || p.idx === stopIdx);
      if (mapPointIdx >= 0) revealStop(mapPointIdx);
      runLeg(legIndex + 1);
    };

    if (instant) {
      pathEl.style.strokeDasharray = "none";
      afterLeg();
    } else {
      animateMapPath(pathEl, { duration: legDuration, onComplete: afterLeg });
    }
  }

  const firstPoint = points[0];
  if (firstPoint) revealStop(0);
  runLeg(0);
}

function getStopImage(stop) {
  const images = stop.images || (stop.image ? [stop.image] : []);
  return images[0] || null;
}

function renderRouteCardHtml(s, idx) {
  const imgPath = getStopImage(s);
  const thumb = imgPath
    ? `<img src="../${imgPath}" alt="${escapeHtml(s.name)}" loading="${idx < 2 ? "eager" : "lazy"}" decoding="async">`
    : `<span class="route-card__placeholder" style="background:#${s.placeholderColor || "cccccc"}"></span>`;
  const tags = (s.tags || []).slice(0, 3);
  const tagsHtml = tags.length
    ? `<div class="tags">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";
  const descHtml = s.description
    ? `<p class="desc">${escapeHtml(s.description).replace(/\n/g, "<br>")}</p>`
    : "";
  const gotoHtml = s.goto ? `<p class="goto"><strong>My go-to:</strong> ${escapeHtml(s.goto)}</p>` : "";
  return `
    <div class="route-card">
      ${thumb}
      <div class="content">
        <h3>${idx + 1}. ${escapeHtml(s.name)}</h3>
        <div class="meta">${escapeHtml(s.crossStreet)}</div>
        ${tagsHtml}
        ${descHtml}
        ${gotoHtml}
      </div>
    </div>
  `;
}

function renderRouteCards(route) {
  const el = document.getElementById("route-cards");
  if (!el) return;
  el.innerHTML = route.map((s, i) => renderRouteCardHtml(s, i)).join("");
}

function getRouteWalkTotals(route) {
  const legs = getRouteLegs(route);
  return {
    totalKm: legs.reduce((sum, l) => sum + l.km, 0),
    totalMin: legs.reduce((sum, l) => sum + l.minutes, 0),
  };
}

function renderRouteTotals(route) {
  const el = document.getElementById("route-totals");
  if (!el || !route.length) {
    if (el) el.innerHTML = "";
    return;
  }
  const { totalKm, totalMin } = getRouteWalkTotals(route);
  el.innerHTML = `
    <div>Total walking (visit order): ~${formatKm(totalKm)} km · ~${totalMin} min</div>
    <p class="walk-disclaimer">Straight-line estimates between stops. No SkyTrain leg — East Village routes start at your first stop.</p>
  `;
}

function sortWestToEast(stops) {
  return [...stops].sort((a, b) => a.lng - b.lng);
}

function resolveRoute(routeKey) {
  const spec = SAMPLE_ROUTES[routeKey];
  if (!spec) return [];
  if (!spec.stopIds) return sortWestToEast(allStops);
  return spec.stopIds
    .map((id) => allStops.find((s) => s.id === id))
    .filter(Boolean);
}

function setReviewPhase(phase) {
  const review = document.getElementById("route-review");
  const summary = document.getElementById("route-summary-panel");
  const finalize = document.getElementById("btn-route-finalize");
  const edit = document.getElementById("btn-edit-route");
  const exports = document.getElementById("route-export-actions");
  const hint = document.getElementById("route-scroll-hint");

  if (phase === "map") {
    review.classList.remove("route-phase-summary");
    review.classList.add("route-phase-map");
    summary.hidden = true;
    finalize.hidden = true;
    edit.hidden = true;
    exports.hidden = true;
    hint.hidden = true;
    hint.classList.remove("route-scroll-hint--visible");
  } else {
    review.classList.remove("route-phase-map");
    review.classList.add("route-phase-summary");
    summary.hidden = false;
    finalize.hidden = false;
    edit.hidden = false;
    if (window.matchMedia("(max-width: 767px)").matches) {
      hint.hidden = false;
      hint.classList.add("route-scroll-hint--visible");
    }
  }
}

function revealSummary(route, routeKey) {
  const spec = SAMPLE_ROUTES[routeKey];
  const summaryLine = document.getElementById("route-export-summary");
  if (summaryLine) {
    summaryLine.textContent = `YOUR EAST VILLAGE ROUTE — ${route.length} STOPS`;
  }
  renderRouteCards(route);
  renderRouteTotals(route);
  setReviewPhase("summary");

  const finalize = document.getElementById("btn-route-finalize");
  if (finalize && !finalize.dataset.bound) {
    finalize.dataset.bound = "1";
    finalize.addEventListener("click", () => {
      document.getElementById("route-export-actions").hidden = false;
      finalize.hidden = true;
    });
  }
}

function playRouteReview(routeKey, options = {}) {
  activeRouteKey = routeKey;
  const route = resolveRoute(routeKey);
  setReviewPhase("map");
  document.getElementById("route-cards").innerHTML = "";
  document.getElementById("route-totals").innerHTML = "";

  drawMap(route, {
    legDuration: options.instant ? 0 : MAP.legDurationMs,
    onComplete: () => revealSummary(route, routeKey),
  });
}

function populateRoutePicker() {
  const select = document.getElementById("route-picker");
  if (!select) return;
  select.innerHTML = Object.entries(SAMPLE_ROUTES)
    .map(([key, spec]) => `<option value="${key}">${escapeHtml(spec.title)}</option>`)
    .join("");
  select.value = activeRouteKey;
}

async function init() {
  if (window.location.protocol === "file:") {
    document.getElementById("demo-warn").hidden = false;
    return;
  }

  try {
    const res = await fetch("../data/hastings-sunrise-draft.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allStops = data.stops || [];
    const lngs = allStops.map((s) => s.lng);
    lngBounds = { min: Math.min(...lngs), max: Math.max(...lngs) };
  } catch (err) {
    document.getElementById("demo-warn").hidden = false;
    document.getElementById("demo-warn").innerHTML =
      `<strong>Could not load draft stops.</strong> ${escapeHtml(err.message)}. Run <code>npm run dev</code> from the repo root.`;
    return;
  }

  populateRoutePicker();

  document.getElementById("route-picker").addEventListener("change", (e) => {
    playRouteReview(e.target.value);
  });

  document.getElementById("btn-replay").addEventListener("click", () => {
    playRouteReview(activeRouteKey);
  });

  document.getElementById("btn-all-stops").addEventListener("click", (e) => {
    showAllStops = !showAllStops;
    e.currentTarget.setAttribute("aria-pressed", showAllStops ? "true" : "false");
    const route = resolveRoute(activeRouteKey);
    const inSummary = document.getElementById("route-review").classList.contains("route-phase-summary");
    if (inSummary) {
      drawMap(route, { legDuration: 0 });
    } else {
      playRouteReview(activeRouteKey);
    }
  });

  document.getElementById("route-scroll-hint")?.addEventListener("click", () => {
    document.getElementById("route-summary-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  playRouteReview(activeRouteKey);
}

init();
