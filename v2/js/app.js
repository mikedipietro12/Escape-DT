/**
 * v2 app shell — editorial location cards in a tight grid.
 * Compact card on the grid; click expands in place (2×2) and displaces neighbors.
 */
(function () {
  "use strict";

  const DEFAULT_NEIGHBORHOOD = "commercial";

  let appStation = null;
  let dragPointer = null;
  let expandedStopId = null;
  let gridOrderBeforeExpand = null;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderTags(tags) {
    const chips = [];
    if (tags.primary) {
      chips.push(`<span class="v2-card__tag v2-card__tag--primary">${escapeHtml(tags.primary)}</span>`);
    }
    tags.secondary.forEach((tag) => {
      chips.push(`<span class="v2-card__tag">${escapeHtml(tag)}</span>`);
    });
    return chips.join("");
  }

  function renderCardCopy(stop) {
    const desc = stop.description
      ? `<p class="v2-card__desc">${escapeHtml(stop.description)}</p>`
      : "";
    const goto = stop.goto
      ? `<p class="v2-card__goto">My go-to: ${escapeHtml(stop.goto.replace(/\.$/, ""))}</p>`
      : "";
    return `${desc}${goto}`;
  }

  function renderCardHeader(stop, index) {
    const street = globalThis.V2Data.shortCrossStreet(stop.crossStreet);
    return `<header class="v2-card__head">
      <span class="v2-card__num">No. ${index + 1}</span>
      ${
        street
          ? `<span class="v2-card__street"><span class="v2-card__street-mark" aria-hidden="true"></span>${escapeHtml(street)}</span>`
          : ""
      }
    </header>
    <h2 class="v2-card__title">${escapeHtml(stop.name)}</h2>`;
  }

  function renderCardFooter(stop) {
    const tags = globalThis.V2Data.tileTags(stop);
    const distance = appStation
      ? globalThis.V2Data.formatDistanceFooter(stop, appStation)
      : "";
    return `<footer class="v2-card__foot">
      ${tags.primary || tags.secondary.length ? `<div class="v2-card__tags">${renderTags(tags)}</div>` : ""}
      ${distance ? `<p class="v2-card__distance">${escapeHtml(distance)}</p>` : ""}
    </footer>`;
  }

  function renderCompactCard(stop, index) {
    const photoStyle = globalThis.V2Data.stopPhotoStyle(stop, 0);
    return `<article class="v2-card" draggable="true" data-stop-id="${escapeHtml(stop.id)}" tabindex="0" aria-label="${escapeHtml(stop.name)}">
      ${renderCardHeader(stop, index)}
      <div class="v2-card__body v2-card__body--compact">
        <div class="v2-card__photo" style="${photoStyle}" role="img" aria-label=""></div>
        <div class="v2-card__copy">${renderCardCopy(stop)}</div>
      </div>
      ${renderCardFooter(stop)}
    </article>`;
  }

  function renderExpandedCardContent(stop, index) {
    const heroStyle = globalThis.V2Data.stopPhotoStyle(stop, 0);
    const secondaryStyle =
      stop.images?.length > 1
        ? globalThis.V2Data.stopPhotoStyle(stop, 1)
        : null;
    return `<button type="button" class="v2-card__close" aria-label="Close">×</button>
      ${renderCardHeader(stop, index)}
      <div class="v2-card__hero" style="${heroStyle}" role="img" aria-label=""></div>
      <div class="v2-card__body v2-card__body--expanded">
        ${
          secondaryStyle
            ? `<div class="v2-card__photo v2-card__photo--secondary" style="${secondaryStyle}" role="img" aria-label=""></div>`
            : ""
        }
        <div class="v2-card__copy">${renderCardCopy(stop)}</div>
      </div>
      ${renderCardFooter(stop)}`;
  }

  function renderTiles(stops) {
    const grid = document.getElementById("tile-grid");
    if (!grid) return;
    grid.innerHTML = stops
      .map((stop, index) => renderCompactCard(stop, index))
      .join("");
    expandedStopId = null;
    gridOrderBeforeExpand = null;
  }

  function findStopIndex(stops, stopId) {
    return stops.findIndex((s) => s.id === stopId);
  }

  function getGridColumns() {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--v2-grid-columns")
      .trim();
    const cols = Number.parseInt(raw, 10);
    return Number.isFinite(cols) && cols > 0 ? cols : 6;
  }

  function blockFits(anchorCol, anchorRow, cols, total) {
    if (anchorCol < 0 || anchorCol > cols - 2) return false;
    if (anchorRow < 0) return false;
    const anchorIdx = anchorRow * cols + anchorCol;
    const block = [anchorIdx, anchorIdx + 1, anchorIdx + cols, anchorIdx + cols + 1];
    return block.every((i) => i < total);
  }

  function expandAnchorForClick(clickIdx, cols, total) {
    let col = clickIdx % cols;
    let row = Math.floor(clickIdx / cols);

    if (col >= cols - 1) col = Math.max(0, cols - 2);
    if (!blockFits(col, row, cols, total) && row > 0) row -= 1;
    if (!blockFits(col, row, cols, total) && col > 0) col -= 1;

    const anchorIdx = row * cols + col;
    return { anchorCol: col, anchorRow: row, anchorIdx };
  }

  function clearGridPlacement(card) {
    card.style.gridColumn = "";
    card.style.gridRow = "";
  }

  function collapseInPlace(grid, stops) {
    if (!expandedStopId || !gridOrderBeforeExpand) return;

    const orderedStops = gridOrderBeforeExpand
      .map((id) => stops.find((s) => s.id === id))
      .filter(Boolean);

    grid.innerHTML = orderedStops
      .map((stop) => renderCompactCard(stop, findStopIndex(stops, stop.id)))
      .join("");

    expandedStopId = null;
    gridOrderBeforeExpand = null;
  }

  function expandInPlace(grid, stops, clickedCard) {
    const stopId = clickedCard.dataset.stopId;
    const stopIndex = findStopIndex(stops, stopId);
    if (stopIndex < 0) return;

    if (expandedStopId === stopId) {
      collapseInPlace(grid, stops);
      return;
    }

    if (expandedStopId) {
      collapseInPlace(grid, stops);
      clickedCard = grid.querySelector(`[data-stop-id="${stopId}"]`);
      if (!clickedCard) return;
    }

    const cols = getGridColumns();
    const cards = [...grid.children];
    const clickIdx = cards.indexOf(clickedCard);
    const total = cards.length;
    const { anchorCol, anchorRow, anchorIdx } = expandAnchorForClick(clickIdx, cols, total);

    if (!blockFits(anchorCol, anchorRow, cols, total)) return;

    gridOrderBeforeExpand = cards.map((card) => card.dataset.stopId);

    const blockList = [anchorIdx, anchorIdx + 1, anchorIdx + cols, anchorIdx + cols + 1].filter(
      (i) => i < total
    );
    const displacedIndices = blockList.filter((i) => i !== clickIdx);
    const afterStart = Math.max(...blockList) + 1;

    const newOrder = [
      ...cards.slice(0, anchorIdx),
      clickedCard,
      ...displacedIndices.map((i) => cards[i]),
      ...cards.slice(afterStart),
    ];

    const rowSpan = Math.min(2, Math.ceil(total / cols) - anchorRow);
    const colSpan = Math.min(2, cols - anchorCol);

    clickedCard.className = "v2-card v2-card--expanded v2-card--in-grid";
    clickedCard.removeAttribute("draggable");
    clickedCard.innerHTML = renderExpandedCardContent(stops[stopIndex], stopIndex);
    clickedCard.style.gridColumn = `span ${colSpan}`;
    clickedCard.style.gridRow = `span ${rowSpan}`;

    newOrder.forEach((card) => {
      if (card !== clickedCard) clearGridPlacement(card);
      grid.appendChild(card);
    });

    expandedStopId = stopId;
    clickedCard.querySelector(".v2-card__close")?.focus();
  }

  function bindTileInteractions(stops) {
    const grid = document.getElementById("tile-grid");
    if (!grid) return;

    grid.addEventListener("pointerdown", (e) => {
      const card = e.target.closest(".v2-card");
      if (!card || card.classList.contains("v2-card--in-grid")) return;
      dragPointer = { x: e.clientX, y: e.clientY, id: card.dataset.stopId };
    });

    grid.addEventListener("click", (e) => {
      if (e.target.closest(".v2-card__close")) {
        collapseInPlace(grid, stops);
        return;
      }

      const card = e.target.closest(".v2-card");
      if (!card || card.classList.contains("v2-card--in-grid")) return;

      if (dragPointer) {
        const dx = Math.abs(e.clientX - dragPointer.x);
        const dy = Math.abs(e.clientY - dragPointer.y);
        dragPointer = null;
        if (dx > 6 || dy > 6) return;
      }

      expandInPlace(grid, stops, card);
    });

    grid.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest(".v2-card");
      if (!card || card.classList.contains("v2-card--in-grid")) return;
      e.preventDefault();
      expandInPlace(grid, stops, card);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && expandedStopId) {
        collapseInPlace(grid, stops);
      }
    });
  }

  function drawPresetRoute(presetKey) {
    const bridge = globalThis.V2MapBridge;
    if (!bridge) return;
    const ids = bridge.PRESETS[presetKey] || bridge.PRESETS.commercial;
    bridge.drawMapByIds("route-map", ids, {
      neighborhoodId: DEFAULT_NEIGHBORHOOD,
      legDuration: 1400,
    });
    const status = document.getElementById("v2-status");
    if (status) {
      status.textContent = `Route · ${ids.join(" → ")}`;
    }
  }

  async function init() {
    const warn = document.getElementById("v2-warn");
    if (window.location.protocol === "file:") {
      if (warn) warn.hidden = false;
      return;
    }

    try {
      const data = await globalThis.V2Data.loadAppData();

      appStation = data.station;

      const stops = globalThis.V2Data.stopsForNeighborhood(
        data.stops,
        DEFAULT_NEIGHBORHOOD
      );
      renderTiles(stops);
      bindTileInteractions(stops);

      const status = document.getElementById("v2-status");
      if (status) {
        status.textContent = `${stops.length} stops`;
      }

      const presetSelect = document.getElementById("preset-select");
      if (presetSelect && globalThis.V2MapBridge) {
        await globalThis.V2MapBridge.loadMapData();
        presetSelect.addEventListener("change", () => {
          drawPresetRoute(presetSelect.value);
        });
        drawPresetRoute(presetSelect.value);
      }
    } catch (err) {
      if (warn) {
        warn.hidden = false;
        warn.textContent = `Could not load app data: ${err.message}. Run npm run dev from repo root.`;
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
