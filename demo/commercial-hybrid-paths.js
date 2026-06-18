/**
 * Commercial Drive — hybrid route map (reference demo; live app uses same logic in index.html).
 *
 * Canonical reference for the next live illustrated route map:
 * - Spine: straight legs on the center column; south returns to station or route start
 *   use a tiny curve onto a parallel line just left of the spine (gold when southbound).
 * - Off-spine: rounded corners at Victoria / Venables / Frances junctions (both directions).
 * - Animated draw: trace arrowhead on the route layer.
 *
 * Supersedes curved-lanes and stacked-lanes for spine behaviour. Port into index.html when ready.
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
  legDurationMs: 1400,
  defaultViewBox: "0 0 340 600",
  viewBoxPad: 24,
  cornerRadius: 18,
  returnLaneOffset: 5,
  returnLaneCurve: 4,
};

const SVG_NS = "http://www.w3.org/2000/svg";

const MAP_LEG_COLORS_BASE = ["#3d8f4a", "#52a362", "#6ab87a", "#84cc94", "#9ad4a8"];
const MAP_BACKWARD_COLOR = "#c9a227";
const STATION_WALK_LABEL = "Commercial–Broadway Station";

const PRESETS = {
  backtrack: {
    label: "Backtrack (Prado → JJ Bean → Don't Argue)",
    ids: ["s3", "s1", "s19"],
  },
  victoria: {
    label: "Victoria walk (JJ → Mah → Park → pizza)",
    ids: ["s1", "s32", "s33", "s19"],
  },
  venables: {
    label: "Venables hop (Slice → Alterior → Fun Haus)",
    ids: ["s26", "s12", "s25"],
  },
  "half-day": {
    label: "Half-day mid-morning (Victoria + Venables + spine)",
    ids: ["s32", "s33", "s19", "s34", "s26", "s25", "s12", "s24"],
  },
  "south-loop": {
    label: "South of station (JJ → Equinox → back)",
    ids: ["s1", "s40", "s1"],
  },
  "world-cup": {
    label: "World Cup day (north crawl, then south)",
    ids: ["s3", "s19", "s10", "s21", "s22", "s41"],
  },
  "frances-return": {
    label: "Frances return (Earnest → Don't Argue)",
    ids: ["s41", "s19"],
  },
};

let STATION_LAT = 49.2634;
let STATION_LNG = -123.0694;
let allStops = [];
let currentRoute = [];
const mapAnimationGeneration = { map: 0 };

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

function formatKm(km) {
  if (km < 10) return km.toFixed(1);
  return String(Math.round(km));
}

function isReturnSouthLaneLeg(leg, route, y1, y2) {
  if (y2 <= y1) return false;
  if (leg.legKind === "stopToStation") return true;
  if (leg.legKind === "stopToStop" && leg.toStopIndex === 0) return true;
  return false;
}

function appendReturnSouthLane(parts, y1, y2) {
  const xMain = MAP.xCenter;
  const xLane = MAP.xCenter - MAP.returnLaneOffset;
  const r = MAP.returnLaneCurve;
  if (Math.abs(y2 - y1) < r * 2) {
    parts.push(`L ${xMain} ${y2}`);
    return;
  }
  parts.push(`Q ${xLane} ${y1} ${xLane} ${y1 + r}`);
  parts.push(`L ${xLane} ${y2 - r}`);
  parts.push(`Q ${xLane} ${y2} ${xMain} ${y2}`);
}

/** Tiny curve onto a left parallel lane, then south to the destination on the spine column. */
function getReturnSouthLanePathD(y1, y2) {
  const parts = [`M ${MAP.xCenter} ${y1}`];
  appendReturnSouthLane(parts, y1, y2);
  return parts.join(" ");
}

function getHybridReturnSouthPathD(x1, y1, x2, y2, fromStop, toStop) {
  const spine = MAP.xCenter;
  const fromOff = fromStop ? isStopOffSpine(fromStop) : false;
  const toOff = toStop ? isStopOffSpine(toStop) : false;

  if (fromOff && !toOff) {
    const parts = [`M ${x1} ${y1}`];
    parts.push(roundedHorizVert(x1, y1, spine, y1, y1));
    appendReturnSouthLane(parts, y1, y2);
    return parts.join(" ");
  }

  return getReturnSouthLanePathD(y1, y2);
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
  if (zone === "victoria") return MAP.xEast;
  if (zone === "frances") return MAP.xWest;
  const explicit = stop.coords?.x;
  if (explicit != null && explicit !== MAP.xCenter) return explicit;
  return MAP.xCenter;
}

function isStopOffSpine(stop) {
  const zone = getStopMapZone(stop);
  if (zone !== "spine") return true;
  return Math.abs(getStopMapX(stop) - MAP.xCenter) > 5;
}

function getStopWalkFromStation(stop) {
  const km = haversineKm(STATION_LAT, STATION_LNG, stop.lat, stop.lng);
  const minutes = stop.walkFromStation ?? Math.max(1, Math.round((km / WALK_SPEED_KMH) * 60));
  return { km, minutes };
}

function isStopSouthOfStation(stop) {
  return stop.lat < STATION_LAT - 1e-5;
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

function applyHybridGeometry(point) {
  if (isStopOffSpine(point.stop)) {
    point.dotX = point.x;
    point.dotY = point.y;
  } else {
    point.dotX = MAP.xCenter;
    point.dotY = point.y;
  }
  point.lineX = MAP.xCenter;
  point.layoutY = point.y;
}

function prepareHybridPoints(route) {
  const points = buildRouteMapPoints(route);
  points.forEach(applyHybridGeometry);
  return points;
}

function getCornerRadius(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  let cap = MAP.cornerRadius;
  if (dx > 0.5 && dy > 0.5) cap = Math.min(cap, dx * 0.9, dy * 0.9);
  else if (dx > 0.5) cap = Math.min(cap, dx * 0.9);
  else if (dy > 0.5) cap = Math.min(cap, dy * 0.9);
  return Math.max(cap, 6);
}

function roundedVertHoriz(x1, y1, x2, y2) {
  const r = getCornerRadius(x1, y1, x2, y2);
  if (Math.abs(x1 - x2) < 0.5) return `L ${x2} ${y2}`;
  if (Math.abs(y1 - y2) < 0.5) return `L ${x2} ${y2}`;

  const down = y2 > y1;
  const east = x2 > x1;
  const yPre = down ? y2 - r : y2 + r;
  const xPost = east ? x1 + r : x1 - r;
  return `L ${x1} ${yPre} Q ${x1} ${y2} ${xPost} ${y2} L ${x2} ${y2}`;
}

/**
 * Horizontal then vertical. Pass yExit when the path continues vertically after
 * reaching (x2, y1) — otherwise same-y hops skip the curve and draw a sharp 90°.
 */
function roundedHorizVert(x1, y1, x2, y2, yExit) {
  const yNext = yExit ?? y2;
  const r = getCornerRadius(x1, y1, x2, yNext);

  if (Math.abs(x1 - x2) < 0.5) {
    if (Math.abs(y1 - yNext) < 0.5) return `L ${x2} ${yNext}`;
    return roundedVertHoriz(x1, y1, x2, yNext);
  }

  const east = x2 > x1;
  const xPre = east ? x2 - r : x2 + r;

  if (Math.abs(y1 - y2) < 0.5 && Math.abs(y1 - yNext) > 0.5) {
    const down = yNext > y1;
    const yPost = down ? y1 + r : y1 - r;
    return `L ${xPre} ${y1} Q ${x2} ${y1} ${x2} ${yPost}`;
  }

  if (Math.abs(y1 - y2) < 0.5) return `L ${x2} ${y2}`;

  const down = y2 > y1;
  const yPost = down ? y1 + r : y1 - r;
  return `L ${xPre} ${y1} Q ${x2} ${y1} ${x2} ${yPost} L ${x2} ${y2}`;
}

function getCurvedOffSpinePathD(x1, y1, x2, y2, fromStop, toStop, lineX1, lineX2) {
  const spine = MAP.xCenter;
  const z1 = fromStop ? getStopMapZone(fromStop) : "spine";
  const z2 = toStop ? getStopMapZone(toStop) : "spine";
  const parts = [];

  if (z1 === "venablesWest" && z2 === "venablesWest") {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  if (
    (z1 === "venablesWest" && z2 === "venablesEast") ||
    (z1 === "venablesEast" && z2 === "venablesWest")
  ) {
    return `M ${x1} ${y1} L ${x2} ${y1}`;
  }
  if (z1 === "venablesEast" && z2 === "venablesEast") {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const fromOff = fromStop ? isStopOffSpine(fromStop) : false;
  const toOff = toStop ? isStopOffSpine(toStop) : false;

  if (toOff && !fromOff) {
    parts.push(`M ${lineX1} ${y1}`);
    parts.push(roundedVertHoriz(lineX1, y1, x2, y2));
    return parts.join(" ");
  }

  if (fromOff && !toOff) {
    parts.push(`M ${x1} ${y1}`);
    parts.push(roundedHorizVert(x1, y1, spine, y1, y2));
    parts.push(`L ${lineX2} ${y2}`);
    return parts.join(" ");
  }

  if (fromOff && toOff) {
    if (z1 === z2) {
      const colX =
        z1 === "victoria"
          ? MAP.xEast
          : z1 === "frances"
            ? MAP.xWest
            : z1 === "venablesWest"
              ? MAP.xVenablesWest
              : z1 === "venablesEast"
                ? MAP.xVenablesEast
                : x1;
      return `M ${colX} ${y1} L ${colX} ${y2}`;
    }
    parts.push(`M ${x1} ${y1}`);
    parts.push(roundedHorizVert(x1, y1, spine, y1, y2));
    if (Math.abs(y1 - y2) > 0.5) parts.push(`L ${spine} ${y2}`);
    parts.push(roundedVertHoriz(spine, y2, x2, y2));
    return parts.join(" ");
  }

  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

/** Straight L-path legs (today's live app behaviour). */
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
    const seg = [`M ${x1} ${y1}`];
    if (y1 !== y2) seg.push(`L ${spine} ${y2}`);
    seg.push(`L ${x2} ${y2}`);
    return seg.join(" ");
  }
  if (z1 === "spine" && z2 === "venablesEast") {
    const seg = [`M ${x1} ${y1}`];
    if (y1 !== y2) seg.push(`L ${spine} ${y2}`);
    seg.push(`L ${x2} ${y2}`);
    return seg.join(" ");
  }
  if (z1 === "venablesWest" && z2 === "spine") {
    return `M ${x1} ${y1} L ${spine} ${y1} L ${spine} ${y2}`;
  }
  if (z1 === "venablesEast" && z2 === "venablesEast") {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const offSpineZone = (z) =>
    z === "venablesWest" || z === "venablesEast" || z === "victoria" || z === "frances";
  if (offSpineZone(z1) && offSpineZone(z2) && z1 !== z2) {
    return `M ${x1} ${y1} L ${spine} ${y1} L ${spine} ${y2} L ${x2} ${y2}`;
  }

  const fromOffSpine = fromStop ? isStopOffSpine(fromStop) : false;
  const toOffSpine = toStop ? isStopOffSpine(toStop) : false;

  if (toOffSpine && !fromOffSpine) {
    const seg = [`M ${x1} ${y1}`];
    if (!nearSpine(x1)) seg.push(`L ${spine} ${y1}`);
    if (y1 !== y2) seg.push(`L ${spine} ${y2}`);
    seg.push(`L ${x2} ${y2}`);
    return seg.join(" ");
  }

  if (fromOffSpine && !toOffSpine) {
    const seg = [`M ${x1} ${y1}`, `L ${spine} ${y1}`];
    if (y1 !== y2) seg.push(`L ${spine} ${y2}`);
    if (!nearSpine(x2)) seg.push(`L ${x2} ${y2}`);
    return seg.join(" ");
  }

  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function getHybridLegPathD(a, b) {
  const fromOff = isStopOffSpine(a.stop);
  const toOff = isStopOffSpine(b.stop);
  if (fromOff || toOff) {
    return getCurvedOffSpinePathD(
      a.dotX,
      a.dotY,
      b.dotX,
      b.dotY,
      a.stop,
      b.stop,
      a.lineX,
      b.lineX
    );
  }
  return getMapLegPathD(a.dotX, a.dotY, b.dotX, b.dotY, a.stop, b.stop);
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

function getRouteMapLayout(route, options = {}) {
  const hybrid = !!options.hybrid;
  const station = { x: MAP.xCenter, y: MAP.yStation };
  const routeLegs = getRouteLegs(route);
  if (!route.length) {
    return { station, points: [], legs: [], stopCount: 0 };
  }

  const points = hybrid ? prepareHybridPoints(route) : buildRouteMapPoints(route);

  const legs = routeLegs.map((leg, i) => {
    let x1, y1, x2, y2;
    let fromStop = null;
    let toStop = null;
    let pathD;

    if (leg.legKind === "stationToStop") {
      const p = getMapPointForRouteIndex(points, route, leg.toStopIndex);
      x1 = station.x;
      y1 = station.y;
      x2 = hybrid ? p.dotX : p.x;
      y2 = hybrid ? p.dotY : p.y;
      toStop = p.stop;
      if (hybrid) {
        if (isStopOffSpine(p.stop)) {
          pathD = getCurvedOffSpinePathD(
            station.x,
            station.y,
            p.dotX,
            p.dotY,
            null,
            p.stop,
            MAP.xCenter,
            MAP.xCenter
          );
        } else {
          pathD = `M ${MAP.xCenter} ${station.y} L ${p.dotX} ${p.dotY}`;
        }
      } else {
        pathD = getMapLegPathD(x1, y1, x2, y2, null, toStop);
      }
    } else if (leg.legKind === "stopToStop") {
      const a = getMapPointForRouteIndex(points, route, leg.fromStopIndex);
      const b = getMapPointForRouteIndex(points, route, leg.toStopIndex);
      fromStop = a.stop;
      toStop = b.stop;
      if (hybrid) {
        x1 = a.dotX;
        y1 = a.dotY;
        x2 = b.dotX;
        y2 = b.dotY;
        if (isReturnSouthLaneLeg(leg, route, y1, y2)) {
          pathD = getHybridReturnSouthPathD(x1, y1, x2, y2, a.stop, b.stop);
        } else {
          pathD = getHybridLegPathD(a, b);
        }
      } else {
        x1 = a.x;
        y1 = a.y;
        x2 = b.x;
        y2 = b.y;
        pathD = getMapLegPathD(x1, y1, x2, y2, fromStop, toStop);
      }
    } else if (leg.legKind === "stopToStation") {
      const p = getMapPointForRouteIndex(points, route, leg.fromStopIndex);
      fromStop = p.stop;
      x1 = hybrid ? p.dotX : p.x;
      y1 = hybrid ? p.dotY : p.y;
      x2 = station.x;
      y2 = station.y;
      if (hybrid) {
        if (isReturnSouthLaneLeg(leg, route, y1, y2)) {
          pathD = getHybridReturnSouthPathD(x1, y1, x2, y2, p.stop, null);
        } else if (isStopOffSpine(p.stop)) {
          pathD = getCurvedOffSpinePathD(
            p.dotX,
            p.dotY,
            station.x,
            station.y,
            p.stop,
            null,
            p.lineX,
            MAP.xCenter
          );
        } else {
          pathD = `M ${p.dotX} ${p.dotY} L ${MAP.xCenter} ${station.y}`;
        }
      } else {
        pathD = getMapLegPathD(x1, y1, x2, y2, fromStop, null);
      }
    }

    const isBackward = isMapLegBackward(y1, y2);
    return {
      ...leg,
      x1,
      y1,
      x2,
      y2,
      pathD,
      legIndex: i,
      isBackward,
    };
  });

  return { station, points, legs, stopCount: route.length };
}

function getMapSpineBounds(points, showStation, hybrid) {
  const ys = points.map((p) => (hybrid && p.layoutY != null ? p.layoutY : p.y));
  if (showStation) ys.push(MAP.yStation);
  if (!ys.length) return { y1: MAP.yNorth, y2: MAP.yStation };
  const pad = 28;
  return {
    y1: Math.min(...ys) - pad,
    y2: Math.max(...ys) + pad,
  };
}

function collectMapContentBounds(points, legs, showStation) {
  const xs = [];
  const ys = [];

  points.forEach((p) => {
    const x = p.dotX;
    const y = p.dotY;
    const east = isMapStopEastOffset(x);
    const west = isMapStopWestOffset(x);
    if (east || west) {
      xs.push(x - 90, x + 12);
    } else {
      xs.push(x - 12, x + 90);
    }
    ys.push(y - 14, y + 14);
  });

  if (showStation) {
    xs.push(MAP.xCenter - 10, MAP.xCenter + 150);
    ys.push(MAP.yStation - 10, MAP.yStation + 24);
  }

  legs.forEach((leg) => {
    ys.push(leg.y1, leg.y2);
    if (leg.x1 != null) xs.push(leg.x1, leg.x2);
  });

  return { xs, ys };
}

function computeMapViewBox(points, legs, showStation) {
  const { xs, ys } = collectMapContentBounds(points, legs, showStation);
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

function renderCommercialSpineLabelSvg(spineY1, spineY2) {
  const y1 = spineY1 ?? MAP.yNorth;
  const y2 = spineY2 ?? MAP.yStation;
  const x = MAP.xCenter - MAP.returnLaneOffset - 9;
  const y = (y1 + y2) / 2;
  return `
    <text class="map-text map-spine-label map-spine-label--commercial"
          x="${x}" y="${y}"
          text-anchor="middle"
          transform="rotate(-90 ${x} ${y})">Commercial</text>`;
}

function renderMapStaticSvg(options = {}) {
  const showStation = options.showStation !== false;
  const spineY1 = options.spineY1 ?? MAP.yNorth;
  const spineY2 = options.spineY2 ?? MAP.yStation;
  let html = `<line class="map-line" x1="${MAP.xCenter}" y1="${spineY1}" x2="${MAP.xCenter}" y2="${spineY2}" />`;
  html += renderCommercialSpineLabelSvg(spineY1, spineY2);
  if (showStation) {
    html += `
        <circle cx="${MAP.xCenter}" cy="${MAP.yStation}" r="5" fill="var(--ink)"/>
        <text class="map-text map-station-label" x="${MAP.xCenter + 10}" y="${MAP.yStation + 1}" style="white-space: pre;">
          <tspan x="${MAP.xCenter + 10}" dy="0">Commercial&#8209;Broadway</tspan>
          <tspan x="${MAP.xCenter + 10}" dy="11">SkyTrain&#160;station</tspan>
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

function renderMapStopSvg(point, hybrid) {
  const s = point.stop;
  const mapIdx = point.mapIdx ?? point.idx;
  const numLabel = formatMapStopNumberLabel(point);
  const x = hybrid ? point.dotX : point.x;
  const y = hybrid ? point.dotY : point.y;
  const east = isMapStopEastOffset(x);
  const west = isMapStopWestOffset(x);
  const labelX = east || west ? x - 12 : x + 15;
  const labelAnchor = east || west ? "end" : "start";
  return `
        <g class="map-stop-group map-stop-group--hidden" data-stop-index="${mapIdx}">
          <circle class="map-stop" cx="${x}" cy="${y}" r="5" />
          <text class="map-text" x="${labelX}" y="${y + 4}" text-anchor="${labelAnchor}">${numLabel}. ${escapeHtml(s.crossStreet)}</text>
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

function createTraceArrow(routeLayer) {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", "map-trace-arrow");
  const head = document.createElementNS(SVG_NS, "path");
  head.setAttribute("d", "M -7,-4.5 L 0,0 L -7,4.5");
  head.setAttribute("fill", "none");
  g.appendChild(head);
  routeLayer.appendChild(g);
  return g;
}

function syncTraceArrow(pathEl, arrowEl, length) {
  if (!arrowEl || !length) return;
  const offset = parseFloat(getComputedStyle(pathEl).strokeDashoffset) || 0;
  const drawn = Math.max(0, Math.min(length, length - offset));
  if (drawn < 1) {
    arrowEl.style.opacity = "0";
    return;
  }
  const pt = pathEl.getPointAtLength(drawn);
  const ahead = pathEl.getPointAtLength(Math.min(length, drawn + 4));
  const angle = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI;
  arrowEl.setAttribute("transform", `translate(${pt.x},${pt.y}) rotate(${angle})`);
  arrowEl.style.opacity = "1";
  arrowEl.style.color = pathEl.style.stroke || "var(--ink)";
}

function animateMapPath(pathEl, options = {}) {
  const { duration = 1500, onComplete = null, arrowEl = null } = options;
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
  pathEl.setAttribute("fill", "none");

  let arrowFrame = 0;
  const trackArrow = () => {
    if (!arrowEl) return;
    syncTraceArrow(pathEl, arrowEl, length);
    arrowFrame = requestAnimationFrame(trackArrow);
  };
  if (arrowEl) trackArrow();

  requestAnimationFrame(() => {
    pathEl.style.transition = `stroke-dashoffset ${duration}ms ease-in-out`;
    pathEl.style.strokeDashoffset = "0";
  });
  if (onComplete) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (arrowFrame) cancelAnimationFrame(arrowFrame);
      if (arrowEl) arrowEl.style.opacity = "0";
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
  const gen = ++mapAnimationGeneration.map;
  const isStale = () => gen !== mapAnimationGeneration.map;

  const showStation = true;
  const layout = getRouteMapLayout(route, { hybrid: true });
  const { points, legs } = layout;
  const routeLegs = getRouteLegs(route);
  const legDuration = options.legDuration ?? MAP.legDurationMs;
  const spine = getMapSpineBounds(points, showStation, true);

  let html = renderMapStaticSvg({
    showStation,
    spineY1: spine.y1,
    spineY2: spine.y2,
  });
  html += `<g class="map-route-layer"></g><g class="map-overlay-layer"></g>`;
  svgEl.innerHTML = html;

  svgEl.setAttribute(
    "viewBox",
    route.length ? computeMapViewBox(points, legs, showStation) : MAP.defaultViewBox
  );

  const routeLayer = svgEl.querySelector(".map-route-layer");
  const overlayLayer = svgEl.querySelector(".map-overlay-layer");
  const traceArrow = createTraceArrow(routeLayer);

  if (!route.length) {
    options.onComplete?.();
    return;
  }

  function revealStop(stopIndex) {
    const existing = overlayLayer.querySelector(`[data-stop-index="${stopIndex}"]`);
    if (existing) {
      requestAnimationFrame(() => existing.classList.remove("map-stop-group--hidden"));
      return;
    }
    overlayLayer.insertAdjacentHTML("beforeend", renderMapStopSvg(points[stopIndex], true));
    const g = overlayLayer.querySelector(`[data-stop-index="${stopIndex}"]`);
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
    const pathClass = leg.isBackward ? "map-path map-path--backward" : "map-path";

    const legComplete = () => {
      if (isStale()) return;
      const stopIdx = getMapStopIndexAfterLeg(legIndex, routeLegs, route);
      if (stopIdx != null) revealStop(stopIdx);
      runLeg(legIndex + 1);
    };

    const pathEl = document.createElementNS(SVG_NS, "path");
    pathEl.setAttribute("class", pathClass);
    pathEl.setAttribute("data-leg-index", String(legIndex));
    pathEl.setAttribute("d", leg.pathD || `M ${leg.x1} ${leg.y1} L ${leg.x2} ${leg.y2}`);
    pathEl.style.stroke = color;
    routeLayer.appendChild(pathEl);

    animateMapPath(pathEl, {
      duration: legDuration,
      arrowEl: traceArrow,
      onComplete: legComplete,
    });
  }

  runLeg(0);
}

function resolveRoute(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return [];
  return preset.ids.map((id) => allStops.find((s) => s.id === id)).filter(Boolean);
}

function replayMap() {
  drawMap(document.getElementById("route-map"), currentRoute);
}

async function init() {
  const warnEl = document.getElementById("demo-warn");
  const mapEl = document.getElementById("route-map");

  if (window.location.protocol === "file:") {
    if (warnEl) warnEl.hidden = false;
    return;
  }

  try {
    const res = await fetch("/data/stops.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    STATION_LAT = data.station?.lat ?? STATION_LAT;
    STATION_LNG = data.station?.lng ?? STATION_LNG;
    allStops = (data.stops || []).filter((s) => (s.neighborhood || "commercial") === "commercial");
  } catch (err) {
    if (warnEl) warnEl.hidden = false;
    document.querySelector(".demo-shell")?.insertAdjacentHTML(
      "afterbegin",
      `<p class="demo-banner" style="border-color:#c00">Could not load Commercial Drive stops (${escapeHtml(err.message)}). From the repo root run <code>npm run dev</code>, then open <code>http://localhost:3000/demo/commercial-hybrid-paths.html</code>.</p>`
    );
    if (mapEl) {
      mapEl.innerHTML =
        '<text class="map-text" x="20" y="40">Start the dev server to load stop data.</text>';
    }
    return;
  }

  const presetSelect = document.getElementById("preset-select");
  const replay = () => {
    currentRoute = resolveRoute(presetSelect.value);
    replayMap();
  };

  presetSelect.addEventListener("change", replay);
  document.getElementById("btn-replay").addEventListener("click", replay);
  presetSelect.value = "backtrack";
  replay();
}

init();
