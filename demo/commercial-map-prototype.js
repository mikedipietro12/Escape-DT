/**
 * Commercial Drive map animation prototype — production-like Step E preview.
 *
 * Builds on demo/lib/commercial-hybrid-map-core.js without changing the live app.
 * Use the sample route picker to swap test routes; everything else mirrors Step E.
 */
(function () {
  "use strict";

  const core = globalThis.CommercialHybridMapCore;
  if (!core) return;

  const {
    MAP,
    SVG_NS,
    escapeHtml,
    isStopOffSpine,
    getStopMapZone,
    getStopParallelStreet,
    getParallelStreetDrawSpec,
    getRouteLegs,
    getRouteMapLayout,
    getMapSpineBounds,
    computeMapViewBox,
    renderMapStaticSvg,
    getMapLegColor,
    getMapStopIndexAfterLeg,
    createTraceArrow,
    syncTraceArrow,
    animateMapPath,
    getMapStopLabelPlacement,
    formatMapStopNumberLabel,
    setStation,
    initCommercialWalkExtents,
    getSpineCrossStreetCatalogForRoute,
    getSpineCrossStreetDrawSpec,
    getSpineCrossStreetDrawSpecAtPath,
    getLegSpineCrossStreetCrossings,
  } = core;

  const PRESETS = {
    "mintage-corso-park": {
      label: "Mintage → Bar Corso → Victoria Park",
      ids: ["s7", "s9", "s33"],
    },
    victoria: {
      label: "Victoria walk (JJ → Mah → Park → pizza)",
      ids: ["s1", "s32", "s33", "s19"],
    },
    venables: {
      label: "Venables hop (Slice → Alterior → Fun Haus)",
      ids: ["s26", "s12", "s25"],
    },
    "spine-only": {
      label: "Spine only (Mintage → Bar Corso → Loula's)",
      ids: ["s7", "s9", "s8"],
    },
    "clark-crawl": {
      label: "Clark crawl (Superflux → Truck Stop → Kasko → Strange Fellows)",
      ids: ["s44", "s109", "s111", "s45"],
    },
    "frances-maclean": {
      label: "Frances & Maclean (Earnest → Woodland Park → Bomber)",
      ids: ["s41", "s42", "s43"],
    },
    "station-slice": {
      label: "Station → Slice (crosses 1st, Venables)",
      ids: ["s26"],
    },
    "prado-loop": {
      label: "Prado → Audiopile (no 1st cross)",
      ids: ["s3", "s27"],
    },
  };

  const SIDE_STREET_DRAW_MS = 900;
  const SIDE_STREET_LABEL_DELAY_MS = 280;

  let allStops = [];
  let currentRoute = [];
  let mapAnimationGeneration = 0;
  let stickyStopIds = [];
  let spotCardLinker = null;

  const canFineHover = () =>
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function getRouteStopIdsForMapPoint(point) {
    const indices = point?.routeIndices ?? (point?.idx != null ? [point.idx] : []);
    return indices.map((routeIdx) => currentRoute[routeIdx]?.id).filter(Boolean);
  }

  function getMapGroupStopIds(groupEl) {
    if (groupEl?.dataset.stopIds) {
      return groupEl.dataset.stopIds.split(",").filter(Boolean);
    }
    return groupEl?.dataset.stopId ? [groupEl.dataset.stopId] : [];
  }

  function normalizeStopIds(stopIdOrIds) {
    if (!stopIdOrIds) return [];
    return (Array.isArray(stopIdOrIds) ? stopIdOrIds : [stopIdOrIds]).filter(Boolean);
  }

  function sameStopIdSet(a, b) {
    const left = normalizeStopIds(a).sort().join(",");
    const right = normalizeStopIds(b).sort().join(",");
    return left.length > 0 && left === right;
  }

  function sideStreetSpec(point, spineBounds, venablesY) {
    if (!isStopOffSpine(point.stop)) return null;

    const zone = getStopMapZone(point.stop);
    // Venables hops use spine junctions only — no parallel street line or label.
    if (zone === "venablesEast" || zone === "venablesWest") return null;

    const streetId = getStopParallelStreet(point.stop);
    if (!streetId) return null;

    return getParallelStreetDrawSpec(streetId, spineBounds, {
      venablesY,
      allStops,
      route: currentRoute,
    });
  }

  function renderInteractiveMapStopSvg(point) {
    const s = point.stop;
    const mapIdx = point.mapIdx ?? point.idx;
    const numLabel = formatMapStopNumberLabel(point);
    const x = point.dotX;
    const y = point.dotY;
    const { labelX, labelAnchor } = getMapStopLabelPlacement(x);
    const stopIds = getRouteStopIdsForMapPoint(point);
    const indices = point.routeIndices || [point.idx];
    const names = indices
      .map((routeIdx) => currentRoute[routeIdx]?.name)
      .filter(Boolean)
      .map((name) => escapeHtml(name));
    const ariaNames = names.length > 1 ? names.join(" & ") : names[0] || escapeHtml(s.name);
    return `
      <g class="map-stop-group map-stop-group--hidden map-stop-group--interactive"
         data-stop-index="${mapIdx}"
         data-stop-id="${s.id}"
         data-stop-ids="${stopIds.join(",")}"
         role="button"
         tabindex="0"
         aria-label="${numLabel}. ${ariaNames}">
        <circle class="map-stop--hit" cx="${x}" cy="${y}" r="14" fill="transparent" pointer-events="all" />
        <circle class="map-stop" cx="${x}" cy="${y}" r="5" pointer-events="none" />
        <text class="map-text" x="${labelX}" y="${y + 4}" text-anchor="${labelAnchor}" pointer-events="none">${numLabel}</text>
      </g>`;
  }

  function animateCrossStreetBar(crossStreetLayer, spec) {
    if (!spec || !crossStreetLayer) return;
    if (crossStreetLayer.querySelector(`[data-cross-street="${spec.key}"]`)) return;

    const y = spec.crossY;
    const cx = spec.centerX;

    const lineLeft = document.createElementNS(SVG_NS, "line");
    lineLeft.setAttribute("class", "map-cross-street");
    lineLeft.setAttribute("data-cross-street", spec.key);
    lineLeft.setAttribute("x1", String(cx));
    lineLeft.setAttribute("y1", String(y));
    lineLeft.setAttribute("x2", String(cx));
    lineLeft.setAttribute("y2", String(y));

    const lineRight = document.createElementNS(SVG_NS, "line");
    lineRight.setAttribute("class", "map-cross-street");
    lineRight.setAttribute("data-cross-street", spec.key);
    lineRight.setAttribute("x1", String(cx));
    lineRight.setAttribute("y1", String(y));
    lineRight.setAttribute("x2", String(cx));
    lineRight.setAttribute("y2", String(y));

    crossStreetLayer.append(lineLeft, lineRight);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "map-cross-street-label");
    label.setAttribute("x", String(spec.labelX));
    label.setAttribute("y", String(spec.labelY));
    label.setAttribute("text-anchor", spec.labelAnchor);
    label.setAttribute("dominant-baseline", "alphabetic");
    label.textContent = spec.label;
    crossStreetLayer.appendChild(label);

    const finish = () => label.classList.add("is-visible");

    if (window.gsap) {
      gsap.to(lineLeft, {
        attr: { x2: spec.drawToXLeft },
        duration: SIDE_STREET_DRAW_MS / 1000,
        ease: "power2.out",
      });
      gsap.to(lineRight, {
        attr: { x2: spec.drawToXRight },
        duration: SIDE_STREET_DRAW_MS / 1000,
        ease: "power2.out",
        onComplete: () => window.setTimeout(finish, SIDE_STREET_LABEL_DELAY_MS),
      });
      return;
    }

    const leftLength = Math.abs(cx - spec.drawToXLeft);
    const rightLength = Math.abs(spec.drawToXRight - cx);
    lineLeft.setAttribute("x2", String(spec.drawToXLeft));
    lineRight.setAttribute("x2", String(spec.drawToXRight));
    lineLeft.style.strokeDasharray = `${leftLength}`;
    lineLeft.style.strokeDashoffset = `${leftLength}`;
    lineRight.style.strokeDasharray = `${rightLength}`;
    lineRight.style.strokeDashoffset = `${rightLength}`;

    let ended = 0;
    const onSegmentEnd = () => {
      ended += 1;
      if (ended === 2) window.setTimeout(finish, SIDE_STREET_LABEL_DELAY_MS);
    };

    requestAnimationFrame(() => {
      const transition = `stroke-dashoffset ${SIDE_STREET_DRAW_MS}ms ease-out`;
      lineLeft.style.transition = transition;
      lineRight.style.transition = transition;
      lineLeft.style.strokeDashoffset = "0";
      lineRight.style.strokeDashoffset = "0";
      lineLeft.addEventListener("transitionend", onSegmentEnd, { once: true });
      lineRight.addEventListener("transitionend", onSegmentEnd, { once: true });
    });
  }

  function animateSideStreetBar(crossStreetLayer, spec, anchorY, onComplete) {
    if (!spec || !crossStreetLayer) {
      onComplete?.();
      return;
    }

    const yTop = spec.drawFromY;
    const yBottom = spec.drawToY;
    const anchor = Number.isFinite(anchorY) ? anchorY : (yTop + yBottom) / 2;

    const lineUp = document.createElementNS(SVG_NS, "line");
    lineUp.setAttribute("class", "map-side-street");
    lineUp.setAttribute("data-side-street", spec.key);
    lineUp.setAttribute("x1", String(spec.streetX));
    lineUp.setAttribute("y1", String(anchor));
    lineUp.setAttribute("x2", String(spec.streetX));
    lineUp.setAttribute("y2", String(anchor));

    const lineDown = document.createElementNS(SVG_NS, "line");
    lineDown.setAttribute("class", "map-side-street");
    lineDown.setAttribute("data-side-street", spec.key);
    lineDown.setAttribute("x1", String(spec.streetX));
    lineDown.setAttribute("y1", String(anchor));
    lineDown.setAttribute("x2", String(spec.streetX));
    lineDown.setAttribute("y2", String(anchor));

    crossStreetLayer.append(lineUp, lineDown);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "map-side-street-label");
    label.setAttribute("x", String(spec.labelX));
    label.setAttribute("y", String(spec.labelY));
    label.setAttribute("text-anchor", spec.labelAnchor);
    if (spec.labelVertical) {
      label.setAttribute("class", "map-side-street-label map-side-street-label--vertical");
      label.setAttribute("transform", `rotate(-90 ${spec.labelX} ${spec.labelY})`);
    }
    label.textContent = spec.label;
    crossStreetLayer.appendChild(label);

    const finish = () => {
      label.classList.add("is-visible");
      onComplete?.();
    };

    if (window.gsap) {
      gsap.to(lineUp, {
        attr: { y2: yTop },
        duration: SIDE_STREET_DRAW_MS / 1000,
        ease: "power2.out",
      });
      gsap.to(lineDown, {
        attr: { y2: yBottom },
        duration: SIDE_STREET_DRAW_MS / 1000,
        ease: "power2.out",
        onComplete: () => {
          window.setTimeout(finish, SIDE_STREET_LABEL_DELAY_MS);
        },
      });
      return;
    }

    const upLength = Math.abs(anchor - yTop);
    const downLength = Math.abs(yBottom - anchor);
    lineUp.setAttribute("y2", String(yTop));
    lineDown.setAttribute("y2", String(yBottom));
    lineUp.style.strokeDasharray = `${upLength}`;
    lineUp.style.strokeDashoffset = `${upLength}`;
    lineDown.style.strokeDasharray = `${downLength}`;
    lineDown.style.strokeDashoffset = `${downLength}`;

    let ended = 0;
    const onSegmentEnd = () => {
      ended += 1;
      if (ended === 2) window.setTimeout(finish, SIDE_STREET_LABEL_DELAY_MS);
    };

    requestAnimationFrame(() => {
      const transition = `stroke-dashoffset ${SIDE_STREET_DRAW_MS}ms ease-out`;
      lineUp.style.transition = transition;
      lineDown.style.transition = transition;
      lineUp.style.strokeDashoffset = "0";
      lineDown.style.strokeDashoffset = "0";
      lineUp.addEventListener("transitionend", onSegmentEnd, { once: true });
      lineDown.addEventListener("transitionend", onSegmentEnd, { once: true });
    });
  }

  function popStopDot(groupEl, onComplete) {
    const dot = groupEl?.querySelector(".map-stop:not(.map-stop--hit)");
    if (!dot) {
      onComplete?.();
      return;
    }
    if (!window.gsap) {
      window.setTimeout(() => onComplete?.(), 350);
      return;
    }
    gsap.fromTo(
      dot,
      { attr: { r: 2.5 }, opacity: 0.4 },
      {
        attr: { r: 5 },
        opacity: 1,
        duration: 0.35,
        ease: "back.out(2)",
        onComplete,
      }
    );
  }

  function toggleRouteCardExpanded(e) {
    const card = e?.currentTarget;
    if (!card) return;
    const isExpanded = card.classList.toggle("route-card--expanded");
    card.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    const details = card.querySelector(".route-card__details");
    if (details) details.setAttribute("aria-hidden", isExpanded ? "false" : "true");
  }

  function stopThumbHtml(stop, idx) {
    const path = stop.images?.[0] || stop.image;
    if (path) {
      return `<img src="/${path}" alt="${escapeHtml(stop.name)}" loading="${idx < 2 ? "eager" : "lazy"}" decoding="async">`;
    }
    const bg = stop.placeholderColor || "cccccc";
    return `<div class="route-card__placeholder" style="background:#${bg}" aria-hidden="true"></div>`;
  }

  function gotoHtml(stop) {
    const value = stop.goto ? String(stop.goto).trim() : "";
    if (!value) return "";
    return `<p class="goto"><strong>My go-to:</strong> ${escapeHtml(value).replace(/\n/g, "<br>")}</p>`;
  }

  function renderRouteCardHtml(stop, idx) {
    const tags = (stop.tags || []).slice(0, 3);
    const tagsHtml = tags.length
      ? `<div class="tags">${tags
          .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
          .join("")}</div>`
      : "";
    const descHtml = stop.description
      ? `<p class="desc">${escapeHtml(String(stop.description)).replace(/\n/g, "<br>")}</p>`
      : "";
    return `
      <div class="route-card route-card--pending" role="button" tabindex="0" aria-expanded="false" data-stop-id="${escapeHtml(stop.id)}">
        ${stopThumbHtml(stop, idx)}
        <div class="content">
          <h3>${idx + 1}. ${escapeHtml(stop.name)}</h3>
          <div class="meta">${escapeHtml(stop.crossStreet || "")}</div>
        </div>
        <div class="route-card__details" aria-hidden="true">
          ${tagsHtml}
          ${descHtml}
          ${gotoHtml(stop)}
        </div>
      </div>`;
  }

  function renderRouteCards(route) {
    const el = document.getElementById("route-cards");
    if (!el) return;
    el.innerHTML = route.map((s, i) => renderRouteCardHtml(s, i)).join("");
  }

  function formatKm(km) {
    if (km < 10) return km.toFixed(1);
    return String(Math.round(km));
  }

  function buildExportSummaryText(route) {
    const n = route.length;
    return `YOUR COMMERCIAL DRIVE ROUTE — ${n} STOP${n === 1 ? "" : "S"}`;
  }

  function renderRouteTotals(route) {
    const el = document.getElementById("route-totals");
    if (!el) return;
    if (!route.length) {
      el.innerHTML = "";
      return;
    }
    const legs = getRouteLegs(route);
    const totalKm = legs.reduce((sum, leg) => sum + leg.km, 0);
    const totalMin = legs.reduce((sum, leg) => sum + leg.minutes, 0);
    let furthestIdx = 0;
    let maxMin = route[0].walkFromStation ?? 0;
    route.forEach((stop, i) => {
      const minutes = stop.walkFromStation ?? 0;
      if (minutes > maxMin) {
        maxMin = minutes;
        furthestIdx = i;
      }
    });
    const outbound = legs.slice(0, furthestIdx + 1);
    const furthestKm = outbound.reduce((sum, leg) => sum + leg.km, 0);
    const furthestMin = outbound.reduce((sum, leg) => sum + leg.minutes, 0);
    el.innerHTML = `
      <div>Time to furthest point: ~${formatKm(furthestKm)} km · ~${furthestMin} min</div>
      <div>Round trip: ~${formatKm(totalKm)} km · ~${totalMin} min</div>
      <p class="walk-disclaimer">Does not include time in places.</p>`;
  }

  function usesRouteReviewSideBySide() {
    return window.matchMedia("(min-width: 768px)").matches;
  }

  function primeRouteReviewSummary(route) {
    const summaryEl = document.getElementById("route-export-summary");
    if (summaryEl) summaryEl.textContent = buildExportSummaryText(route);
    renderRouteCards(route);
    renderRouteTotals(route);
  }

  function revealRouteReviewSummary() {
    const reviewEl = document.getElementById("route-review");
    const summaryPanel = document.getElementById("route-summary-panel");
    const hint = document.getElementById("route-scroll-hint");
    const finalizeBtn = document.getElementById("btn-route-finalize");

    reviewEl?.classList.remove("route-phase-map");
    reviewEl?.classList.add("route-phase-summary");
    if (summaryPanel) summaryPanel.hidden = false;

    if (window.matchMedia("(max-width: 767px)").matches && hint) {
      hint.hidden = false;
      hint.classList.add("route-scroll-hint--visible");
      hint.onclick = () => {
        summaryPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    }

    if (finalizeBtn) {
      finalizeBtn.hidden = false;
      finalizeBtn.disabled = false;
    }
  }

  function resetRouteReviewUi(route) {
    const reviewEl = document.getElementById("route-review");
    const summaryPanel = document.getElementById("route-summary-panel");
    const hint = document.getElementById("route-scroll-hint");
    const finalizeBtn = document.getElementById("btn-route-finalize");
    const sideBySide = usesRouteReviewSideBySide();

    if (hint) {
      hint.hidden = true;
      hint.classList.remove("route-scroll-hint--visible");
      hint.onclick = null;
    }
    if (finalizeBtn) {
      finalizeBtn.hidden = true;
      finalizeBtn.disabled = true;
    }

    stickyStopIds = [];
    setHighlight(null);

    if (sideBySide) {
      reviewEl?.classList.remove("route-phase-map");
      reviewEl?.classList.add("route-phase-summary");
      if (summaryPanel) summaryPanel.hidden = false;
      primeRouteReviewSummary(route);
    } else {
      reviewEl?.classList.remove("route-phase-summary");
      reviewEl?.classList.add("route-phase-map");
      if (summaryPanel) summaryPanel.hidden = true;
      const cardsEl = document.getElementById("route-cards");
      const totalsEl = document.getElementById("route-totals");
      if (cardsEl) cardsEl.innerHTML = "";
      if (totalsEl) totalsEl.innerHTML = "";
      const summaryEl = document.getElementById("route-export-summary");
      if (summaryEl) summaryEl.textContent = "";
    }
  }

  function markCardRevealed(stopId) {
    const card = document.querySelector(`.route-card[data-stop-id="${stopId}"]`);
    card?.classList.remove("route-card--pending");
  }

  function markCardsRevealedForMapPoint(point) {
    getRouteStopIdsForMapPoint(point).forEach((stopId) => markCardRevealed(stopId));
  }

  function setHighlight(stopIdOrIds, { scrollCard = false } = {}) {
    const activeIds = new Set(normalizeStopIds(stopIdOrIds));
    document.querySelectorAll(".route-card").forEach((card) => {
      card.classList.toggle("route-card--linked", activeIds.has(card.dataset.stopId));
    });
    document.querySelectorAll(".map-stop-group--interactive").forEach((group) => {
      const groupIds = getMapGroupStopIds(group);
      const highlighted = groupIds.some((id) => activeIds.has(id));
      group.classList.toggle("map-stop-group--highlighted", highlighted);
    });
    if (scrollCard && activeIds.size) {
      document
        .querySelector(`.route-card[data-stop-id="${[...activeIds][0]}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function wireRouteCardExpand() {
    const cardsRoot = document.getElementById("route-cards");
    if (!cardsRoot || cardsRoot.dataset.expandWired) return;
    cardsRoot.dataset.expandWired = "1";

    cardsRoot.addEventListener("click", (e) => {
      const card = e.target.closest(".route-card");
      if (!card || card.classList.contains("route-card--pending")) return;
      toggleRouteCardExpanded({ currentTarget: card });
      stickyStopIds = [card.dataset.stopId];
      setHighlight(stickyStopIds);
    });

    cardsRoot.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest(".route-card");
      if (!card || card.classList.contains("route-card--pending")) return;
      e.preventDefault();
      toggleRouteCardExpanded({ currentTarget: card });
    });
  }

  function wireSpotCardLinking(svgEl, cardsRoot) {
    if (spotCardLinker) {
      spotCardLinker.disconnect?.();
    }

    const linker = { disconnect: null };

    function activateFromPointer(stopIdOrIds, { scrollCard = false } = {}) {
      if (!canFineHover()) return;
      setHighlight(stopIdOrIds, { scrollCard });
    }

    function clearHoverHighlight() {
      if (!canFineHover()) return;
      setHighlight(stickyStopIds.length ? stickyStopIds : null);
    }

    function toggleSticky(stopIdOrIds) {
      const ids = normalizeStopIds(stopIdOrIds);
      if (sameStopIdSet(ids, stickyStopIds)) {
        stickyStopIds = [];
        setHighlight(null, { scrollCard: true });
        return;
      }
      stickyStopIds = ids;
      setHighlight(stickyStopIds, { scrollCard: true });
    }

    const onCardsOver = (e) => {
      const card = e.target.closest(".route-card");
      if (card?.classList.contains("route-card--pending")) return;
      if (card) activateFromPointer(card.dataset.stopId);
    };
    const onCardsOut = (e) => {
      if (!cardsRoot.contains(e.relatedTarget)) clearHoverHighlight();
    };

    cardsRoot.addEventListener("pointerover", onCardsOver);
    cardsRoot.addEventListener("pointerout", onCardsOut);

    const onMapOver = (e) => {
      const group = e.target.closest(".map-stop-group--interactive");
      if (!group || group.classList.contains("map-stop-group--hidden")) return;
      activateFromPointer(getMapGroupStopIds(group), { scrollCard: true });
    };
    const onMapOut = (e) => {
      const group = e.target.closest(".map-stop-group--interactive");
      if (!group) return;
      if (!svgEl.contains(e.relatedTarget)) clearHoverHighlight();
    };
    const onMapClick = (e) => {
      const group = e.target.closest(".map-stop-group--interactive");
      if (!group || group.classList.contains("map-stop-group--hidden")) return;
      toggleSticky(getMapGroupStopIds(group));
    };
    const onMapKey = (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const group = e.target.closest(".map-stop-group--interactive");
      if (!group || group.classList.contains("map-stop-group--hidden")) return;
      e.preventDefault();
      toggleSticky(getMapGroupStopIds(group));
    };

    svgEl.addEventListener("pointerover", onMapOver);
    svgEl.addEventListener("pointerout", onMapOut);
    svgEl.addEventListener("click", onMapClick);
    svgEl.addEventListener("keydown", onMapKey);

    linker.disconnect = () => {
      cardsRoot.removeEventListener("pointerover", onCardsOver);
      cardsRoot.removeEventListener("pointerout", onCardsOut);
      svgEl.removeEventListener("pointerover", onMapOver);
      svgEl.removeEventListener("pointerout", onMapOut);
      svgEl.removeEventListener("click", onMapClick);
      svgEl.removeEventListener("keydown", onMapKey);
    };

    spotCardLinker = linker;
  }

  function drawMapPrototype(svgEl, route, options = {}) {
    const gen = ++mapAnimationGeneration;
    const isStale = () => gen !== mapAnimationGeneration;

    stickyStopIds = [];
    setHighlight(null);

    const showStation = true;
    const layout = getRouteMapLayout(route, { hybrid: true });
    const { points, legs } = layout;
    const routeLegs = getRouteLegs(route);
    const legDuration = options.legDuration ?? MAP.legDurationMs;
    const spine = getMapSpineBounds(points, showStation, true);
    const drawnSideStreets = new Set();
    const drawnCrossStreets = new Set();
    const spineCrossCatalog = getSpineCrossStreetCatalogForRoute(allStops, route, points);
    const venablesCrossY = spineCrossCatalog.find((c) => c.id === "venables")?.y ?? null;

    let html = renderMapStaticSvg({
      showStation,
      spineY1: spine.y1,
      spineY2: spine.y2,
    });
    html += `<g class="map-cross-street-layer"></g>`;
    html += `<g class="map-route-layer"></g>`;
    html += `<g class="map-overlay-layer"></g>`;
    svgEl.innerHTML = html;

    svgEl.setAttribute(
      "viewBox",
      route.length ? computeMapViewBox(points, legs, showStation) : MAP.defaultViewBox
    );

    const crossStreetLayer = svgEl.querySelector(".map-cross-street-layer");
    const routeLayer = svgEl.querySelector(".map-route-layer");
    const overlayLayer = svgEl.querySelector(".map-overlay-layer");
    const traceArrow = legDuration > 0 ? createTraceArrow(routeLayer) : null;

    wireSpotCardLinking(svgEl, document.getElementById("route-cards"));

    if (!route.length) {
      options.onComplete?.();
      return;
    }

    function revealStopGroup(stopIndex, onReady) {
      let group = overlayLayer.querySelector(`[data-stop-index="${stopIndex}"]`);
      if (!group) {
        overlayLayer.insertAdjacentHTML(
          "beforeend",
          renderInteractiveMapStopSvg(points[stopIndex])
        );
        group = overlayLayer.querySelector(`[data-stop-index="${stopIndex}"]`);
      }
      requestAnimationFrame(() => {
        group?.classList.remove("map-stop-group--hidden");
        markCardsRevealedForMapPoint(points[stopIndex]);
        popStopDot(group, onReady);
      });
      return group;
    }

    function afterStopReveal(stopIndex, done) {
      const point = points[stopIndex];
      const spec = sideStreetSpec(point, spine, venablesCrossY);
      if (!spec || drawnSideStreets.has(spec.key)) {
        done();
        return;
      }
      drawnSideStreets.add(spec.key);
      animateSideStreetBar(crossStreetLayer, spec, point.dotY, done);
    }

    function revealStop(stopIndex, onDone) {
      revealStopGroup(stopIndex, () => {
        afterStopReveal(stopIndex, onDone || (() => {}));
      });
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
        if (stopIdx != null) {
          revealStop(stopIdx, () => runLeg(legIndex + 1));
        } else {
          runLeg(legIndex + 1);
        }
      };

      const pathEl = document.createElementNS(SVG_NS, "path");
      pathEl.setAttribute("class", pathClass);
      pathEl.setAttribute("data-leg-index", String(legIndex));
      pathEl.setAttribute("d", leg.pathD || `M ${leg.x1} ${leg.y1} L ${leg.x2} ${leg.y2}`);
      pathEl.style.stroke = color;
      routeLayer.appendChild(pathEl);

      const legCrossings = getLegSpineCrossStreetCrossings(leg, spineCrossCatalog, route, points);
      const triggeredCrossings = new Set();

      if (legDuration === 0) {
        pathEl.style.strokeDasharray = "none";
        pathEl.style.strokeDashoffset = "0";
        legCrossings.forEach((crossing) => {
          if (drawnCrossStreets.has(crossing.id)) return;
          drawnCrossStreets.add(crossing.id);
          animateCrossStreetBar(
            crossStreetLayer,
            getSpineCrossStreetDrawSpecAtPath(crossing.entry, pathEl, crossing.atLength)
          );
        });
        legComplete();
        return;
      }

      animateMapPath(pathEl, {
        duration: legDuration,
        arrowEl: traceArrow,
        onProgress: (drawn) => {
          for (const crossing of legCrossings) {
            if (triggeredCrossings.has(crossing.id)) continue;
            if (drawn < crossing.atLength - 1) continue;
            triggeredCrossings.add(crossing.id);
            if (drawnCrossStreets.has(crossing.id)) continue;
            drawnCrossStreets.add(crossing.id);
            animateCrossStreetBar(
              crossStreetLayer,
              getSpineCrossStreetDrawSpecAtPath(crossing.entry, pathEl, crossing.atLength)
            );
          }
        },
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
    resetRouteReviewUi(currentRoute);
    drawMapPrototype(document.getElementById("route-map"), currentRoute, {
      onComplete: () => {
        if (!usesRouteReviewSideBySide()) {
          primeRouteReviewSummary(currentRoute);
          revealRouteReviewSummary();
          return;
        }
        const finalizeBtn = document.getElementById("btn-route-finalize");
        if (finalizeBtn) {
          finalizeBtn.hidden = false;
          finalizeBtn.disabled = false;
        }
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
      const res = await fetch("/data/stops.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStation(data.station?.lat ?? 49.2634, data.station?.lng ?? -123.0694);
      allStops = (data.stops || []).filter(
        (s) => (s.neighborhood || "commercial") === "commercial"
      );
      initCommercialWalkExtents(allStops);
    } catch (err) {
      if (warnEl) warnEl.hidden = false;
      document.querySelector(".container")?.insertAdjacentHTML(
        "afterbegin",
        `<p class="demo-warn">Could not load Commercial Drive stops (${escapeHtml(err.message)}). Run <code>npm run dev</code>, then open <code>/demo/commercial-map-prototype.html</code>.</p>`
      );
      if (mapEl) {
        mapEl.innerHTML =
          '<text class="map-text" x="20" y="40">Start the dev server to load stop data.</text>';
      }
      return;
    }

    wireRouteCardExpand();

    const presetSelect = document.getElementById("preset-select");
    const replay = () => {
      currentRoute = resolveRoute(presetSelect.value);
      replayMap();
    };

    presetSelect.addEventListener("change", replay);
    presetSelect.value = "mintage-corso-park";
    replay();
  }

  init();
})();
