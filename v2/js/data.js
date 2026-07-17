/**
 * v2 data layer — fetch shared JSON from repo root.
 */
(function () {
  "use strict";

  async function loadAppData() {
    const [stopsRes, plansRes, areasRes, neighborhoodsRes] = await Promise.all([
      fetch("/data/stops.json", { cache: "no-store" }),
      fetch("/data/plans.json", { cache: "no-store" }),
      fetch("/data/areas.json", { cache: "no-store" }),
      fetch("/data/neighborhoods.json", { cache: "no-store" }),
    ]);

    if (!stopsRes.ok) throw new Error(`stops.json HTTP ${stopsRes.status}`);

    const stopsPayload = await stopsRes.json();
    const plans = plansRes.ok ? await plansRes.json() : { plans: {} };
    const areas = areasRes.ok ? await areasRes.json() : { areas: {} };
    const neighborhoods = neighborhoodsRes.ok
      ? await neighborhoodsRes.json()
      : { neighborhoods: {} };

    const stops = stopsPayload.stops || [];
    const byId = new Map(stops.map((s) => [s.id, s]));

    return {
      station: stopsPayload.station,
      stops,
      stopsById: byId,
      plans,
      areas,
      neighborhoods,
    };
  }

  function stopsForNeighborhood(stops, neighborhoodId) {
    return stops.filter((s) => (s.neighborhood || "commercial") === neighborhoodId);
  }

  function stopImageUrl(stop) {
    const path = stop.images?.[0] || stop.image;
    if (path) return path.startsWith("/") ? path : `/${path}`;
    return null;
  }

  function stopThumbStyle(stop) {
    const img = stopImageUrl(stop);
    if (img) {
      return `background-image:url('${img}')`;
    }
    const hex = (stop.placeholderColor || "cccccc").replace(/^#/, "");
    return `background-color:#${hex}`;
  }

  function formatCost(cost) {
    if (cost == null || cost === "") return "Free";
    if (typeof cost === "string") {
      return cost.toLowerCase() === "free" ? "Free" : cost;
    }
    if (Array.isArray(cost)) {
      const min = cost[0];
      const max = cost[cost.length - 1];
      if (!min) return "";
      if (!max || min === max) return min;
      return `${min}–${max}`;
    }
    if (typeof cost === "object") {
      const { min, max } = cost;
      if (min != null && max != null && min !== max) return `${min}–${max}`;
      return min || max || "";
    }
    return String(cost);
  }

  const WALK_SPEED_KMH = 5;

  const CATEGORY_LABELS = {
    coffee: "COFFEE",
    food: "FOOD",
    drinks: "DRINKS",
    shopping: "SHOP",
    hangout: "HANGOUT",
    groceries: "GROCERIES",
  };

  const TAG_SKIP = new Set([
    "sit down",
    "grab and go",
    "take out",
    "shops",
    "activities",
    "patio",
    "tvs",
    "cocktails",
    "beer",
    "cookies",
    "art gallery",
    "park",
    "books",
    "shoes",
  ]);

  function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function shortCrossStreet(crossStreet) {
    if (!crossStreet) return "";
    const parts = crossStreet.split(/[&/]/).map((s) => s.trim());
    const raw = parts[parts.length - 1] || crossStreet;
    return raw
      .replace(/^E\s+/i, "")
      .replace(/\s+(Ave|Avenue|St|Street|Blvd|Boulevard|Rd|Road)\.?$/i, "")
      .trim();
  }

  function formatDistanceFooter(stop, station) {
    if (!stop.lat || !stop.lng || !station?.lat || !station?.lng) return "";
    const km = haversineKm(station.lat, station.lng, stop.lat, stop.lng);
    const kmLabel = km < 10 ? km.toFixed(1) : Math.round(km).toString();
    const minutes =
      stop.walkFromStation ??
      Math.max(1, Math.round((km / WALK_SPEED_KMH) * 60));
    return `${kmLabel} km from Skytrain ~${minutes} minute walk`;
  }

  function tileTags(stop) {
    const primary = (stop.categories || [])
      .map((c) => CATEGORY_LABELS[c] || c.toUpperCase())
      .find(Boolean);
    const secondary = (stop.tags || [])
      .filter((t) => !TAG_SKIP.has(String(t).toLowerCase()))
      .map((t) => String(t).toUpperCase())
      .filter((t) => t !== primary)
      .slice(0, 3);
    return { primary, secondary };
  }

  function stopPhotoStyle(stop, imageIndex = 0) {
    const path = stop.images?.[imageIndex] || (imageIndex === 0 ? stop.image : null);
    if (path) {
      const url = path.startsWith("/") ? path : `/${path}`;
      return `background-image:url('${url}')`;
    }
    const hex = (stop.placeholderColor || "cccccc").replace(/^#/, "");
    return `background-color:#${hex}`;
  }

  globalThis.V2Data = {
    loadAppData,
    stopsForNeighborhood,
    stopImageUrl,
    stopThumbStyle,
    stopPhotoStyle,
    formatCost,
    shortCrossStreet,
    formatDistanceFooter,
    tileTags,
    CATEGORY_LABELS,
  };
})();
