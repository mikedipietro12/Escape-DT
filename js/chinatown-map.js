/**
 * Chinatown grid route map — Manhattan routing on arterial intersections.
 * Loaded by index.html; exposes window.ChinatownMap.
 */
(function () {
  const WALK_SPEED_KMH = 5;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const DEFAULT_STATION_LAT = 49.273056;
  const DEFAULT_STATION_LNG = -123.100278;
  const DEFAULT_STATION_LABEL = "Main Street–Science World Station";

  const GMAP = {
    xMin: 48,
    xMax: 552,
    yMin: 56,
    yMax: 420,
    defaultViewBox: "0 0 600 480",
    legDurationMs: 2200,
    legDurationMinMs: 1100,
    viewBoxPad: 28,
    stationSouthPad: 36,
    cornerRadius: 14,
    stopNumOffset: 10,
    vLabelLeftOffset: 7,
    /** East-corridor vertical (Glen): label sits on the line in the skytrain gap. */
    vLabelRightOffset: 6,
    /** Vertical name anchor sits in the Georgia → station gap (text reads upward). */
    vLabelGapTopPad: 12,
    vLabelAboveStation: 32,
    vLabelGapAnchor: 0.84,
    vLineExtendAboveStation: 10,
    /** Parallel lane west of Main for return-to-station legs (avoids retracing the route). */
    returnLaneOffset: 8,
    returnLaneCurve: 10,
  };

  const MAP_LEG_COLORS = ["#3d8f4a", "#52a362", "#6ab87a", "#84cc94", "#9ad4a8", "#ffeea1"];
  const MAP_BACKWARD_COLOR = "#c9a227";

  /**
   * Horizontal arterial jogs — sharp polyline steps (not rounded curves).
   * Segments: { to } = horizontal to fraction of span; { dx, dy } = diagonal jog;
   * { to, yOff } = horizontal to fraction at y + yOff (px, +south).
   * Intersection grid Y stays on spine `y`; shapes are cosmetic street character.
   */
  const EAST_BOOKEND_ID = "glen";
  const EAST_CORRIDOR_VERTICAL_IDS = new Set([EAST_BOOKEND_ID]);

  const H_STREET_SHAPE = {
    powell: [
      { to: 0.68 },
      { dx: 0.11, dy: 9 },
      { to: 1, yOff: -5 },
    ],
    hastings: [
      { to: 0.9 },
      { dx: 0.04, dy: -8 },
      { to: 1 },
    ],
    keefer: [
      { to: 0.1 },
      { dx: 0.05, dy: -8 },
      { to: 0.7, yOff: -8 },
    ],
    union: [
      { to: 0.25 },
      { dx: 0.05, dy: 10 },
      { to: 0.75, yOff: 10 },
      { dx: 0.05, dy: -10 },
      { to: 1 },
    ],
  };

  /** Fallback if fetch fails; kept in sync with data/chinatown-grid.json */
  const DEFAULT_GRID = {
    verticalStreets: [
      { id: "carrall", name: "Carrall St", lng: -123.1036, aliases: ["carrall", "carrall st"] },
      { id: "columbia", name: "Columbia St", lng: -123.1019, aliases: ["columbia", "columbia st"] },
      { id: "main", name: "Main St", lng: -123.1004, aliases: ["main", "main st", "main street"] },
      { id: "gore", name: "Gore Ave", lng: -123.0972, aliases: ["gore", "gore ave", "gore avenue"] },
      { id: "glen", name: "Glen Dr", lng: -123.0919, aliases: ["glen", "glen dr", "glen drive"] },
    ],
    horizontalStreets: [
      { id: "powell", name: "Powell St", lat: 49.2834, aliases: ["powell", "powell st", "e powell"] },
      { id: "hastings", name: "E Hastings St", lat: 49.28115, aliases: ["hastings", "e hastings", "e hastings st"] },
      { id: "pender", name: "E Pender St", lat: 49.28025, aliases: ["pender", "e pender", "e pender st"] },
      { id: "keefer", name: "Keefer St", lat: 49.27935, aliases: ["keefer", "keefer st"] },
      { id: "georgia", name: "E Georgia St", lat: 49.27835, aliases: ["georgia", "e georgia", "e georgia st"] },
      { id: "union", name: "Union St", lat: 49.27735, aliases: ["union", "union st"] },
      { id: "prior", name: "Prior St", lat: 49.27615, aliases: ["prior", "prior st"] },
    ],
  };

  let gridConfig = null;
  let gridLoadPromise = null;
  let mapAnimationGeneration = 0;

  function getStation(mapOptions = {}) {
    return {
      lat: mapOptions.stationLat ?? DEFAULT_STATION_LAT,
      lng: mapOptions.stationLng ?? DEFAULT_STATION_LNG,
      label: mapOptions.stationLabel ?? DEFAULT_STATION_LABEL,
    };
  }

  function normalizeMapOptions(mapOptions = {}) {
    if (
      mapOptions.startAtStation !== undefined ||
      mapOptions.endAtStation !== undefined
    ) {
      return {
        startAtStation: mapOptions.startAtStation !== false,
        endAtStation: mapOptions.endAtStation !== false,
      };
    }
    return {
      startAtStation: true,
      endAtStation: true,
    };
  }

  function shouldShowStation(mapOptions = {}) {
    const opts = normalizeMapOptions(mapOptions);
    return opts.startAtStation || opts.endAtStation;
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

  function normalizeToken(raw) {
    return String(raw || "")
      .replace(/\./g, "")
      .replace(/\bst\b/g, "st")
      .replace(/\bave\b/g, "ave")
      .replace(/\bdr\b/g, "dr")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function streetTokens(street) {
    const out = new Set();
    const add = (s) => {
      const n = normalizeToken(s);
      if (n) out.add(n);
    };
    add(street.id);
    add(street.name);
    (street.aliases || []).forEach(add);
    return out;
  }

  function matchStreet(token, streets) {
    const key = normalizeToken(token);
    if (!key) return null;
    for (const s of streets) {
      const tokens = streetTokens(s);
      if (tokens.has(key)) return s;
      for (const t of tokens) {
        if (key.includes(t) || t.includes(key)) return s;
      }
    }
    return null;
  }

  function nearestVertical(lng, grid) {
    let best = grid.verticalStreets[0];
    let bestD = Infinity;
    grid.verticalStreets.forEach((v) => {
      const d = Math.abs(lng - v.lng);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    });
    return best;
  }

  function nearestHorizontal(lat, grid) {
    let best = grid.horizontalStreets[0];
    let bestD = Infinity;
    grid.horizontalStreets.forEach((h) => {
      const d = Math.abs(lat - h.lat);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    });
    return best;
  }

  function parseCrossStreetNode(crossStreet, grid) {
    const cs = String(crossStreet || "").trim();
    if (!cs.includes("&")) return null;
    const parts = cs.split("&").map((p) => p.trim()).filter(Boolean);
    let v = null;
    let h = null;
    parts.forEach((part) => {
      const vv = matchStreet(part, grid.verticalStreets);
      const hh = matchStreet(part, grid.horizontalStreets);
      if (vv) v = vv;
      if (hh) h = hh;
    });
    return v && h ? { v, h } : null;
  }

  function resolveMapNode(stop, grid) {
    if (stop.mapNode?.v && stop.mapNode?.h) {
      const v = grid.verticalStreets.find((s) => s.id === stop.mapNode.v);
      const h = grid.horizontalStreets.find((s) => s.id === stop.mapNode.h);
      if (v && h) return { v, h, source: "override" };
    }
    const parsed = parseCrossStreetNode(stop.crossStreet, grid);
    if (parsed) return { ...parsed, source: "crossStreet" };
    return {
      v: nearestVertical(Number(stop.lng), grid),
      h: nearestHorizontal(Number(stop.lat), grid),
      source: "snap",
    };
  }

  function escapeSvgText(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function mapPositionKey(stop) {
    return `${Number(stop.lat).toFixed(6)},${Number(stop.lng).toFixed(6)}`;
  }

  function nodeKey(v, h) {
    return `${v.id}|${h.id}`;
  }

  function computeGeoBounds(route, mapOptions, grid) {
    const lats = route.map((s) => s.lat);
    const lngs = route.map((s) => s.lng);
    const opts = normalizeMapOptions(mapOptions);
    const station = getStation(mapOptions);
    if (opts.startAtStation || opts.endAtStation) {
      lats.push(station.lat);
      lngs.push(station.lng);
    }
    route.forEach((stop) => {
      const node = resolveMapNode(stop, grid);
      lats.push(node.h.lat);
      lngs.push(node.v.lng);
    });
    const latMin = Math.min(...lats);
    const latMax = Math.max(...lats);
    const lngMin = Math.min(...lngs);
    const lngMax = Math.max(...lngs);
    const latPad = Math.max((latMax - latMin) * 0.14, 0.0009);
    const lngPad = Math.max((lngMax - lngMin) * 0.14, 0.0009);
    return {
      latMin: latMin - latPad,
      latMax: latMax + latPad,
      lngMin: lngMin - lngPad,
      lngMax: lngMax + lngPad,
    };
  }

  function lngToX(lng, bounds) {
    const span = bounds.lngMax - bounds.lngMin || 1e-6;
    const t = (lng - bounds.lngMin) / span;
    return GMAP.xMin + t * (GMAP.xMax - GMAP.xMin);
  }

  /** Glen is the eastern bookend — always at the right tip of the horizontal grid. */
  function getVerticalStreetX(v, bounds) {
    if (v.id === EAST_BOOKEND_ID) return GMAP.xMax;
    return lngToX(v.lng, bounds);
  }

  function latToY(lat, bounds) {
    const span = bounds.latMax - bounds.latMin || 1e-6;
    const t = (bounds.latMax - lat) / span;
    return GMAP.yMin + t * (GMAP.yMax - GMAP.yMin);
  }

  function nodeToPoint(node, bounds) {
    return {
      x: getVerticalStreetX(node.v, bounds),
      y: latToY(node.h.lat, bounds),
    };
  }

  function stationPoint(bounds, grid) {
    const main = grid.verticalStreets.find((v) => v.id === "main") || grid.verticalStreets[0];
    const y = latToY(bounds.latMin, bounds) + GMAP.stationSouthPad;
    return { x: lngToX(main.lng, bounds), y, v: main, h: null };
  }

  function sameMapPoint(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y) < 0.5;
  }

  function measurePathLength(pathD) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", pathD);
    return path.getTotalLength();
  }

  function formatStopNumbers(routeIndices) {
    const nums = routeIndices.map((i) => String(i + 1));
    return nums.length === 1 ? nums[0] : nums.join(" · ");
  }

  function attachMapLabelGroups(points) {
    const groups = new Map();
    points.forEach((p) => {
      const key = `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      if (!groups.has(key)) {
        groups.set(key, { key, indices: [], anchor: p });
      }
      const group = groups.get(key);
      group.indices.push(p.idx);
      p.labelGroup = group;
    });
    points.forEach((p) => {
      p.isLabelAnchor = p.labelGroup.anchor === p;
    });
  }

  function assignStopNumSides(points) {
    const sides = [];
    points.forEach((p, idx) => {
      let right = idx % 2 === 0;
      if (
        idx > 0 &&
        Math.hypot(p.x - points[idx - 1].x, p.y - points[idx - 1].y) < 40 &&
        sides[idx - 1] === right
      ) {
        right = !right;
      }
      sides.push(right);
    });
    return sides;
  }

  function layoutStopNumbers(points) {
    const sides = assignStopNumSides(points);
    points.forEach((p) => {
      const right = sides[p.idx];
      p.numX = right ? p.x + GMAP.stopNumOffset : p.x - GMAP.stopNumOffset;
      p.numY = p.y + 4;
      p.numAnchor = right ? "start" : "end";
    });
  }

  function layoutGridMapPoints(route, mapOptions, grid) {
    const bounds = computeGeoBounds(route, mapOptions, grid);
    const points = route.map((stop, idx) => {
      const node = resolveMapNode(stop, grid);
      const { x, y } = nodeToPoint(node, bounds);
      return { stop, idx, node, x, y, bounds };
    });
    attachMapLabelGroups(points);
    layoutStopNumbers(points);
    return { points, bounds };
  }

  function isMapLegBackward(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (Math.abs(dx) >= Math.abs(dy)) return dx < -1;
    return dy < -1;
  }

  function getCornerRadius(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    let cap = GMAP.cornerRadius;
    if (dx > 0.5 && dy > 0.5) cap = Math.min(cap, dx * 0.9, dy * 0.9);
    else if (dx > 0.5) cap = Math.min(cap, dx * 0.9);
    else if (dy > 0.5) cap = Math.min(cap, dy * 0.9);
    return Math.max(cap, 6);
  }

  /** Manhattan L-path: horizontal to corner X, rounded turn, then vertical to destination. */
  function getGridLegPathD(x1, y1, x2, y2) {
    if (Math.abs(x1 - x2) < 0.5 || Math.abs(y1 - y2) < 0.5) {
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    const r = getCornerRadius(x1, y1, x2, y2);
    const east = x2 > x1;
    const down = y2 > y1;
    const xPre = east ? x2 - r : x2 + r;
    const yPost = down ? y1 + r : y1 - r;
    return `M ${x1} ${y1} L ${xPre} ${y1} Q ${x2} ${y1} ${x2} ${yPost} L ${x2} ${y2}`;
  }

  /** Return to station: jog onto a parallel lane west of Main, then south, then curve back in. */
  function getReturnToStationGridPathD(x1, y1, x2, y2) {
    const xLane = x2 - GMAP.returnLaneOffset;
    const r = Math.min(GMAP.returnLaneCurve, getCornerRadius(x1, y1, x2, y2));

    if (Math.abs(x1 - x2) < 0.5 && y2 > y1) {
      if (y2 - y1 < r * 2) return `M ${x1} ${y1} L ${x2} ${y2}`;
      return [
        `M ${x1} ${y1}`,
        `Q ${xLane} ${y1} ${xLane} ${y1 + r}`,
        `L ${xLane} ${y2 - r}`,
        `Q ${xLane} ${y2} ${x2} ${y2}`,
      ].join(" ");
    }

    if (Math.abs(y1 - y2) < 0.5 || y2 <= y1) {
      return getGridLegPathD(x1, y1, x2, y2);
    }

    const horizR = getCornerRadius(x1, y1, xLane, y1);
    const east = xLane > x1;
    const xPre = east ? xLane - horizR : xLane + horizR;
    const yPost = y1 + horizR;
    return [
      `M ${x1} ${y1}`,
      `L ${xPre} ${y1}`,
      `Q ${xLane} ${y1} ${xLane} ${yPost}`,
      `L ${xLane} ${y2 - r}`,
      `Q ${xLane} ${y2} ${x2} ${y2}`,
    ].join(" ");
  }

  function collectActiveGridLines(points, grid, stationPt) {
    const vIds = new Set();
    const hIds = new Set();
    points.forEach((p) => {
      vIds.add(p.node.v.id);
      hIds.add(p.node.h.id);
    });
    if (stationPt) vIds.add(stationPt.v.id);
    const verticals = grid.verticalStreets.filter((v) => vIds.has(v.id));
    const horizontals = grid.horizontalStreets.filter((h) => hIds.has(h.id));
    const glen = grid.verticalStreets.find((v) => v.id === EAST_BOOKEND_ID);
    if (glen && horizontals.length && !verticals.some((v) => v.id === EAST_BOOKEND_ID)) {
      verticals.push(glen);
    }
    return { verticals, horizontals };
  }

  function getRouteMapLayout(route, mapOptions = {}, grid = gridConfig || DEFAULT_GRID) {
    const opts = normalizeMapOptions(mapOptions);
    const { points, bounds } = layoutGridMapPoints(route, mapOptions, grid);
    const stationPt = opts.startAtStation || opts.endAtStation ? stationPoint(bounds, grid) : null;
    const legs = [];
    let legIndex = 0;

    const pushLeg = (from, to, meta = {}) => {
      if (sameMapPoint(from, to)) return;
      const pathD =
        meta.legKind === "stopToStation"
          ? getReturnToStationGridPathD(from.x, from.y, to.x, to.y)
          : getGridLegPathD(from.x, from.y, to.x, to.y);
      if (measurePathLength(pathD) < 0.5) return;
      legs.push({
        ...meta,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        pathD,
        legIndex: legIndex++,
        isBackward: isMapLegBackward(from.x, from.y, to.x, to.y),
      });
    };

    if (route.length && opts.startAtStation && stationPt) {
      pushLeg(stationPt, points[0], { legKind: "stationToStop", toStopIndex: 0 });
    }

    for (let i = 0; i < route.length - 1; i++) {
      pushLeg(points[i], points[i + 1], {
        legKind: "stopToStop",
        fromStopIndex: i,
        toStopIndex: i + 1,
      });
    }

    if (route.length && opts.endAtStation && stationPt) {
      pushLeg(points[route.length - 1], stationPt, {
        legKind: "stopToStation",
        fromStopIndex: route.length - 1,
      });
    }

    const gridLines = collectActiveGridLines(points, grid, stationPt);
    return { points, legs, bounds, stationPt, gridLines };
  }

  function getRouteWalkLegs(route, mapOptions = {}) {
    const legs = [];
    if (!route.length) return legs;
    const opts = normalizeMapOptions(mapOptions);
    const station = getStation(mapOptions);

    if (opts.startAtStation) {
      legs.push({
        ...getWalkLeg(station.lat, station.lng, route[0].lat, route[0].lng),
        label: `To ${route[0].name}`,
        legKind: "stationToStop",
        toStopIndex: 0,
      });
    }

    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i];
      const b = route[i + 1];
      if (mapPositionKey(a) === mapPositionKey(b)) continue;
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
        ...getWalkLeg(last.lat, last.lng, station.lat, station.lng),
        label: `Back to ${station.label}`,
        legKind: "stopToStation",
        fromStopIndex: route.length - 1,
      });
    }

    return legs;
  }

  function estimateStopNumBounds(point, text) {
    const len = Math.max(String(text).length * 7, 12);
    const x0 = point.numAnchor === "end" ? point.numX - len : point.numX;
    return {
      minX: x0 - 4,
      maxX: x0 + len + 4,
      minY: point.numY - 10,
      maxY: point.numY + 6,
    };
  }

  function getVerticalSkytrainGap(bounds, gridLines, grid, stationPt) {
    const gapTop = getGeorgiaLineY(bounds, gridLines, grid) + GMAP.vLabelGapTopPad;
    if (!stationPt) {
      const fallback = gapTop + 60;
      return { gapTop, gapBottom: fallback, gapMid: fallback };
    }
    const gapBottom = stationPt.y - GMAP.vLabelAboveStation;
    const band = Math.max(gapBottom - gapTop, 48);
    return { gapTop, gapBottom, gapMid: gapTop + band * 0.5 };
  }

  function getVerticalStreetLabelPlacement(v, x, bounds, gridLines, grid, stationPt, vLineSpan) {
    const defaultY = getVerticalStreetLabelY(bounds, gridLines, grid, stationPt);
    const defaultX = x - GMAP.vLabelLeftOffset;
    if (EAST_CORRIDOR_VERTICAL_IDS.has(v.id)) {
      const gap = getVerticalSkytrainGap(bounds, gridLines, grid, stationPt);
      const labelX = x + GMAP.vLabelRightOffset;
      const labelY = stationPt ? gap.gapMid : (vLineSpan.y1 + vLineSpan.y2) / 2;
      return {
        x: labelX,
        y: labelY,
        anchor: "middle",
        gap: true,
        transform: `rotate(-90, ${labelX}, ${labelY})`,
      };
    }
    return {
      x: defaultX,
      y: defaultY,
      anchor: "start",
      gap: false,
      transform: `rotate(-90, ${defaultX}, ${defaultY})`,
    };
  }

  function estimateVerticalStreetLabelBounds(v, x, bounds, gridLines, grid, stationPt, vLineSpan) {
    const label = getVerticalStreetLabelPlacement(v, x, bounds, gridLines, grid, stationPt, vLineSpan);
    const len = Math.max(String(v.name).length * 5.5, 28);
    return {
      minX: label.x - len / 2 - 4,
      maxX: label.x + len / 2 + 4,
      minY: label.y - len / 2 - 4,
      maxY: label.y + len / 2 + 4,
    };
  }

  function computeMapViewBox(points, legs, stationPt, gridLines = null, bounds = null, grid = DEFAULT_GRID) {
    const xs = [GMAP.xMin, GMAP.xMax];
    const ys = [GMAP.yMin, GMAP.yMax];
    const labelGroupsSeen = new Set();
    points.forEach((p) => {
      xs.push(p.x - 8, p.x + 8);
      ys.push(p.y - 8, p.y + 8);
      if (!p.isLabelAnchor || labelGroupsSeen.has(p.labelGroup.key)) return;
      labelGroupsSeen.add(p.labelGroup.key);
      const b = estimateStopNumBounds(p, formatStopNumbers(p.labelGroup.indices));
      xs.push(b.minX, b.maxX);
      ys.push(b.minY, b.maxY);
    });
    legs.forEach((leg) => {
      xs.push(leg.x1, leg.x2);
      ys.push(leg.y1, leg.y2);
    });
    if (stationPt) {
      xs.push(stationPt.x - 12, stationPt.x + 12);
      ys.push(stationPt.y - 8, stationPt.y + 28);
    }
    if (gridLines && bounds) {
      const ysGrid = gridLines.horizontals.map((h) => latToY(h.lat, bounds));
      const y1 = ysGrid.length ? Math.min(...ysGrid, GMAP.yMin) : GMAP.yMin;
      const y2 = ysGrid.length ? Math.max(...ysGrid, GMAP.yMax) : GMAP.yMax;
      const vLineSpan = getVerticalGridLineSpan(y1, y2, bounds, gridLines, grid, stationPt);
      gridLines.verticals.forEach((v) => {
        const x = getVerticalStreetX(v, bounds);
        const b = estimateVerticalStreetLabelBounds(v, x, bounds, gridLines, grid, stationPt, vLineSpan);
        xs.push(b.minX, b.maxX);
        ys.push(b.minY, b.maxY);
      });
    }
    if (!points.length && !stationPt) return GMAP.defaultViewBox;
    const pad = GMAP.viewBoxPad;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + pad;
    const maxY = Math.max(...ys) + pad;
    return `${minX} ${minY} ${Math.max(maxX - minX, 220)} ${Math.max(maxY - minY, 160)}`;
  }

  function shapedHorizontalPathD(x1, x2, y, shape) {
    if (!shape?.length || x2 - x1 < 80) return `M ${x1} ${y} L ${x2} ${y}`;
    const span = x2 - x1;
    let cx = x1;
    let cy = y;
    const parts = [`M ${cx} ${cy}`];
    shape.forEach((seg) => {
      let nx;
      let ny;
      if (seg.to != null) {
        nx = x1 + span * seg.to;
        ny = seg.yOff != null ? y + seg.yOff : cy;
      } else {
        nx = cx + span * (seg.dx ?? 0);
        ny = cy + (seg.dy ?? 0);
      }
      parts.push(`L ${nx} ${ny}`);
      cx = nx;
      cy = ny;
    });
    return parts.join(" ");
  }

  /** Center horizontal street names in the map (Main–Glen corridor, or full map width). */
  function getHorizontalStreetLabelPlacement(y, bounds, gridLines, stationPt) {
    const mapMidX = (GMAP.xMin + GMAP.xMax) / 2;

    if (!stationPt) {
      return { x: mapMidX, y: y - 5, anchor: "middle", gap: true };
    }

    const main = gridLines.verticals.find((v) => v.id === "main");
    const glen = gridLines.verticals.find((v) => v.id === EAST_BOOKEND_ID);
    if (main && glen) {
      const xMain = getVerticalStreetX(main, bounds);
      const xGlen = getVerticalStreetX(glen, bounds);
      if (xGlen - xMain > 36) {
        return {
          x: (xMain + xGlen) / 2,
          y: y + 9,
          anchor: "middle",
          gap: true,
        };
      }
    }

    return { x: mapMidX, y: y + 9, anchor: "middle", gap: true };
  }

  function getGeorgiaLineY(bounds, gridLines, grid) {
    const georgia =
      gridLines.horizontals.find((h) => h.id === "georgia") ||
      grid.horizontalStreets.find((h) => h.id === "georgia");
    if (georgia) return latToY(georgia.lat, bounds);
    const ys = gridLines.horizontals.map((h) => latToY(h.lat, bounds));
    return ys.length ? Math.max(...ys) : GMAP.yMin;
  }

  /** Anchor vertical street names in the blank band between Georgia and the station. */
  function getVerticalStreetLabelY(bounds, gridLines, grid, stationPt) {
    if (!stationPt) {
      return getGeorgiaLineY(bounds, gridLines, grid) + GMAP.vLabelGapTopPad;
    }
    const gapTop = getGeorgiaLineY(bounds, gridLines, grid) + GMAP.vLabelGapTopPad;
    const gapBottom = stationPt.y - GMAP.vLabelAboveStation;
    const band = Math.max(gapBottom - gapTop, 48);
    return gapTop + band * GMAP.vLabelGapAnchor;
  }

  function getVerticalGridLineSpan(y1, y2, bounds, gridLines, grid, stationPt) {
    if (!stationPt) return { y1, y2 };
    return {
      y1,
      y2: Math.max(y2, stationPt.y - GMAP.vLineExtendAboveStation),
    };
  }

  function renderGridLinesSvg(gridLines, bounds, stationPt = null, grid = DEFAULT_GRID) {
    if (!gridLines.verticals.length && !gridLines.horizontals.length) return "";
    const xs = gridLines.verticals.map((v) => getVerticalStreetX(v, bounds));
    const ys = gridLines.horizontals.map((h) => latToY(h.lat, bounds));
    const x1 = Math.min(...xs, GMAP.xMin);
    const x2 = Math.max(...xs, GMAP.xMax);
    const y1 = Math.min(...ys, GMAP.yMin);
    const y2 = Math.max(...ys, GMAP.yMax);
    let html = `<g class="map-grid-layer">`;
    gridLines.horizontals.forEach((h) => {
      const y = latToY(h.lat, bounds);
      const shape = H_STREET_SHAPE[h.id];
      const pathD = shapedHorizontalPathD(x1, x2, y, shape);
      const lineClass = shape ? "map-grid-line map-grid-line--shaped" : "map-grid-line";
      html += `<path class="${lineClass}" d="${pathD}" />`;
      const label = getHorizontalStreetLabelPlacement(y, bounds, gridLines, stationPt);
      const labelClass = label.gap
        ? "map-text map-street-label map-street-label--h map-street-label--h-gap"
        : "map-text map-street-label map-street-label--h";
      html += `<text class="${labelClass}" x="${label.x}" y="${label.y}" text-anchor="${label.anchor}">${escapeSvgText(h.name)}</text>`;
    });
    const vLineSpan = getVerticalGridLineSpan(y1, y2, bounds, gridLines, grid, stationPt);
    gridLines.verticals.forEach((v) => {
      const x = getVerticalStreetX(v, bounds);
      html += `<line class="map-grid-line" x1="${x}" y1="${vLineSpan.y1}" x2="${x}" y2="${vLineSpan.y2}" />`;
      const label = getVerticalStreetLabelPlacement(v, x, bounds, gridLines, grid, stationPt, vLineSpan);
      const labelClass = label.gap
        ? "map-text map-street-label map-street-label--v map-street-label--v-gap"
        : "map-text map-street-label map-street-label--v";
      html += `<text class="${labelClass}" x="${label.x}" y="${label.y}" text-anchor="${label.anchor}" transform="${label.transform}">${escapeSvgText(v.name)}</text>`;
    });
    html += `</g>`;
    return html;
  }

  function renderStationSvg(stationPt, label) {
    if (!stationPt) return "";
    const shortLabel = String(label || "Station").replace(" Station", "");
    return `
      <circle cx="${stationPt.x}" cy="${stationPt.y}" r="4" fill="var(--ink)"/>
      <text class="map-text map-spine-label" x="${stationPt.x - 8}" y="${stationPt.y + 4}" text-anchor="end">
        <tspan x="${stationPt.x - 8}" dy="0">${shortLabel}</tspan>
        <tspan x="${stationPt.x - 8}" dy="8">Station</tspan>
      </text>`;
  }

  function renderMapStopSvg(group) {
    const anchor = group.anchor;
    return `
      <g class="map-stop-group map-stop-group--hidden" data-label-key="${group.key}">
        <circle class="map-stop" cx="${anchor.x}" cy="${anchor.y}" r="5" />
        <text
          class="map-text map-stop-num"
          x="${anchor.numX}"
          y="${anchor.numY}"
          text-anchor="${anchor.numAnchor}"
        ></text>
      </g>
    `;
  }

  function getMapLegColor(leg) {
    if (leg.isBackward) return MAP_BACKWARD_COLOR;
    const colors = [...MAP_LEG_COLORS, getSeasonFadeTop()];
    return colors[leg.legIndex % colors.length];
  }

  function animateMapPath(pathEl, options = {}) {
    const { duration = GMAP.legDurationMs, onComplete = null } = options;
    if (!pathEl) {
      onComplete?.();
      return;
    }
    pathEl.setAttribute("fill", "none");

    const begin = () => {
      const length = pathEl.getTotalLength();
      if (!length) {
        onComplete?.();
        return;
      }
      pathEl.style.transition = "none";
      pathEl.style.strokeDasharray = `${length}`;
      pathEl.style.strokeDashoffset = `${length}`;
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
        setTimeout(finish, duration + 200);
      }
    };

    requestAnimationFrame(() => requestAnimationFrame(begin));
  }

  function drawMap(svgEl, route, options = {}) {
    if (!svgEl) return;
    const grid = gridConfig || DEFAULT_GRID;
    const gen = ++mapAnimationGeneration;
    const isStale = () => gen !== mapAnimationGeneration;
    const mapOptions = options.mapOptions || {};
    const legDuration = options.legDuration ?? GMAP.legDurationMs;
    const opts = normalizeMapOptions(mapOptions);
    const showStation = shouldShowStation(mapOptions);
    const station = getStation(mapOptions);
    const { points, legs, bounds, stationPt, gridLines } = getRouteMapLayout(route, mapOptions, grid);

    svgEl.innerHTML = `${renderGridLinesSvg(gridLines, bounds, showStation ? stationPt : null, grid)}<g class="map-route-layer"></g>`;
    if (showStation && stationPt) {
      svgEl.insertAdjacentHTML("afterbegin", renderStationSvg(stationPt, station.label));
    }
    svgEl.setAttribute(
      "viewBox",
      route.length || showStation
        ? computeMapViewBox(points, legs, showStation ? stationPt : null, gridLines, bounds, grid)
        : GMAP.defaultViewBox
    );

    const routeLayer = svgEl.querySelector(".map-route-layer");
    if (!route.length) {
      options.onComplete?.();
      return;
    }

    const labelGroupsSeen = new Set();
    points.forEach((p) => {
      if (!p.isLabelAnchor || labelGroupsSeen.has(p.labelGroup.key)) return;
      labelGroupsSeen.add(p.labelGroup.key);
      svgEl.insertAdjacentHTML("beforeend", renderMapStopSvg(p.labelGroup));
    });

    const revealedStopIndices = new Set();

    const showStop = (idx) => {
      revealedStopIndices.add(idx);
      const point = points[idx];
      const group = point?.labelGroup;
      if (!group) return;
      const revealedInGroup = group.indices.filter((i) => revealedStopIndices.has(i));
      if (!revealedInGroup.length) return;
      const stopGroup = svgEl.querySelector(`.map-stop-group[data-label-key="${group.key}"]`);
      if (!stopGroup) return;
      const textEl = stopGroup.querySelector(".map-stop-num");
      if (textEl) textEl.textContent = formatStopNumbers(revealedInGroup);
      stopGroup.classList.remove("map-stop-group--hidden");
    };

    const revealStopsThroughColocated = (startIdx) => {
      let idx = startIdx;
      while (idx < points.length) {
        showStop(idx);
        const next = idx + 1;
        if (next >= points.length || !sameMapPoint(points[idx], points[next])) break;
        idx = next;
      }
    };

    if (legDuration === 0 || !legs.length) {
      legs.forEach((leg) => {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("class", leg.isBackward ? "map-path map-path--backward" : "map-path");
        path.setAttribute("d", leg.pathD);
        path.style.stroke = getMapLegColor(leg);
        routeLayer.appendChild(path);
      });
      points.forEach((_, i) => showStop(i));
      options.onComplete?.();
      return;
    }

    const maxLegLength = Math.max(...legs.map((leg) => measurePathLength(leg.pathD)), 1);

    const runLeg = (legIndex) => {
      if (isStale()) return;
      if (legIndex >= legs.length) {
        options.onComplete?.();
        return;
      }

      const leg = legs[legIndex];
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("class", leg.isBackward ? "map-path map-path--backward" : "map-path");
      path.setAttribute("d", leg.pathD);
      path.style.stroke = getMapLegColor(leg);
      routeLayer.appendChild(path);

      if (legIndex === 0 && leg.fromStopIndex != null) {
        revealStopsThroughColocated(leg.fromStopIndex);
      }

      const pathLength = measurePathLength(leg.pathD);
      const duration = Math.max(
        GMAP.legDurationMinMs,
        Math.round(legDuration * Math.min(1, pathLength / maxLegLength))
      );

      animateMapPath(path, {
        duration,
        onComplete: () => {
          if (isStale()) return;
          if (leg.toStopIndex != null) revealStopsThroughColocated(leg.toStopIndex);
          runLeg(legIndex + 1);
        },
      });
    };

    if (!opts.startAtStation && points.length) revealStopsThroughColocated(0);
    runLeg(0);
  }

  function loadGridConfig(url = "data/chinatown-grid.json") {
    if (gridConfig) return Promise.resolve(gridConfig);
    if (gridLoadPromise) return gridLoadPromise;
    gridLoadPromise = fetch(url, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : DEFAULT_GRID))
      .then((data) => {
        gridConfig = data;
        return gridConfig;
      })
      .catch(() => {
        gridConfig = DEFAULT_GRID;
        return gridConfig;
      });
    return gridLoadPromise;
  }

  function setGridConfig(config) {
    gridConfig = config;
  }

  function debugResolveStop(stop) {
    const grid = gridConfig || DEFAULT_GRID;
    const node = resolveMapNode(stop, grid);
    return {
      name: stop.name,
      source: node.source,
      intersection: `${node.v.name} & ${node.h.name}`,
      v: node.v.id,
      h: node.h.id,
    };
  }

  window.ChinatownMap = {
    GMAP,
    DEFAULT_GRID,
    drawMap,
    getRouteMapLayout,
    getRouteWalkLegs,
    getWalkLeg,
    haversineKm,
    loadGridConfig,
    setGridConfig,
    normalizeMapOptions,
    shouldShowStation,
    resolveMapNode,
    debugResolveStop,
    getStation,
  };
})();
