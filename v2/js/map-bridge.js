/**
 * v2 map bridge — neighborhood dispatch to shared map modules.
 */
(function () {
  "use strict";

  const NEIGHBORHOOD_MAP_OPTS = {
    commercial: {},
    "mount-pleasant": { mpVertical: true },
    "hastings-sunrise": { horizontal: true },
    chinatown: { grid: true },
  };

  let stationData = null;
  let stopsById = new Map();

  function getMapOptions(neighborhoodId) {
    return { ...(NEIGHBORHOOD_MAP_OPTS[neighborhoodId] || {}) };
  }

  function initCommercial(stops, data) {
    const core = globalThis.CommercialHybridMapCore;
    const draw = globalThis.CommercialMapDraw;
    if (!core || !draw) return false;
    const commercial = stops.filter((s) => (s.neighborhood || "commercial") === "commercial");
    draw.setStationFromData(data);
    draw.setStops(commercial);
    if (core.setStation) {
      core.setStation(data?.station?.lat ?? 49.2634, data?.station?.lng ?? -123.0694);
      core.initCommercialWalkExtents(commercial);
    }
    return true;
  }

  function resolveSvg(svgOrId) {
    if (!svgOrId) return null;
    if (typeof svgOrId === "string") return document.getElementById(svgOrId);
    return svgOrId;
  }

  function stopsFromIds(ids) {
    return ids.map((id) => stopsById.get(id)).filter(Boolean);
  }

  function drawMap(svgOrId, routeStops, options = {}) {
    const svg = resolveSvg(svgOrId);
    if (!svg) return;

    const neighborhoodId =
      options.neighborhoodId ||
      routeStops[0]?.neighborhood ||
      "commercial";
    const mapOptions = {
      ...getMapOptions(neighborhoodId),
      ...(options.mapOptions || {}),
    };
    const drawOpts = { ...options, mapOptions };

    if (mapOptions.horizontal && window.EastVillageMap) {
      window.EastVillageMap.drawMap(svg, routeStops, drawOpts);
      return;
    }
    if (mapOptions.grid && window.ChinatownMap) {
      window.ChinatownMap.drawMap(svg, routeStops, drawOpts);
      return;
    }
    if (mapOptions.mpVertical && window.MountPleasantMap) {
      window.MountPleasantMap.drawMap(svg, routeStops, drawOpts);
      return;
    }
    if (globalThis.CommercialMapDraw) {
      globalThis.CommercialMapDraw.drawMap(svg, routeStops, drawOpts);
      return;
    }
    svg.innerHTML =
      '<text class="map-text" x="20" y="40">Map modules not loaded.</text>';
  }

  function drawMapByIds(svgOrId, stopIds, options = {}) {
    drawMap(svgOrId, stopsFromIds(stopIds), options);
  }

  async function loadMapData() {
    const [stopsRes, neighborhoodsRes] = await Promise.all([
      fetch("/data/stops.json", { cache: "no-store" }),
      fetch("/data/neighborhoods.json", { cache: "no-store" }),
    ]);
    if (!stopsRes.ok) throw new Error(`stops.json HTTP ${stopsRes.status}`);
    const data = await stopsRes.json();
    const neighborhoods = neighborhoodsRes.ok ? await neighborhoodsRes.json() : null;
    stationData = data;
    stopsById = new Map((data.stops || []).map((s) => [s.id, s]));
    initCommercial(data.stops || [], data);
    return { data, neighborhoods };
  }

  globalThis.V2MapBridge = {
    getMapOptions,
    loadMapData,
    drawMap,
    drawMapByIds,
    stopsFromIds,
    PRESETS: {
      commercial: ["s7", "s9", "s33"],
      victoria: ["s1", "s32", "s33", "s19"],
    },
  };
})();
