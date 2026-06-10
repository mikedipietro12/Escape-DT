/**
 * Chinatown grid map demo — draft stops + grid registry.
 */

const WALK_SPEED_KMH = 5;

const PRESETS = {
  pender: {
    label: "Pender crawl (Main → Gore)",
    ids: ["s136", "s171", "s170", "s169", "s144"],
  },
  georgia: {
    label: "Georgia row (Phnom Penh → east)",
    ids: ["s145", "s146", "s147", "s148", "s149"],
  },
  "north-south": {
    label: "North–south (Powell → Union)",
    ids: ["s161", "s136", "s171", "s137", "s138"],
  },
  strathcona: {
    label: "Strathcona east (Glen Dr)",
    ids: ["s180", "s179", "s178", "s177", "s176"],
  },
  mixed: {
    label: "Mixed grid tour",
    ids: ["s136", "s170", "s145", "s160", "s177", "s149"],
  },
};

let allStops = [];
let currentRoute = [];
let stationOn = true;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function placeholderImg(color) {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='100%25' height='100%25' fill='%23${color}'/%3E%3C/svg%3E`;
}

function hydrateStop(stop) {
  const color = stop.placeholderColor || "cccccc";
  return {
    ...stop,
    image: placeholderImg(color),
  };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  return window.ChinatownMap.haversineKm(lat1, lng1, lat2, lng2);
}

function getWalkLeg(a, b) {
  return window.ChinatownMap.getWalkLeg(a.lat, a.lng, b.lat, b.lng);
}

function getMapOptions() {
  const station = window.ChinatownMap.getStation({});
  return {
    grid: true,
    stationLat: station.lat,
    stationLng: station.lng,
    stationLabel: station.label,
    startAtStation: stationOn,
    endAtStation: stationOn,
  };
}

function renderDebugPanel(route) {
  const panel = document.getElementById("debug-panel");
  const tbody = document.getElementById("debug-rows");
  if (!panel || !tbody) return;
  tbody.innerHTML = route
    .map((stop) => {
      const d = window.ChinatownMap.debugResolveStop(stop);
      const cls = d.source === "snap" ? ' class="debug-snap"' : "";
      return `<tr${cls}><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.intersection)}</td><td>${escapeHtml(d.source)}</td></tr>`;
    })
    .join("");
  panel.hidden = !route.length;
}

function renderRouteCards(route) {
  const cards = document.getElementById("route-cards");
  if (!cards) return;
  cards.innerHTML = route
    .map(
      (s, i) => `
    <div class="route-card">
      <img src="${s.image}" alt="">
      <div class="content">
        <h3>${i + 1}. ${escapeHtml(s.name)}</h3>
        <div class="meta">${escapeHtml(s.crossStreet || ChinatownMap.debugResolveStop(s).intersection)}</div>
      </div>
    </div>`
    )
    .join("");
}

function renderTotals(route) {
  const el = document.getElementById("route-totals");
  if (!el) return;
  const legs = window.ChinatownMap.getRouteWalkLegs(route, getMapOptions());
  const totalMin = legs.reduce((s, l) => s + l.minutes, 0);
  const totalKm = legs.reduce((s, l) => s + l.km, 0);
  el.innerHTML = `<strong>${totalMin} min</strong> walk · ${totalKm.toFixed(1)} km`;
}

function updateSummary(route) {
  const title = document.getElementById("route-export-summary");
  const panel = document.getElementById("route-summary-panel");
  if (title) title.textContent = `YOUR CHINATOWN ROUTE — ${route.length} STOPS`;
  if (panel) panel.hidden = !route.length;
}

function drawRouteMap(route) {
  const svg = document.getElementById("route-map");
  if (!svg || !window.ChinatownMap) return;
  window.ChinatownMap.drawMap(svg, route, {
    mapOptions: getMapOptions(),
    onComplete: () => {
      document.getElementById("route-summary-panel")?.removeAttribute("hidden");
    },
  });
}

function setRouteFromPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return;
  currentRoute = preset.ids.map((id) => allStops.find((s) => s.id === id)).filter(Boolean);
  renderDebugPanel(currentRoute);
  updateSummary(currentRoute);
  renderRouteCards(currentRoute);
  renderTotals(currentRoute);
  drawRouteMap(currentRoute);
}

function populatePresetSelect() {
  const sel = document.getElementById("preset-select");
  if (!sel) return;
  sel.innerHTML = Object.entries(PRESETS)
    .map(([k, p]) => `<option value="${k}">${escapeHtml(p.label)}</option>`)
    .join("");
  sel.addEventListener("change", () => setRouteFromPreset(sel.value));
}

async function init() {
  if (location.protocol === "file:") {
    const w = document.getElementById("demo-warn");
    if (w) w.hidden = false;
    return;
  }
  await window.ChinatownMap.loadGridConfig("/data/chinatown-grid.json");
  const res = await fetch("/data/chinatown-draft.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`chinatown-draft.json HTTP ${res.status}`);
  const data = await res.json();
  allStops = (data.stops || []).map(hydrateStop);
  populatePresetSelect();
  document.getElementById("station-toggle")?.addEventListener("change", (e) => {
    stationOn = e.target.checked;
    drawRouteMap(currentRoute);
    renderTotals(currentRoute);
  });
  document.getElementById("btn-replay")?.addEventListener("click", () => drawRouteMap(currentRoute));
  setRouteFromPreset("mixed");
}

init().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<p style="color:#900;padding:1rem">Failed to load demo: ${escapeHtml(err.message)}</p>`
  );
});
