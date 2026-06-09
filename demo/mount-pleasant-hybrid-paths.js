/**
 * Mount Pleasant (Main Street) — hybrid route map trial demo.
 *
 * Same aesthetic as Commercial Drive hybrid paths:
 * - Spine: station at top; Main runs south (down). Stops spaced by latitude.
 * - Off-spine (west of Main today): rounded L-shapes at spine junctions — mirrors Victoria/Frances.
 * - Return to station uses the gold left parallel lane (upward).
 *
 * Data: data/mount-pleasant-draft.json. Station: Main Street–Science World.
 */

const WALK_SPEED_KMH = 5;

const MAP = {
  xCenter: 150,
  xEast: 175,
  xWest: 125,
  xWestMid: 115,
  xWestFar: 108,
  xWestDeep: 100,
  mainSpineLng: -123.1004,
  /** Station anchors the top of the spine; route runs south (down) from here. */
  yStation: 72,
  yRouteSpan: 480,
  legDurationMs: 1400,
  defaultViewBox: "0 0 340 600",
  viewBoxPad: 24,
  viewBoxNorthPad: 48,
  viewBoxBottomPad: 20,
  cornerRadius: 18,
  returnLaneOffset: 5,
  returnLaneCurve: 4,
};

const SVG_NS = "http://www.w3.org/2000/svg";

const MAP_LEG_COLORS_BASE = ["#3d8f4a", "#52a362", "#6ab87a", "#84cc94", "#9ad4a8"];
const MAP_BACKWARD_COLOR = "#c9a227";
const STATION_WALK_LABEL = "Main Street–Science World Station";

const PRESETS = {
  "spine-north": {
    label: "Main spine north (Antisocial → 6th cluster → 10th)",
    ids: ["s71", "s81", "s86", "s91"],
  },
  "quebec-hop": {
    label: "Quebec hop (Earnest → Glory → Federal)",
    ids: ["s73", "s74", "s80"],
  },
  "west-crawl": {
    label: "West crawl (Purebread → Vintage → park → brewery)",
    ids: ["s75", "s76", "s78", "s79"],
  },
  "mixed-main-quebec": {
    label: "Main ↔ Quebec (6th Ave → Earnest → 5th Ave)",
    ids: ["s81", "s73", "s86"],
  },
  "south-parks": {
    label: "South end (Toshi → Mount Pleasant Park → back)",
    ids: ["s98", "s99"],
  },
  backtrack: {
    label: "Backtrack (Narrow → Antisocial → Narrow)",
    ids: ["s70", "s71", "s70"],
  },
  "full-west-loop": {
    label: "Spine + west loop (Main → Quebec → west crawl → Main)",
    ids: ["s88", "s73", "s75", "s78", "s79", "s91"],
  },
};

let STATION_LAT = 49.273056;
let STATION_LNG = -123.100278;
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

function isReturnToStationLaneLeg(leg, route, y1, y2) {
  if (y2 >= y1) return false;
  if (leg.legKind === "stopToStation") return true;
  if (leg.legKind === "stopToStop" && leg.toStopIndex === 0) return true;
  return false;
}

function appendReturnToStationLane(parts, y1, y2) {
  const xMain = MAP.xCenter;
  const xLane = MAP.xCenter - MAP.returnLaneOffset;
  const r = MAP.returnLaneCurve;
  if (Math.abs(y1 - y2) < r * 2) {
    parts.push(`L ${xMain} ${y2}`);
    return;
  }
  parts.push(`Q ${xLane} ${y1} ${xLane} ${y1 - r}`);
  parts.push(`L ${xLane} ${y2 + r}`);
  parts.push(`Q ${xLane} ${y2} ${xMain} ${y2}`);
}

/** Tiny curve onto a left parallel lane, then north to the station on the spine column. */
function getReturnToStationLanePathD(y1, y2) {
  const parts = [`M ${MAP.xCenter} ${y1}`];
  appendReturnToStationLane(parts, y1, y2);
  return parts.join(" ");
}

function getHybridReturnToStationPathD(x1, y1, x2, y2, fromStop, toStop) {
  const spine = MAP.xCenter;
  const fromOff = fromStop ? isStopOffSpine(fromStop) : false;
  const toOff = toStop ? isStopOffSpine(toStop) : false;

  if (fromOff && !toOff) {
    const parts = [`M ${x1} ${y1}`];
    parts.push(roundedHorizVert(x1, y1, spine, y1, y2));
    appendReturnToStationLane(parts, y1, y2);
    return parts.join(" ");
  }

  return getReturnToStationLanePathD(y1, y2);
}

function getSeasonFadeTop() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--fade-top").trim();
  return v || "#b2fdb5";
}

function getMapLegColors() {
  return [...MAP_LEG_COLORS_BASE, getSeasonFadeTop()];
}

function isMapLegBackward(y1, y2) {
  return y2 < y1;
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

function isWestOffMainCrossStreet(crossStreet) {
  return /\b(quebec|ontario|columbia|kingsway)\b/i.test(String(crossStreet || ""));
}

function isEastOffMainCrossStreet(_crossStreet) {
  return false;
}

function westLngDelta(lng) {
  return MAP.mainSpineLng - Number(lng);
}

/** Map X from how far west of Main the pin sits (mirrors Frances vs Clark tiers on Commercial). */
function inferWestMapXFromLng(lng) {
  const d = westLngDelta(lng);
  if (d < 0.003) return MAP.xWest;
  if (d < 0.005) return MAP.xWestMid;
  if (d < 0.007) return MAP.xWestFar;
  return MAP.xWestDeep;
}

function getStopMapZone(stop) {
  if (!stop) return "spine";
  const explicit = stop.coords?.x;
  if (explicit != null && explicit < MAP.xCenter - 5) return "westOffMain";
  if (explicit != null && explicit > MAP.xCenter + 5) return "eastOffMain";
  if (isWestOffMainCrossStreet(stop.crossStreet)) return "westOffMain";
  if (isEastOffMainCrossStreet(stop.crossStreet)) return "eastOffMain";
  if (stop.lng != null && westLngDelta(stop.lng) > 0.0015) return "westOffMain";
  return "spine";
}

function isStopWestOffMain(stop) {
  if (!stop) return false;
  return getStopMapZone(stop) === "westOffMain" || getStopMapX(stop) < MAP.xCenter - 5;
}

function isStopEastOffMain(stop) {
  if (!stop) return false;
  return getStopMapZone(stop) === "eastOffMain" || getStopMapX(stop) > MAP.xCenter + 5;
}

function getStopMapX(stop) {
  const zone = getStopMapZone(stop);
  const explicit = stop.coords?.x;
  if (explicit != null && explicit !== MAP.xCenter) return explicit;
  if (zone === "eastOffMain") return MAP.xEast;
  if (zone === "westOffMain" && stop.lng != null) return inferWestMapXFromLng(stop.lng);
  if (zone === "westOffMain") return MAP.xWest;
  return MAP.xCenter;
}

/** Pin label: off-Main stops show the side street, not Main. */
function mapLabelCrossStreet(crossStreet, stop) {
  const cs = String(crossStreet || "").trim();
  if (!cs) return "";
  if (!isStopOffSpine(stop)) {
    const mainMatch = cs.match(/&\s*(.+)$/);
    return mainMatch ? mainMatch[1].trim() : cs;
  }
  if (/\bquebec\b/i.test(cs)) return cs.split("&")[0].replace(/\.$/, "").trim();
  if (/\bontario\b/i.test(cs)) return "Ontario St";
  if (/\bcolumbia\b/i.test(cs)) return "Columbia St";
  if (/\bkingsway\b/i.test(cs)) return "Kingsway";
  if (/\bmain\b/i.test(cs)) {
    const mainMatch = cs.match(/&\s*(.+)$/);
    return mainMatch ? mainMatch[1].trim() : cs;
  }
  const parts = cs.split("&").map((p) => p.trim());
  return parts[parts.length - 1] || parts[0];
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

function applyStopLabelLayout(points) {
  const labelGap = 15;
  const westLabels = [];
  points.forEach((point) => {
    point.labelOffsetY = 0;
    const x = point.dotX ?? point.x;
    if (!isMapStopWestOffset(x) && !isMapStopEastOffset(x)) return;
    const baseY = point.dotY ?? point.y;
    let offset = 0;
    for (const prev of westLabels) {
      const prevBottom = prev.baseY + prev.offset + 10;
      const needed = prevBottom + labelGap - (baseY + offset);
      if (needed > 0) offset += needed;
    }
    point.labelOffsetY = offset;
    westLabels.push({ baseY, offset });
  });
  return points;
}

function alignOffMainMapPoints(points) {
  return points;
}

function layoutRouteMapPointsFromStation(route) {
  const routeLats = route.map((s) => s.lat);
  const minLat = Math.min(...routeLats);
  const latSpan = STATION_LAT - minLat;
  const safeSpan = latSpan > 1e-6 ? latSpan : 1e-6;

  return route.map((stop, idx) => {
    const t = Math.max(0, Math.min(1, (STATION_LAT - stop.lat) / safeSpan));
    const y = MAP.yStation + t * MAP.yRouteSpan;
    const x = getStopMapX(stop);
    return { stop, x, y, idx };
  });
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
  return alignOffMainMapPoints(points);
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
  applyStopLabelLayout(points);
  return points;
}

/** West off-Main legs follow the street grid: down/up the side column, then across. */
function getWestOffMainGridPathD(x1, y1, x2, y2) {
  if (Math.abs(x1 - x2) < 0.5 || Math.abs(y1 - y2) < 0.5) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  const parts = [`M ${x1} ${y1}`];
  parts.push(roundedVertHoriz(x1, y1, x2, y2));
  return parts.join(" ");
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
  const fromOff = fromStop ? isStopOffSpine(fromStop) : false;
  const toOff = toStop ? isStopOffSpine(toStop) : false;
  const parts = [];

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
    if (fromStop && toStop && isStopWestOffMain(fromStop) && isStopWestOffMain(toStop)) {
      return getWestOffMainGridPathD(x1, y1, x2, y2);
    }
    if (fromStop && toStop && isStopEastOffMain(fromStop) && isStopEastOffMain(toStop)) {
      return getWestOffMainGridPathD(x1, y1, x2, y2);
    }
    parts.push(`M ${x1} ${y1}`);
    parts.push(roundedHorizVert(x1, y1, spine, y1, y2));
    if (Math.abs(y1 - y2) > 0.5) parts.push(`L ${spine} ${y2}`);
    parts.push(roundedVertHoriz(spine, y2, x2, y2));
    return parts.join(" ");
  }

  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function getMapLegPathD(x1, y1, x2, y2, fromStop, toStop) {
  const spine = MAP.xCenter;
  const nearSpine = (x) => Math.abs(x - spine) <= 5;
  const fromOffSpine = fromStop ? isStopOffSpine(fromStop) : false;
  const toOffSpine = toStop ? isStopOffSpine(toStop) : false;

  if (fromOffSpine && toOffSpine) {
    if (fromStop && toStop && isStopWestOffMain(fromStop) && isStopWestOffMain(toStop)) {
      return getWestOffMainGridPathD(x1, y1, x2, y2);
    }
    if (fromStop && toStop && isStopEastOffMain(fromStop) && isStopEastOffMain(toStop)) {
      return getWestOffMainGridPathD(x1, y1, x2, y2);
    }
    return `M ${x1} ${y1} L ${spine} ${y1} L ${spine} ${y2} L ${x2} ${y2}`;
  }

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
        if (isReturnToStationLaneLeg(leg, route, y1, y2)) {
          pathD = getHybridReturnToStationPathD(x1, y1, x2, y2, a.stop, b.stop);
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
        if (isReturnToStationLaneLeg(leg, route, y1, y2)) {
          pathD = getHybridReturnToStationPathD(x1, y1, x2, y2, p.stop, null);
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
  if (!ys.length) return { y1: MAP.yStation, y2: MAP.yStation + MAP.yRouteSpan };
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
    const labelY = y + (p.labelOffsetY || 0);
    const east = isMapStopEastOffset(x);
    const west = isMapStopWestOffset(x);
    if (east || west) {
      xs.push(x - 96, x + 12);
    } else {
      xs.push(x - 12, x + 90);
    }
    ys.push(y - 16, labelY + 16);
  });

  if (showStation) {
    xs.push(MAP.xCenter - 96, MAP.xCenter + 12);
    ys.push(MAP.yStation - 10, MAP.yStation + 22);
  }

  legs.forEach((leg) => {
    ys.push(leg.y1, leg.y2);
    if (leg.x1 != null) xs.push(leg.x1, leg.x2);
  });

  return { xs, ys };
}

function computeMapViewBox(points, legs, showStation, containerAspect) {
  const spine = getMapSpineBounds(points, showStation, true);
  const { xs } = collectMapContentBounds(points, legs, showStation);
  if (!xs.length) return MAP.defaultViewBox;

  const pad = MAP.viewBoxPad;
  let minX = Math.min(...xs) - pad;
  let maxX = Math.max(...xs) + pad;
  let minY = MAP.yStation - MAP.viewBoxNorthPad;
  let maxY = Math.max(spine.y2 + MAP.viewBoxBottomPad, MAP.yStation + MAP.yRouteSpan * 0.35);
  let w = Math.max(maxX - minX, 120);
  let h = Math.max(maxY - minY, 120);

  if (containerAspect && containerAspect > 0) {
    const targetH = w / containerAspect;
    if (targetH > h) {
      h = targetH;
      maxY = minY + h;
    } else {
      w = h * containerAspect;
      minX = MAP.xCenter - w * 0.62;
    }
  }

  return `${minX} ${minY} ${w} ${h}`;
}

function applyMapViewBox(svgEl, points, legs, showStation, containerAspect) {
  const viewBox = computeMapViewBox(points, legs, showStation, containerAspect);
  svgEl.setAttribute("viewBox", viewBox);
  const spineLine = svgEl.querySelector(".map-line");
  if (spineLine) {
    const [, , , vbH] = viewBox.split(/\s+/).map(Number);
    spineLine.setAttribute("y1", MAP.yStation);
    spineLine.setAttribute("y2", MAP.yStation - MAP.viewBoxNorthPad + vbH - MAP.viewBoxBottomPad);
  }
  return viewBox;
}

function refitMapToColumn(svgEl, points, legs, showStation) {
  const container = svgEl?.parentElement;
  const review = document.getElementById("route-review");
  if (!container || !review) return;
  const cw = container.clientWidth;
  const ch = review.clientHeight;
  if (!cw || !ch) return;
  applyMapViewBox(svgEl, points, legs, showStation, cw / ch);
}

function renderMapStaticSvg(options = {}) {
  const showStation = options.showStation !== false;
  const spineY1 = options.spineY1 ?? MAP.yStation;
  const spineY2 = options.spineY2 ?? MAP.yStation + MAP.yRouteSpan;
  let html = `<line class="map-line" x1="${MAP.xCenter}" y1="${spineY1}" x2="${MAP.xCenter}" y2="${spineY2}" />`;
  if (showStation) {
    html += `
        <circle cx="${MAP.xCenter}" cy="${MAP.yStation}" r="5" fill="var(--ink)"/>
        <text class="map-text map-spine-label" x="${MAP.xCenter - 8}" y="${MAP.yStation + 4}" text-anchor="end">
          <tspan x="${MAP.xCenter - 8}" dy="0">Main St–Science World</tspan>
          <tspan x="${MAP.xCenter - 8}" dy="9">Station</tspan>
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
  const labelOffsetY = point.labelOffsetY || 0;
  const east = isMapStopEastOffset(x);
  const west = isMapStopWestOffset(x);
  const labelX = east || west ? x - 14 : x + 15;
  const labelY = y + 4 + labelOffsetY;
  const labelAnchor = east || west ? "end" : "start";
  const label = mapLabelCrossStreet(s.crossStreet, s);
  return `
        <g class="map-stop-group map-stop-group--hidden" data-stop-index="${mapIdx}">
          <circle class="map-stop" cx="${x}" cy="${y}" r="5" />
          <text class="map-text map-stop-label" x="${labelX}" y="${labelY}" text-anchor="${labelAnchor}">${numLabel}. ${escapeHtml(label)}</text>
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
  requestAnimationFrame(() => {
    if (!isStale() && route.length) refitMapToColumn(svgEl, points, legs, showStation);
  });

  const onLayoutDone = () => {
    if (!isStale() && route.length) refitMapToColumn(svgEl, points, legs, showStation);
  };

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
      requestAnimationFrame(onLayoutDone);
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

function placeholderImg(color) {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='100%25' height='100%25' fill='%23${color || "cccccc"}'/%3E%3C/svg%3E`;
}

function renderDemoRouteSummary(route) {
  const summaryEl = document.getElementById("route-export-summary");
  const cardsEl = document.getElementById("route-cards");
  const totalsEl = document.getElementById("route-totals");
  if (!cardsEl) return;

  const uniqueRoute = route.filter(
    (stop, idx, arr) => arr.findIndex((s) => s.id === stop.id) === idx
  );
  if (summaryEl) {
    summaryEl.textContent = `YOUR MOUNT PLEASANT ROUTE — ${uniqueRoute.length} STOP${uniqueRoute.length === 1 ? "" : "S"}`;
  }

  cardsEl.innerHTML = route
    .map((stop, idx) => {
      const color = stop.placeholderColor || "cccccc";
      const label = mapLabelCrossStreet(stop.crossStreet, stop);
      return `
        <div class="route-card">
          <img src="${placeholderImg(color)}" alt="" width="100" height="100" />
          <div class="content">
            <h3>${idx + 1}. ${escapeHtml(stop.name)}</h3>
            <div class="meta">${escapeHtml(label)}</div>
          </div>
        </div>`;
    })
    .join("");

  if (totalsEl && route.length) {
    let totalKm = 0;
    let totalMin = 0;
    if (route.length) {
      const first = getWalkLeg(STATION_LAT, STATION_LNG, route[0].lat, route[0].lng);
      totalKm += first.km;
      totalMin += first.minutes;
    }
    for (let i = 0; i < route.length - 1; i++) {
      const leg = getWalkLeg(route[i].lat, route[i].lng, route[i + 1].lat, route[i + 1].lng);
      totalKm += leg.km;
      totalMin += leg.minutes;
    }
    const last = route[route.length - 1];
    const back = getWalkLeg(last.lat, last.lng, STATION_LAT, STATION_LNG);
    totalKm += back.km;
    totalMin += back.minutes;
    totalsEl.innerHTML = `
      <div>Total walking (your route order): ~${formatKm(totalKm)} km · ~${totalMin} min</div>
      <div class="walk-disclaimer">Illustrated map is schematic; use Google Maps for turn-by-turn walking.</div>`;
  } else if (totalsEl) {
    totalsEl.innerHTML = "";
  }
}

function replayMap() {
  const cardsEl = document.getElementById("route-cards");
  if (cardsEl) cardsEl.innerHTML = "";
  drawMap(document.getElementById("route-map"), currentRoute, {
    onComplete: () => {
      renderDemoRouteSummary(currentRoute);
      requestAnimationFrame(() => {
        const svg = document.getElementById("route-map");
        const layout = getRouteMapLayout(currentRoute, { hybrid: true });
        refitMapToColumn(svg, layout.points, layout.legs, true);
      });
    },
  });
}

async function init() {
  const warnEl = document.getElementById("demo-warn");
  const mapEl = document.getElementById("route-map");

  if (window.location.protocol === "file:") {
    if (warnEl) warnEl.hidden = false;
    return;
  }

  try {
    const [draftRes, hoodRes] = await Promise.all([
      fetch("/data/mount-pleasant-draft.json"),
      fetch("/data/neighborhoods.json"),
    ]);
    if (!draftRes.ok) throw new Error(`draft HTTP ${draftRes.status}`);
    if (!hoodRes.ok) throw new Error(`neighborhoods HTTP ${hoodRes.status}`);
    const draft = await draftRes.json();
    const hoods = await hoodRes.json();
    const station = hoods.neighborhoods?.["mount-pleasant"]?.station;
    STATION_LAT = station?.lat ?? STATION_LAT;
    STATION_LNG = station?.lng ?? STATION_LNG;
    allStops = (draft.stops || []).filter((s) => s.neighborhood === "mount-pleasant");
  } catch (err) {
    if (warnEl) warnEl.hidden = false;
    document.querySelector(".demo-shell")?.insertAdjacentHTML(
      "afterbegin",
      `<p class="demo-banner" style="border-color:#c00">Could not load Mount Pleasant draft stops (${escapeHtml(err.message)}). From the repo root run <code>npm run dev</code>, then open <code>http://localhost:3000/demo/mount-pleasant-hybrid-paths.html</code>.</p>`
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
  window.addEventListener("resize", () => {
    if (!currentRoute.length) return;
    const svg = document.getElementById("route-map");
    const layout = getRouteMapLayout(currentRoute, { hybrid: true });
    refitMapToColumn(svg, layout.points, layout.legs, true);
  });
  presetSelect.value = "west-crawl";
  replay();
}

init();
