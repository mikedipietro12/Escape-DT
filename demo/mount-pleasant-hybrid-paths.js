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
  clusterWalkMinutes: 3,
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
  "mid-main-hop": {
    label: "Mid-Main hop (5th → 6th → Earnest — no station)",
    ids: ["s86", "s81", "s73"],
    startAtStation: false,
    endAtStation: false,
  },
  "south-west-walk": {
    label: "South/west walk (Toshi → Purebread → Rogers Park — no station)",
    ids: ["s98", "s75", "s78"],
    startAtStation: false,
    endAtStation: false,
  },
  "west-to-brewery": {
    label: "West to brewery (Vintage → park → 33 Acres — no station)",
    ids: ["s76", "s78", "s79"],
    startAtStation: false,
    endAtStation: false,
  },
  "from-station-end-south": {
    label: "From station, end south (→ Toshi → park — no return)",
    ids: ["s98", "s99"],
    startAtStation: true,
    endAtStation: false,
  },
  "start-south-end-station": {
    label: "Start at Toshi, return to station",
    ids: ["s98", "s75", "s81"],
    startAtStation: false,
    endAtStation: true,
  },
  "full-day-main": {
    label: "Full day on Main (21 stops — cluster test)",
    ids: [
      "s90", "s87", "s88", "s182", "s183", "s184", "s89", "s80", "s91", "s102",
      "s116", "s117", "s122", "s124", "s125", "s121", "s185", "s81", "s79", "s78", "s73",
    ],
  },
};

const MAP_LABEL_FONT_SIZE = 8.5;
const MAP_LABEL_CHAR_WIDTH = 5.35;

let STATION_LAT = 49.273056;
let STATION_LNG = -123.100278;
let allStops = [];
let currentRoute = [];
let currentMapOptions = { startAtStation: true, endAtStation: true };
const mapAnimationGeneration = { map: 0 };

function normalizeMapOptions(mapOptions = {}) {
  return {
    startAtStation: mapOptions.startAtStation !== false,
    endAtStation: mapOptions.endAtStation !== false,
  };
}

function shouldShowStation(mapOptions = {}) {
  const opts = normalizeMapOptions(mapOptions);
  return opts.startAtStation || opts.endAtStation;
}

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

function isReturnToStationLaneLeg(leg, route, y1, y2, mapOptions = {}) {
  if (y2 >= y1) return false;
  const opts = normalizeMapOptions(mapOptions);
  if (leg.legKind === "stopToStation") return opts.endAtStation;
  if (leg.legKind === "stopToStop" && leg.toStopIndex === 0) {
    return opts.startAtStation && opts.endAtStation;
  }
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
  /** Only stack labels when pins share a latitude band — not when the route backtracks north. */
  const labelStackBand = 40;
  const westLabels = [];
  const eastLabels = [];

  function stackLabel(baseY, sideLabels) {
    let offset = 0;
    for (const prev of sideLabels) {
      if (Math.abs(prev.baseY - baseY) > labelStackBand) continue;
      const prevBottom = prev.baseY + prev.offset + 10;
      const needed = prevBottom + labelGap - (baseY + offset);
      if (needed > 0) offset += needed;
    }
    sideLabels.push({ baseY, offset });
    return offset;
  }

  points.forEach((point) => {
    point.labelOffsetY = 0;
    const x = point.dotX ?? point.x;
    if (isMapStopWestOffset(x)) {
      const baseY = point.dotY ?? point.y;
      point.labelOffsetY = stackLabel(baseY, westLabels);
    } else if (isMapStopEastOffset(x)) {
      const baseY = point.dotY ?? point.y;
      point.labelOffsetY = stackLabel(baseY, eastLabels);
    }
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

/** When the route does not bookend at the station, frame north→south using only the stops on the route. */
function layoutRouteMapPointsLocal(route) {
  const routeLats = route.map((s) => s.lat);
  const maxLat = Math.max(...routeLats);
  const minLat = Math.min(...routeLats);
  const latSpan = maxLat - minLat;
  const safeSpan = latSpan > 1e-6 ? latSpan : 1e-6;
  const spanY = MAP.yRouteSpan * 0.82;

  return route.map((stop, idx) => {
    const t = latSpan > 1e-6 ? (maxLat - stop.lat) / safeSpan : 0.5;
    const y = MAP.yStation + t * spanY;
    const x = getStopMapX(stop);
    return { stop, x, y, idx };
  });
}

function layoutRouteMapPoints(route, mapOptions = {}) {
  const opts = normalizeMapOptions(mapOptions);
  if (opts.startAtStation || opts.endAtStation) {
    return layoutRouteMapPointsFromStation(route);
  }
  return layoutRouteMapPointsLocal(route);
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

function stopsShareMapCluster(a, b, mapOptions = {}) {
  if (stopsShareMapLocation(a, b)) return true;
  if (!a || !b) return false;
  if (getStopMapZone(a) !== getStopMapZone(b)) return false;
  if (isStopOffSpine(a) || isStopOffSpine(b)) {
    if (Math.abs(getStopMapX(a) - getStopMapX(b)) > 10) return false;
    if (
      mapLabelCrossStreet(a.crossStreet, a) !== mapLabelCrossStreet(b.crossStreet, b)
    ) {
      return false;
    }
  }
  if (a.walkFromStation != null && b.walkFromStation != null) {
    return (
      Math.abs(a.walkFromStation - b.walkFromStation) <= MAP.clusterWalkMinutes
    );
  }
  return Math.abs(Number(a.lat) - Number(b.lat)) < 0.0008;
}

function buildRouteMapPointGroups(route, mapOptions = {}) {
  const groups = [];
  route.forEach((stop, routeIdx) => {
    const prev = groups[groups.length - 1];
    if (prev && stopsShareMapCluster(prev.stop, stop, mapOptions)) {
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

function buildRouteMapPoints(route, mapOptions = {}) {
  if (!route.length) return [];
  const groups = buildRouteMapPointGroups(route, mapOptions);
  const representatives = groups.map((group) => group.stop);
  const rawPoints = layoutRouteMapPoints(representatives, mapOptions);
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

function prepareHybridPoints(route, mapOptions = {}) {
  const points = buildRouteMapPoints(route, mapOptions);
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

function buildRouteLegs(route, mapOptions = {}, shouldSkipLeg) {
  const opts = normalizeMapOptions(mapOptions);
  if (!route.length) return [];
  const legs = [];
  if (opts.startAtStation) {
    legs.push({
      ...getWalkLeg(STATION_LAT, STATION_LNG, route[0].lat, route[0].lng),
      label: `To ${route[0].name}`,
      legKind: "stationToStop",
      toStopIndex: 0,
    });
  }
  for (let i = 0; i < route.length - 1; i++) {
    if (shouldSkipLeg(i)) continue;
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
  if (opts.endAtStation) {
    const last = route[route.length - 1];
    legs.push({
      ...getWalkLeg(last.lat, last.lng, STATION_LAT, STATION_LNG),
      label: `Back to ${STATION_WALK_LABEL}`,
      legKind: "stopToStation",
      fromStopIndex: route.length - 1,
    });
  }
  return legs;
}

/** Walk totals and map draw — one leg per cluster hop (consecutive stops on the same dot are skipped). */
function getRouteLegs(route, mapOptions = {}) {
  const groups = buildRouteMapPointGroups(route, mapOptions);
  const mapIdxByRouteIdx = [];
  groups.forEach((group) => {
    group.routeIndices.forEach((ri) => {
      mapIdxByRouteIdx[ri] = group.mapIdx;
    });
  });
  return buildRouteLegs(
    route,
    mapOptions,
    (i) => mapIdxByRouteIdx[i] === mapIdxByRouteIdx[i + 1]
  );
}

function getMapPointIndexForRouteIndex(route, routeIdx, mapOptions = {}) {
  const groups = buildRouteMapPointGroups(route, mapOptions);
  for (const group of groups) {
    if (group.routeIndices.includes(routeIdx)) return group.mapIdx;
  }
  return routeIdx;
}

function getMapPointForRouteIndex(points, route, routeIdx, mapOptions = {}) {
  return points[getMapPointIndexForRouteIndex(route, routeIdx, mapOptions)];
}

function getRouteMapLayout(route, options = {}) {
  const hybrid = !!options.hybrid;
  const mapOptions = normalizeMapOptions(options);
  const station = { x: MAP.xCenter, y: MAP.yStation };
  const routeLegs = getRouteLegs(route, mapOptions);
  if (!route.length) {
    return { station, points: [], legs: [], stopCount: 0 };
  }

  const points = hybrid ? prepareHybridPoints(route, options) : buildRouteMapPoints(route, options);

  const legs = routeLegs.map((leg, i) => {
    let x1, y1, x2, y2;
    let fromStop = null;
    let toStop = null;
    let pathD;

    if (leg.legKind === "stationToStop") {
      const p = getMapPointForRouteIndex(points, route, leg.toStopIndex, mapOptions);
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
      const a = getMapPointForRouteIndex(points, route, leg.fromStopIndex, mapOptions);
      const b = getMapPointForRouteIndex(points, route, leg.toStopIndex, mapOptions);
      fromStop = a.stop;
      toStop = b.stop;
      if (hybrid) {
        x1 = a.dotX;
        y1 = a.dotY;
        x2 = b.dotX;
        y2 = b.dotY;
        if (isReturnToStationLaneLeg(leg, route, y1, y2, mapOptions)) {
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
      const p = getMapPointForRouteIndex(points, route, leg.fromStopIndex, mapOptions);
      fromStop = p.stop;
      x1 = hybrid ? p.dotX : p.x;
      y1 = hybrid ? p.dotY : p.y;
      x2 = station.x;
      y2 = station.y;
      if (hybrid) {
        if (isReturnToStationLaneLeg(leg, route, y1, y2, mapOptions)) {
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

function routeHasOnSpineStops(points) {
  return points.some((p) => !isStopOffSpine(p.stop));
}

function shouldDrawSpineLine(points, showStation) {
  if (showStation) return true;
  return routeHasOnSpineStops(points);
}

function getSpineLineExtent(points, showStation, viewBoxRect) {
  if (!shouldDrawSpineLine(points, showStation)) return null;
  const spineYs = points
    .filter((p) => !isStopOffSpine(p.stop))
    .map((p) => p.dotY ?? p.y);
  const pad = 24;
  if (showStation) {
    const y2 = viewBoxRect
      ? viewBoxRect.minY + viewBoxRect.h - MAP.viewBoxBottomPad
      : Math.max(...points.map((p) => p.dotY ?? p.y), MAP.yStation) + pad;
    return { y1: MAP.yStation, y2 };
  }
  if (spineYs.length) {
    return { y1: Math.min(...spineYs) - pad, y2: Math.max(...spineYs) + pad };
  }
  const allYs = points.map((p) => p.dotY ?? p.y);
  if (!allYs.length) return null;
  return { y1: Math.min(...allYs) - pad, y2: Math.max(...allYs) + pad };
}

function estimateLabelWidth(text) {
  return String(text || "").length * MAP_LABEL_CHAR_WIDTH + 8;
}

function getStopLabelText(point) {
  const indices = point.routeIndices || [point.idx];
  const first = indices[0] + 1;
  const last = indices[indices.length - 1] + 1;
  const numLabel = first === last ? `${first}` : `${first}–${last}`;
  const label = mapLabelCrossStreet(point.stop.crossStreet, point.stop);
  return `${numLabel}. ${label}`.toUpperCase();
}

function measureRenderedTextBounds(svgEl) {
  const xs = [];
  const ys = [];
  if (!svgEl) return { xs, ys };
  svgEl.querySelectorAll("text").forEach((el) => {
    try {
      const bb = el.getBBox();
      if (bb.width > 0 && bb.height > 0) {
        xs.push(bb.x, bb.x + bb.width);
        ys.push(bb.y, bb.y + bb.height);
      }
    } catch (_) {
      /* getBBox throws when element is not rendered yet */
    }
  });
  return { xs, ys };
}

function parseViewBox(viewBoxStr) {
  const [minX, minY, w, h] = String(viewBoxStr).split(/\s+/).map(Number);
  return { minX, minY, w, h };
}

function expandViewBoxRect(rect, xs, ys, pad) {
  let { minX, minY, w, h } = rect;
  let maxX = minX + w;
  let maxY = minY + h;
  if (xs.length) {
    minX = Math.min(minX, Math.min(...xs) - pad);
    maxX = Math.max(maxX, Math.max(...xs) + pad);
  }
  if (ys.length) {
    minY = Math.min(minY, Math.min(...ys) - pad);
    maxY = Math.max(maxY, Math.max(...ys) + pad);
  }
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}

function applyContainerAspect(rect, containerAspect) {
  if (!containerAspect || containerAspect <= 0) return rect;
  let { minX, minY, w, h } = rect;
  const targetH = w / containerAspect;
  if (targetH > h) {
    return { minX, minY, w, h: targetH };
  }
  const targetW = h * containerAspect;
  if (targetW > w) {
    return { minX: minX - (targetW - w), minY, w: targetW, h };
  }
  return rect;
}

function formatViewBox(rect) {
  return `${rect.minX} ${rect.minY} ${rect.w} ${rect.h}`;
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
    const labelW = estimateLabelWidth(getStopLabelText(p));
    if (east || west) {
      xs.push(x - 10 - labelW, x + 10);
    } else {
      xs.push(x - 10, x + 12 + labelW);
    }
    ys.push(y - 8, y + 8, labelY - 8, labelY + 10);
  });

  if (showStation) {
    const lineW = Math.max(
      estimateLabelWidth("MAIN ST–SCIENCE WORLD"),
      estimateLabelWidth("STATION")
    );
    xs.push(MAP.xCenter - 6 - lineW, MAP.xCenter + 10);
    ys.push(MAP.yStation - 8, MAP.yStation + 18);
  }

  legs.forEach((leg) => {
    ys.push(leg.y1, leg.y2);
    if (leg.x1 != null) xs.push(leg.x1, leg.x2);
  });

  return { xs, ys };
}

function computeMapViewBox(points, legs, showStation, containerAspect, measured = null) {
  const spine = getMapSpineBounds(points, showStation, true);
  const { xs, ys } = collectMapContentBounds(points, legs, showStation);
  if (!xs.length) return MAP.defaultViewBox;

  const pad = MAP.viewBoxPad;
  const contentMinX = Math.min(...xs) - pad;
  let minY = showStation
    ? MAP.yStation - MAP.viewBoxNorthPad
    : Math.min(...ys) - pad;
  let maxY = showStation
    ? Math.max(spine.y2 + MAP.viewBoxBottomPad, MAP.yStation + MAP.yRouteSpan * 0.35, ...ys)
    : Math.max(...ys) + pad;

  let rect = expandViewBoxRect(
    {
      minX: contentMinX,
      minY,
      w: Math.max(Math.max(...xs) + pad - contentMinX, 120),
      h: Math.max(maxY - minY, 120),
    },
    measured?.xs || [],
    measured?.ys || [],
    pad
  );
  rect = applyContainerAspect(rect, containerAspect);
  return formatViewBox(rect);
}

function applyMapViewBox(svgEl, points, legs, showStation, containerAspect) {
  const measured = measureRenderedTextBounds(svgEl);
  const viewBox = computeMapViewBox(points, legs, showStation, containerAspect, measured);
  svgEl.setAttribute("viewBox", viewBox);
  const spineLine = svgEl.querySelector(".map-line");
  const viewBoxRect = parseViewBox(viewBox);
  const spineExtent = getSpineLineExtent(points, showStation, viewBoxRect);
  if (spineLine && spineExtent) {
    spineLine.setAttribute("y1", spineExtent.y1);
    spineLine.setAttribute("y2", spineExtent.y2);
    spineLine.style.display = "";
  } else if (spineLine) {
    spineLine.style.display = "none";
  }
  return viewBox;
}

function refitMapToColumn(svgEl, points, legs, showStation) {
  const container = svgEl?.parentElement;
  if (!container || !svgEl) return;
  const cw = container.clientWidth;
  let ch = container.clientHeight;
  if (!ch) ch = svgEl.getBoundingClientRect().height;
  if (!cw || !ch) return;
  applyMapViewBox(svgEl, points, legs, showStation, cw / ch);
}

function renderMapStaticSvg(options = {}) {
  const showStation = options.showStation !== false;
  const showSpine = options.showSpine !== false;
  const spineY1 = options.spineY1 ?? MAP.yStation;
  const spineY2 = options.spineY2 ?? MAP.yStation + MAP.yRouteSpan;
  let html = "";
  if (showSpine) {
    html += `<line class="map-line" x1="${MAP.xCenter}" y1="${spineY1}" x2="${MAP.xCenter}" y2="${spineY2}" />`;
  }
  if (showStation) {
    html += `
        <circle cx="${MAP.xCenter}" cy="${MAP.yStation}" r="4" fill="var(--ink)"/>
        <text class="map-text map-spine-label" x="${MAP.xCenter - 6}" y="${MAP.yStation + 3}" text-anchor="end">
          <tspan x="${MAP.xCenter - 6}" dy="0">Main St–Science World</tspan>
          <tspan x="${MAP.xCenter - 6}" dy="8">Station</tspan>
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
  const labelX = east || west ? x - 10 : x + 12;
  const labelY = y + 3 + labelOffsetY;
  const labelAnchor = east || west ? "end" : "start";
  const label = mapLabelCrossStreet(s.crossStreet, s);
  return `
        <g class="map-stop-group map-stop-group--hidden" data-stop-index="${mapIdx}">
          <circle class="map-stop" cx="${x}" cy="${y}" r="4" />
          <text class="map-text map-stop-label" x="${labelX}" y="${labelY}" text-anchor="${labelAnchor}">${numLabel}. ${escapeHtml(label)}</text>
        </g>
      `;
}

function getMapStopIndexAfterLeg(legIndex, routeLegs, route, mapOptions = {}) {
  const leg = routeLegs[legIndex];
  if (!leg) return null;
  let routeIdx = null;
  if (leg.legKind === "stationToStop" || leg.legKind === "stopToStop") {
    routeIdx = leg.toStopIndex;
  } else if (leg.legKind === "stopToStation") {
    routeIdx = leg.fromStopIndex;
  }
  if (routeIdx == null) return null;
  return getMapPointIndexForRouteIndex(route, routeIdx, mapOptions);
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

  const mapOptions = normalizeMapOptions(options.mapOptions);
  const showStation = shouldShowStation(mapOptions);
  const layoutOpts = { hybrid: true, ...mapOptions };
  const layout = getRouteMapLayout(route, layoutOpts);
  const { points, legs } = layout;
  const routeLegs = getRouteLegs(route, mapOptions);
  const legDuration = options.legDuration ?? MAP.legDurationMs;
  const spine = getMapSpineBounds(points, showStation, true);
  const spineExtent = getSpineLineExtent(points, showStation);
  const drawSpine = !!spineExtent;

  let html = renderMapStaticSvg({
    showStation,
    showSpine: drawSpine,
    spineY1: spineExtent?.y1 ?? spine.y1,
    spineY2: spineExtent?.y2 ?? spine.y2,
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
    if (!isStale() && route.length) {
      ensureAllStopsVisible(svgEl, points);
      refitMapToColumn(svgEl, points, legs, showStation);
    }
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
      const stopIdx = getMapStopIndexAfterLeg(legIndex, routeLegs, route, mapOptions);
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

function ensureAllStopsVisible(svgEl, points) {
  const overlayLayer = svgEl?.querySelector(".map-overlay-layer");
  if (!overlayLayer) return;
  points.forEach((point, idx) => {
    const mapIdx = point.mapIdx ?? idx;
    let g = overlayLayer.querySelector(`[data-stop-index="${mapIdx}"]`);
    if (!g) {
      overlayLayer.insertAdjacentHTML("beforeend", renderMapStopSvg(point, true));
      g = overlayLayer.querySelector(`[data-stop-index="${mapIdx}"]`);
    }
    g?.classList.remove("map-stop-group--hidden");
  });
}

function resolvePreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) {
    return { route: [], mapOptions: normalizeMapOptions({}) };
  }
  return {
    route: preset.ids.map((id) => allStops.find((s) => s.id === id)).filter(Boolean),
    mapOptions: normalizeMapOptions(preset),
  };
}

function placeholderImg(color) {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='100%25' height='100%25' fill='%23${color || "cccccc"}'/%3E%3C/svg%3E`;
}

function renderDemoRouteSummary(route, mapOptions = currentMapOptions) {
  const summaryEl = document.getElementById("route-export-summary");
  const cardsEl = document.getElementById("route-cards");
  const totalsEl = document.getElementById("route-totals");
  if (!cardsEl) return;

  const opts = normalizeMapOptions(mapOptions);
  const uniqueRoute = route.filter(
    (stop, idx, arr) => arr.findIndex((s) => s.id === stop.id) === idx
  );
  const endpointNote = !opts.startAtStation && !opts.endAtStation
    ? " · first stop → last stop"
    : !opts.startAtStation
      ? " · starts at first stop"
      : !opts.endAtStation
        ? " · ends at last stop"
        : "";
  if (summaryEl) {
    summaryEl.textContent = `YOUR MOUNT PLEASANT ROUTE — ${uniqueRoute.length} STOP${uniqueRoute.length === 1 ? "" : "S"}${endpointNote}`;
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
    const walkLegs = getRouteLegs(route, mapOptions);
    const totalKm = walkLegs.reduce((sum, leg) => sum + leg.km, 0);
    const totalMin = walkLegs.reduce((sum, leg) => sum + leg.minutes, 0);
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
  const mapOptions = currentMapOptions;
  const showStation = shouldShowStation(mapOptions);
  drawMap(document.getElementById("route-map"), currentRoute, {
    mapOptions,
    onComplete: () => {
      renderDemoRouteSummary(currentRoute, mapOptions);
      requestAnimationFrame(() => {
        const svg = document.getElementById("route-map");
        const layout = getRouteMapLayout(currentRoute, { hybrid: true, ...mapOptions });
        ensureAllStopsVisible(svg, layout.points);
        refitMapToColumn(svg, layout.points, layout.legs, showStation);
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
    const resolved = resolvePreset(presetSelect.value);
    currentRoute = resolved.route;
    currentMapOptions = resolved.mapOptions;
    replayMap();
  };

  presetSelect.addEventListener("change", replay);
  document.getElementById("btn-replay").addEventListener("click", replay);
  window.addEventListener("resize", () => {
    if (!currentRoute.length) return;
    const svg = document.getElementById("route-map");
    const showStation = shouldShowStation(currentMapOptions);
    const layout = getRouteMapLayout(currentRoute, { hybrid: true, ...currentMapOptions });
    refitMapToColumn(svg, layout.points, layout.legs, showStation);
  });
  presetSelect.value = "west-crawl";
  replay();
}

init();
