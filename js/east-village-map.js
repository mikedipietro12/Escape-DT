/**
 * East Village (Hastings-Sunrise) horizontal route map — standard path.
 * Loaded by index.html; exposes window.EastVillageMap.
 */
(function () {
  const WALK_SPEED_KMH = 5;

  const HMAP = {
    ySpine: 130,
    yOffNorth: 88,
    yOffSouth: 172,
    xMin: 44,
    xMax: 556,
    defaultViewBox: "0 0 600 260",
    legDurationMs: 1400,
    viewBoxPad: 20,
  };

  const LABEL = { angleDeg: 45, offset: 9 };

  const MAP_LEG_COLORS = ["#3d8f4a", "#52a362", "#6ab87a", "#84cc94", "#9ad4a8", "#ffeea1"];
  const MAP_BACKWARD_COLOR = "#c9a227";

  const ANCHORS = {
    west: {
      id: "west",
      name: "E Hastings & Commercial",
      lat: 49.28086,
      lng: -123.0696,
    },
    east: {
      id: "east",
      name: "E Hastings & Renfrew",
      lat: 49.28124,
      lng: -123.0448,
    },
  };

  let mapAnimationGeneration = 0;

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

  function getSeasonRouteColors() {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--map-route-colors").trim();
    const colors = v.split(",").map((color) => color.trim()).filter(Boolean);
    return colors.length ? colors : MAP_LEG_COLORS;
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
    return !/\b(triumph|franklin|pandora|powell)\b/i.test(cs);
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

  function anchorToX(anchorId, lngBounds) {
    if (anchorId === "west") return HMAP.xMin + 8;
    if (anchorId === "east") return HMAP.xMax - 8;
    return lngToX(ANCHORS[anchorId]?.lng ?? 0, lngBounds.lo, lngBounds.hi);
  }

  function layoutHorizontalMapPoints(route, mapOptions = {}) {
    const lngs = route.map((s) => s.lng);
    if (mapOptions.startAnchor) lngs.push(ANCHORS[mapOptions.startAnchor].lng);
    if (mapOptions.endAnchor) lngs.push(ANCHORS[mapOptions.endAnchor].lng);
    const lngMin = Math.min(...lngs);
    const lngMax = Math.max(...lngs);
    const lngPad = Math.max((lngMax - lngMin) * 0.12, 0.0008);
    const lngBounds = { lo: lngMin - lngPad, hi: lngMax + lngPad };

    const points = route.map((stop, idx) => ({
      stop,
      idx,
      x: lngToX(stop.lng, lngBounds.lo, lngBounds.hi),
      y: getStopMapY(stop),
    }));

    attachMapLabelGroups(points);
    layoutAngledLabels(points);
    return { points, lngBounds };
  }

  function isStopOffSpine(stop) {
    return !isOnHastingsSpine(stop);
  }

  function isMapLegBackward(x1, x2) {
    return x2 < x1;
  }

  function addLegSegment(segments, x1, y1, x2, y2) {
    if (Math.hypot(x2 - x1, y2 - y1) < 0.5) return;
    segments.push({ x1, y1, x2, y2, pathD: `M ${x1} ${y1} L ${x2} ${y2}` });
  }

  function segmentsToPathD(segments) {
    if (!segments.length) return "";
    const parts = [`M ${segments[0].x1} ${segments[0].y1}`];
    segments.forEach((s) => parts.push(`L ${s.x2} ${s.y2}`));
    return parts.join(" ");
  }

  function getHorizontalLegSegments(x1, y1, x2, y2, fromOffSpine, toOffSpine) {
    const spine = HMAP.ySpine;
    const onSpineY = (y) => Math.abs(y - spine) <= 10;
    const segments = [];

    if (toOffSpine && !fromOffSpine) {
      let cy = y1;
      if (!onSpineY(y1)) {
        addLegSegment(segments, x1, y1, x1, spine);
        cy = spine;
      }
      if (Math.abs(x1 - x2) > 1) {
        addLegSegment(segments, x1, cy, x2, spine);
      }
      addLegSegment(segments, x2, spine, x2, y2);
      return segments;
    }

    if (fromOffSpine && !toOffSpine) {
      addLegSegment(segments, x1, y1, x1, spine);
      if (Math.abs(x1 - x2) > 1) {
        addLegSegment(segments, x1, spine, x2, spine);
      }
      if (!onSpineY(y2)) {
        addLegSegment(segments, x2, spine, x2, y2);
      }
      return segments;
    }

    addLegSegment(segments, x1, y1, x2, y2);
    return segments;
  }

  function getHorizontalLegPathD(x1, y1, x2, y2, fromOffSpine, toOffSpine) {
    return segmentsToPathD(
      getHorizontalLegSegments(x1, y1, x2, y2, fromOffSpine, toOffSpine)
    );
  }

  function getRouteMapLayout(route, mapOptions = {}) {
    const { points, lngBounds } = layoutHorizontalMapPoints(route, mapOptions);
    const legs = [];
    let legIndex = 0;

    const pushLeg = (from, to, fromOffSpine, toOffSpine, meta = {}) => {
      const segments = getHorizontalLegSegments(
        from.x,
        from.y,
        to.x,
        to.y,
        fromOffSpine,
        toOffSpine
      );
      legs.push({
        ...meta,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        segments,
        pathD: segmentsToPathD(segments),
        legIndex: legIndex++,
        isBackward: isMapLegBackward(from.x, to.x),
      });
    };

    if (route.length && mapOptions.startAnchor) {
      const anchor = {
        x: anchorToX(mapOptions.startAnchor, lngBounds),
        y: HMAP.ySpine,
      };
      const first = points[0];
      pushLeg(anchor, first, false, isStopOffSpine(first.stop), {
        legKind: "anchorToStop",
        toStopIndex: 0,
      });
    }

    for (let i = 0; i < route.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      pushLeg(a, b, isStopOffSpine(a.stop), isStopOffSpine(b.stop), {
        legKind: "stopToStop",
        fromStopIndex: i,
        toStopIndex: i + 1,
      });
    }

    if (route.length && mapOptions.endAnchor) {
      const last = points[route.length - 1];
      const anchor = {
        x: anchorToX(mapOptions.endAnchor, lngBounds),
        y: HMAP.ySpine,
      };
      pushLeg(last, anchor, isStopOffSpine(last.stop), false, {
        legKind: "stopToAnchor",
        fromStopIndex: route.length - 1,
      });
    }

    return { points, legs };
  }

  function getRouteWalkLegs(route, mapOptions = {}) {
    const legs = [];
    if (!route.length) return legs;

    if (mapOptions.startAnchor) {
      const anchor = ANCHORS[mapOptions.startAnchor];
      const first = route[0];
      legs.push({
        ...getWalkLeg(anchor.lat, anchor.lng, first.lat, first.lng),
        label: `To ${first.name}`,
        legKind: "anchorToStop",
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
      });
    }

    if (mapOptions.endAnchor) {
      const anchor = ANCHORS[mapOptions.endAnchor];
      const last = route[route.length - 1];
      legs.push({
        ...getWalkLeg(last.lat, last.lng, anchor.lat, anchor.lng),
        label: `To ${anchor.name}`,
        legKind: "stopToAnchor",
      });
    }

    return legs;
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
      <g class="map-label-group map-stop-group--hidden" data-label-key="${group.key}">
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
    const { duration = HMAP.legDurationMs, onComplete = null } = options;
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

  function drawMap(svgEl, route, options = {}) {
    if (!svgEl) return;

    const gen = ++mapAnimationGeneration;
    const isStale = () => gen !== mapAnimationGeneration;
    const mapOptions = options.mapOptions || {};
    const legDuration = options.legDuration ?? HMAP.legDurationMs;
    const { points, legs } = getRouteMapLayout(route, mapOptions);

    svgEl.innerHTML = `${renderMapStaticSvg()}<g class="map-route-layer"></g>`;
    svgEl.setAttribute(
      "viewBox",
      route.length ? computeMapViewBox(points, legs) : HMAP.defaultViewBox
    );

    const routeLayer = svgEl.querySelector(".map-route-layer");
    if (!route.length) {
      options.onComplete?.();
      return;
    }

    const labelGroupsSeen = new Set();
    points.forEach((p) => {
      svgEl.insertAdjacentHTML("beforeend", renderMapStopSvg(p));
      if (p.isLabelAnchor && !labelGroupsSeen.has(p.labelGroup.key)) {
        labelGroupsSeen.add(p.labelGroup.key);
        svgEl.insertAdjacentHTML("beforeend", renderMapLabelSvg(p.labelGroup));
      }
    });

    const revealedStopIndices = new Set();

    const showStop = (idx) => {
      const g = svgEl.querySelector(`.map-stop-group[data-stop-index="${idx}"]`);
      if (g) g.classList.remove("map-stop-group--hidden");
      revealedStopIndices.add(idx);
      const point = points[idx];
      const group = point?.labelGroup;
      if (!group) return;
      const revealedInGroup = group.indices.filter((i) => revealedStopIndices.has(i));
      if (!revealedInGroup.length) return;
      const labelGroup = svgEl.querySelector(`.map-label-group[data-label-key="${group.key}"]`);
      if (!labelGroup) return;
      const textEl = labelGroup.querySelector(".map-stop-label");
      if (textEl) {
        textEl.textContent = formatMapStopLabel(revealedInGroup, group.street);
      }
      labelGroup.classList.remove("map-stop-group--hidden");
    };

    if (legDuration === 0 || !legs.length) {
      legs.forEach((leg) => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", leg.isBackward ? "map-path map-path--backward" : "map-path");
        path.setAttribute("d", leg.pathD);
        path.setAttribute("stroke", getMapLegColor(leg));
        routeLayer.appendChild(path);
      });
      points.forEach((_, i) => showStop(i));
      options.onComplete?.();
      return;
    }

    let legIndex = 0;
    let segmentIndex = 0;

    const drawNextSegment = () => {
      if (isStale()) return;
      if (legIndex >= legs.length) {
        options.onComplete?.();
        return;
      }

      const leg = legs[legIndex];
      const segments = leg.segments?.length ? leg.segments : [{ pathD: leg.pathD }];

      if (segmentIndex >= segments.length) {
        legIndex += 1;
        segmentIndex = 0;
        drawNextSegment();
        return;
      }

      const segment = segments[segmentIndex];
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", leg.isBackward ? "map-path map-path--backward" : "map-path");
      path.setAttribute("d", segment.pathD);
      path.setAttribute("stroke", getMapLegColor(leg));
      routeLayer.appendChild(path);

      if (legIndex === 0 && segmentIndex === 0) {
        if (leg.fromStopIndex != null) showStop(leg.fromStopIndex);
        else if (leg.toStopIndex != null) showStop(leg.toStopIndex);
      }

      const isLastSegmentOfLeg = segmentIndex === segments.length - 1;

      animateMapPath(path, {
        duration: legDuration,
        onComplete: () => {
          if (isStale()) return;
          segmentIndex += 1;
          if (isLastSegmentOfLeg && leg.toStopIndex != null) {
            showStop(leg.toStopIndex);
          }
          drawNextSegment();
        },
      });
    };

    drawNextSegment();
  }

  window.EastVillageMap = {
    ANCHORS,
    HMAP,
    drawMap,
    getRouteMapLayout,
    getRouteWalkLegs,
    getWalkLeg,
    haversineKm,
  };
})();
