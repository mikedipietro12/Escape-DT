/**
 * Commercial Drive vertical route map — spine crop prototype.
 * Compares current live behaviour vs cropping spine + viewBox to the active route.
 */

const WALK_SPEED_KMH = 5;

const MAP = {
  xCenter: 150,
  xEast: 175,
  xWest: 125,
  xVenablesWest: 108,
  xVenablesEast: 114,
  yNorth: 50,
  yStation: 550,
  ySpan: 500,
  ySouthSpan: 90,
  legDurationMs: 900,
  defaultViewBox: "0 0 340 600",
  viewBoxPad: 24,
};

const MAP_LEG_COLORS_BASE = ["#3d8f4a", "#52a362", "#6ab87a", "#84cc94", "#9ad4a8"];
const MAP_BACKWARD_COLOR = "#c9a227";
const STATION_WALK_LABEL = "Commercial–Broadway Station";

const PRESETS = {
  "station-jj-equinox": {
    label: "Station → JJ Bean → Equinox Gallery",
    ids: ["s1", "s40"],
  },
  "station-nearby": {
    label: "Station → JJ Bean → Rollzzy (near station)",
    ids: ["s1", "s2"],
  },
  "victoria-leg": {
    label: "Station → JJ Bean → Victoria Park",
    ids: ["s1", "s33"],
  },
};

let STATION_LAT = 49.2634;
let STATION_LNG = -123.0694;
let allStops = [];
let currentRoute = [];
const mapAnimationGeneration = { current: 0, fixed: 0 };

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function getSeasonFadeTop() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--fade-top").trim();
  return v || "#b2fdb5";
}

function getMapLegColors() {
  return [...MAP_LEG_COLORS_BASE, getSeasonFadeTop()];
}

function isMapLegBackward(y1, y2) {
  return y2 > y1;
}

function isMapStopEastOffset(x) {
  return x > MAP.xCenter + 5;
}

function isMapStopWestOffset(x) {
  return x < MAP.xCenter - 5;
}

function getMapLegColor(leg) {
  if (leg.isBackward) return MAP_BACKWARD_COLOR;
  const colors = getMapLegColors();
  return colors[leg.legIndex % colors.length];
}

function isVictoriaCrossStreet(crossStreet) {
  return /\bvictoria\b/i.test(String(crossStreet || ""));
}

function isFrancesCrossStreet(crossStreet) {
  return /\bfrances\b/i.test(String(crossStreet || ""));
}

function getStopMapZone(stop) {
  if (!stop) return "spine";
  if (stop.mapVenables === "east") return "venablesEast";
  if (stop.mapVenables === "west") return "venablesWest";
  if (isVictoriaCrossStreet(stop.crossStreet)) return "victoria";
  if (isFrancesCrossStreet(stop.crossStreet)) return "frances";
  return "spine";
}

function getStopMapX(stop) {
  const zone = getStopMapZone(stop);
  if (zone === "venablesEast") return MAP.xVenablesEast;
  if (zone === "venablesWest") return MAP.xVenablesWest;
  const explicit = stop.coords?.x;
  if (explicit != null && explicit !== MAP.xCenter) return explicit;
  if (zone === "victoria") return MAP.xEast;
  if (zone === "frances") return MAP.xWest;
  return explicit ?? MAP.xCenter;
}

function isStopOffSpine(stop) {
  const zone = getStopMapZone(stop);
  if (zone !== "spine") return true;
  return Math.abs(getStopMapX(stop) - MAP.xCenter) > 5;
}

function getMapLegPathD(x1, y1, x2, y2, fromStop, toStop) {
  const spine = MAP.xCenter;
  const nearSpine = (x) => Math.abs(x - spine) <= 5;
  const z1 = fromStop ? getStopMapZone(fromStop) : "spine";
  const z2 = toStop ? getStopMapZone(toStop) : "spine";

  if (z1 === "venablesWest" && z2 === "venablesWest") {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  if (
    (z1 === "venablesWest" && z2 === "venablesEast") ||
    (z1 === "venablesEast" && z2 === "venablesWest")
  ) {
    return `M ${x1} ${y1} L ${x2} ${y1}`;
  }
  if (z1 === "venablesEast" && z2 === "spine") {
    return `M ${x1} ${y1} L ${spine} ${y1} L ${spine} ${y2}`;
  }
  if (z1 === "spine" && z2 === "venablesWest") {
    const parts = [`M ${x1} ${y1}`];
    if (y1 !== y2) parts.push(`L ${spine} ${y2}`);
    parts.push(`L ${x2} ${y2}`);
    return parts.join(" ");
  }
  if (z1 === "spine" && z2 === "venablesEast") {
    const parts = [`M ${x1} ${y1}`];
    if (y1 !== y2) parts.push(`L ${spine} ${y2}`);
    parts.push(`L ${x2} ${y2}`);
    return parts.join(" ");
  }
  if (z1 === "venablesWest" && z2 === "spine") {
    return `M ${x1} ${y1} L ${spine} ${y1} L ${spine} ${y2}`;
  }
  if (z1 === "venablesEast" && z2 === "venablesEast") {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const offSpineZone = (z) =>
    z === "venablesWest" ||
    z === "venablesEast" ||
    z === "victoria" ||
    z === "frances";
  if (offSpineZone(z1) && offSpineZone(z2) && z1 !== z2) {
    if (
      (z1 === "victoria" && z2 === "victoria") ||
      (z1 === "frances" && z2 === "frances")
    ) {
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    return `M ${x1} ${y1} L ${spine} ${y1} L ${spine} ${y2} L ${x2} ${y2}`;
  }

  const fromOffSpine = fromStop ? isStopOffSpine(fromStop) : false;
  const toOffSpine = toStop ? isStopOffSpine(toStop) : false;

  if (toOffSpine && !fromOffSpine) {
    const parts = [`M ${x1} ${y1}`];
    if (!nearSpine(x1)) parts.push(`L ${spine} ${y1}`);
    if (y1 !== y2) parts.push(`L ${spine} ${y2}`);
    parts.push(`L ${x2} ${y2}`);
    return parts.join(" ");
  }

  if (fromOffSpine && !toOffSpine) {
    const parts = [`M ${x1} ${y1}`, `L ${spine} ${y1}`];
    if (y1 !== y2) parts.push(`L ${spine} ${y2}`);
    if (!nearSpine(x2)) parts.push(`L ${x2} ${y2}`);
    return parts.join(" ");
  }

  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function getStopMapLocationKey(stop) {
  if (stop?.mapLocation) return `id:${stop.mapLocation}`;
  const lat = Number(stop.lat).toFixed(4);
  const lng = Number(stop.lng).toFixed(4);
  return `geo:${lat},${lng}`;
}

function stopsShareMapLocation(a, b) {
  if (!a || !b) return false;
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
  groups.forEach((group, mapIdx) => {
    group.mapIdx = mapIdx;
  });
  return groups;
}

function getMapPointIndexForRouteIndex(route, routeIdx) {
  const groups = buildRouteMapPointGroups(route);
  for (const group of groups) {
    if (group.routeIndices.includes(routeIdx)) return group.mapIdx;
  }
  return routeIdx;
}

function getMapPointForRouteIndex(points, route, routeIdx) {
  return points[getMapPointIndexForRouteIndex(route, routeIdx)];
}

function getStopWalkFromStation(stop) {
  const km = haversineKm(STATION_LAT, STATION_LNG, stop.lat, stop.lng);
  const minutes = stop.walkFromStation ?? Math.max(1, Math.round((km / WALK_SPEED_KMH) * 60));
  return { km, minutes };
}

function isStopSouthOfStation(stop) {
  return stop.lat < STATION_LAT - 1e-5;
}

function getRouteLegs(route) {
  if (!route.length) return [];
  const legs = [];
  legs.push({
    ...getWalkLeg(STATION_LAT, STATION_LNG, route[0].lat, route[0].lng),
    label: `To ${route[0].name}`,
    legKind: "stationToStop",
    toStopIndex: 0,
  });
  for (let i = 0; i < route.length - 1; i++) {
    if (stopsShareMapLocation(route[i], route[i + 1])) continue;
    const a = route[i];
    const b = route[i + 1];
    legs.push({
      ...getWalkLeg(a.lat, a.lng, b.lat, b.lng),
      label: `To ${b.name}`,
      legKind: "stopToStop",
      fromStopIndex: i,
      toStopIndex: i + 1,
    });
  }
  const last = route[route.length - 1];
  legs.push({
    ...getWalkLeg(last.lat, last.lng, STATION_LAT, STATION_LNG),
    label: `Back to ${STATION_WALK_LABEL}`,
    legKind: "stopToStation",
    fromStopIndex: route.length - 1,
  });
  return legs;
}

function separateNearbyMapPoints(points) {
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(points[i].y - points[i - 1].y) < 6) {
      points[i].y = points[i - 1].y - 8;
    }
  }
  return points;
}

function alignVenablesMapPoints(points) {
  const west = points.filter((p) => getStopMapZone(p.stop) === "venablesWest");
  const east = points.filter((p) => getStopMapZone(p.stop) === "venablesEast");
  if (!west.length || !east.length) return points;
  const rowY = Math.max(...west.map((p) => p.y));
  east.forEach((p) => {
    p.y = rowY;
  });
  return points;
}

function layoutRouteMapPointsFromStation(route) {
  const furthestDist = Math.max(
    ...route.map((s) => getStopWalkFromStation(s).km),
    0.0001
  );
  const points = route.map((stop, idx) => {
    const dist = getStopWalkFromStation(stop).km;
    const y = isStopSouthOfStation(stop)
      ? MAP.yStation + (dist / furthestDist) * MAP.ySouthSpan
      : MAP.yStation - (dist / furthestDist) * MAP.ySpan;
    const x = getStopMapX(stop);
    return { stop, x, y, idx };
  });
  return separateNearbyMapPoints(points);
}

function buildRouteMapPoints(route) {
  if (!route.length) return [];
  const groups = buildRouteMapPointGroups(route);
  const representatives = groups.map((group) => group.stop);
  const rawPoints = layoutRouteMapPointsFromStation(representatives);
  const points = rawPoints.map((point, mapIdx) => ({
    ...point,
    mapIdx,
    routeIndices: groups[mapIdx].routeIndices,
    idx: groups[mapIdx].routeIndices[0],
  }));
  return alignVenablesMapPoints(points);
}

/** Current live app: full spine when station is shown. */
function getMapSpineBoundsCurrent(points, showStation) {
  if (showStation) {
    return { y1: MAP.yNorth, y2: MAP.yStation };
  }
  if (!points.length) {
    return { y1: MAP.yNorth, y2: MAP.yStation };
  }
  const ys = points.map((p) => p.y);
  const pad = 28;
  return {
    y1: Math.min(...ys) - pad,
    y2: Math.max(...ys) + pad,
  };
}

/** Prototype fix: clip spine to route (+ station). */
function getMapSpineBoundsFixed(points, showStation) {
  const ys = points.map((p) => p.y);
  if (showStation) ys.push(MAP.yStation);
  if (!ys.length) {
    return { y1: MAP.yNorth, y2: MAP.yStation };
  }
  const pad = 28;
  return {
    y1: Math.min(...ys) - pad,
    y2: Math.max(...ys) + pad,
  };
}

function computeMapViewBox(points, legs, showStation) {
  const xs = [];
  const ys = [];

  points.forEach((p) => {
    const east = isMapStopEastOffset(p.x);
    const west = isMapStopWestOffset(p.x);
    if (east || west) {
      xs.push(p.x - 90, p.x + 12);
    } else {
      xs.push(p.x - 12, p.x + 90);
    }
    ys.push(p.y - 14, p.y + 14);
  });

  if (showStation) {
    xs.push(MAP.xCenter - 10, MAP.xCenter + 72);
    ys.push(MAP.yStation - 10, MAP.yStation + 14);
  }

  legs.forEach((leg) => {
    ys.push(leg.y1, leg.y2);
    if (leg.x1 != null) xs.push(leg.x1, leg.x2);
  });

  if (!xs.length) return MAP.defaultViewBox;

  const pad = MAP.viewBoxPad;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  const w = Math.max(maxX - minX, 120);
  const h = Math.max(maxY - minY, 120);
  return `${minX} ${minY} ${w} ${h}`;
}

function getRouteMapLayout(route) {
  const station = { x: MAP.xCenter, y: MAP.yStation };
  const routeLegs = getRouteLegs(route);
  if (!route.length) {
    return { station, points: [], legs: [], stopCount: 0 };
  }

  const points = buildRouteMapPoints(route);

  const legs = routeLegs.map((leg, i) => {
    let x1, y1, x2, y2;
    let fromStop = null;
    let toStop = null;

    if (leg.legKind === "stationToStop") {
      const p = getMapPointForRouteIndex(points, route, leg.toStopIndex);
      x1 = station.x;
      y1 = station.y;
      x2 = p.x;
      y2 = p.y;
      toStop = p.stop;
    } else if (leg.legKind === "stopToStop") {
      const a = getMapPointForRouteIndex(points, route, leg.fromStopIndex);
      const b = getMapPointForRouteIndex(points, route, leg.toStopIndex);
      fromStop = a.stop;
      toStop = b.stop;
      x1 = a.x;
      y1 = a.y;
      x2 = b.x;
      y2 = b.y;
    } else if (leg.legKind === "stopToStation") {
      const p = getMapPointForRouteIndex(points, route, leg.fromStopIndex);
      fromStop = p.stop;
      x1 = p.x;
      y1 = p.y;
      x2 = station.x;
      y2 = station.y;
    }

    const isBackward = isMapLegBackward(y1, y2);
    return {
      ...leg,
      x1,
      y1,
      x2,
      y2,
      pathD: getMapLegPathD(x1, y1, x2, y2, fromStop, toStop),
      legIndex: i,
      isBackward,
    };
  });

  return { station, points, legs, stopCount: route.length };
}

function renderMapStaticSvg(options = {}) {
  const showStation = options.showStation !== false;
  const spineY1 = options.spineY1 ?? MAP.yNorth;
  const spineY2 = options.spineY2 ?? MAP.yStation;
  let html = `<line class="map-line" x1="${MAP.xCenter}" y1="${spineY1}" x2="${MAP.xCenter}" y2="${spineY2}" />`;
  if (showStation) {
    html += `
        <circle cx="${MAP.xCenter}" cy="${MAP.yStation}" r="5" fill="var(--ink)"/>
        <text class="map-text" x="${MAP.xCenter + 10}" y="${MAP.yStation + 1}">
          <tspan x="${MAP.xCenter + 10}" dy="0">Commercial-Broadway</tspan>
          <tspan x="${MAP.xCenter + 10}" dy="11">Skytrain station</tspan>
        </text>`;
  }
  return html;
}

function formatMapStopNumberLabel(point) {
  const indices = point.routeIndices || [point.idx];
  const first = indices[0] + 1;
  const last = indices[indices.length - 1] + 1;
  return first === last ? `${first}` : `${first}–${last}`;
}

function renderMapStopSvg(point) {
  const s = point.stop;
  const mapIdx = point.mapIdx ?? point.idx;
  const numLabel = formatMapStopNumberLabel(point);
  const east = isMapStopEastOffset(point.x);
  const west = isMapStopWestOffset(point.x);
  const labelX = east || west ? point.x - 12 : point.x + 15;
  const labelAnchor = east || west ? "end" : "start";
  return `
        <g class="map-stop-group map-stop-group--hidden" data-stop-index="${mapIdx}">
          <circle class="map-stop" cx="${point.x}" cy="${point.y}" r="5" />
          <text class="map-text" x="${labelX}" y="${point.y + 4}" text-anchor="${labelAnchor}">${numLabel}. ${escapeHtml(s.crossStreet)}</text>
        </g>
      `;
}

function getMapStopIndexAfterLeg(legIndex, routeLegs, route) {
  const leg = routeLegs[legIndex];
  if (!leg) return null;
  let routeIdx = null;
  if (leg.legKind === "stationToStop" || leg.legKind === "stopToStop") {
    routeIdx = leg.toStopIndex;
  } else if (leg.legKind === "stopToStation") {
    routeIdx = leg.fromStopIndex;
  }
  if (routeIdx == null) return null;
  return getMapPointIndexForRouteIndex(route, routeIdx);
}

function animateMapPath(pathEl, options = {}) {
  const { duration = 1500, direction = "draw", onComplete = null } = options;
  if (!pathEl) {
    onComplete?.();
    return;
  }
  const length = pathEl.getTotalLength();
  if (!length) {
    onComplete?.();
    return;
  }
  const startOffset = direction === "draw" ? length : 0;
  const endOffset = direction === "draw" ? 0 : length;
  pathEl.style.transition = "none";
  pathEl.style.strokeDasharray = `${length}`;
  pathEl.style.strokeDashoffset = `${startOffset}`;
  pathEl.setAttribute("fill", "none");
  const runTransition = () => {
    pathEl.style.transition = `stroke-dashoffset ${duration}ms ease-in-out`;
    pathEl.style.strokeDashoffset = `${endOffset}`;
  };
  requestAnimationFrame(() => requestAnimationFrame(runTransition));
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

function drawMap(svgEl, route, options = {}) {
  const cropToRoute = !!options.cropToRoute;
  const genKey = cropToRoute ? "fixed" : "current";
  const gen = ++mapAnimationGeneration[genKey];
  const isStale = () => gen !== mapAnimationGeneration[genKey];

  const showStation = true;
  const layout = getRouteMapLayout(route);
  const { points, legs } = layout;
  const routeLegs = getRouteLegs(route);
  const legDuration = options.legDuration ?? MAP.legDurationMs;
  const spineFn = cropToRoute ? getMapSpineBoundsFixed : getMapSpineBoundsCurrent;
  const spine = spineFn(points, showStation);

  let html = renderMapStaticSvg({
    showStation,
    spineY1: spine.y1,
    spineY2: spine.y2,
  });
  html += `<g class="map-route-layer"></g>`;
  svgEl.innerHTML = html;

  const useComputedViewBox = route.length && (cropToRoute || !showStation);
  svgEl.setAttribute(
    "viewBox",
    useComputedViewBox ? computeMapViewBox(points, legs, showStation) : MAP.defaultViewBox
  );

  const routeLayer = svgEl.querySelector(".map-route-layer");

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

  if (!legs.length) {
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
    const color = getMapLegColor(leg);
    const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEl.setAttribute("class", leg.isBackward ? "map-path map-path--backward" : "map-path");
    pathEl.setAttribute("data-leg-index", String(legIndex));
    pathEl.setAttribute("d", leg.pathD || `M ${leg.x1} ${leg.y1} L ${leg.x2} ${leg.y2}`);
    pathEl.style.stroke = color;
    routeLayer.appendChild(pathEl);

    animateMapPath(pathEl, {
      duration: legDuration,
      direction: "draw",
      onComplete: () => {
        if (isStale()) return;
        const stopIdx = getMapStopIndexAfterLeg(legIndex, routeLegs, route);
        if (stopIdx != null) revealStop(stopIdx);
        runLeg(legIndex + 1);
      },
    });
  }

  runLeg(0);
}

function resolveRoute(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return [];
  return preset.ids
    .map((id) => allStops.find((s) => s.id === id))
    .filter(Boolean);
}

function replayMaps() {
  const route = currentRoute;
  drawMap(document.getElementById("route-map-current"), route, { cropToRoute: false });
  drawMap(document.getElementById("route-map-fixed"), route, { cropToRoute: true });
}

async function init() {
  if (window.location.protocol === "file:") {
    document.getElementById("demo-warn").hidden = false;
    return;
  }

  const res = await fetch("/data/stops.json");
  const data = await res.json();
  STATION_LAT = data.station?.lat ?? STATION_LAT;
  STATION_LNG = data.station?.lng ?? STATION_LNG;
  allStops = data.stops || [];

  const presetSelect = document.getElementById("preset-select");
  const replay = () => {
    currentRoute = resolveRoute(presetSelect.value);
    replayMaps();
  };

  presetSelect.addEventListener("change", replay);
  document.getElementById("btn-replay").addEventListener("click", replay);
  replay();
}

init();
