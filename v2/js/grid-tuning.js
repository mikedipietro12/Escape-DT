/**
 * v2 grid spacing tuner — open /v2/?tune=1 to show the panel.
 * Persists to localStorage; copy the readout into editorial-grid.css when approved.
 */
(function () {
  "use strict";

  const TUNING_KEY = "v2-grid-tuning";

  const DEFAULT_TUNING = {
    gapX: 23,
    gapY: 11,
    cardWidth: 280,
    cardHeight: 158,
    gridColumns: 6,
    gridJustify: "start",
    gridStretch: true,
    pagePadX: 8,
  };

  const root = document.documentElement;
  const panel = document.getElementById("v2-grid-tuner");
  const readout = document.getElementById("v2-tuning-readout");

  const controls = {
    gapX: document.getElementById("tune-gap-x"),
    gapY: document.getElementById("tune-gap-y"),
    cardWidth: document.getElementById("tune-card-width"),
    cardHeight: document.getElementById("tune-card-height"),
    gridColumns: document.getElementById("tune-grid-columns"),
    gridSpread: document.getElementById("tune-grid-spread"),
    pagePadX: document.getElementById("tune-page-pad-x"),
  };

  const outputs = {
    gapX: document.getElementById("tune-gap-x-out"),
    gapY: document.getElementById("tune-gap-y-out"),
    cardWidth: document.getElementById("tune-card-width-out"),
    cardHeight: document.getElementById("tune-card-height-out"),
    gridColumns: document.getElementById("tune-grid-columns-out"),
    pagePadX: document.getElementById("tune-page-pad-x-out"),
  };

  function normalizeTuning(tuning) {
    const next = { ...DEFAULT_TUNING, ...tuning };
    // Legacy spread modes used justify-content distribution (ignored column-gap).
    if (next.gridJustify === "space-between") {
      next.gridJustify = "start";
      next.gridStretch = true;
    } else if (next.gridJustify === "space-evenly") {
      next.gridJustify = "center";
      next.gridStretch = true;
    }
    return next;
  }

  function readTuning() {
    try {
      const raw = localStorage.getItem(TUNING_KEY);
      return raw ? normalizeTuning(JSON.parse(raw)) : { ...DEFAULT_TUNING };
    } catch {
      return { ...DEFAULT_TUNING };
    }
  }

  function saveTuning(tuning) {
    try {
      localStorage.setItem(TUNING_KEY, JSON.stringify(tuning));
    } catch {
      /* ignore */
    }
  }

  function spreadModeFromTuning(tuning) {
    if (tuning.gridStretch && tuning.gridJustify === "center") return "stretch-center";
    if (tuning.gridStretch) return "stretch-start";
    if (tuning.gridJustify === "center") return "center";
    return "start";
  }

  function tuningFromSpreadMode(mode, tuning) {
    const next = { ...tuning };
    switch (mode) {
      case "center":
        next.gridJustify = "center";
        next.gridStretch = false;
        break;
      case "stretch-start":
        next.gridJustify = "start";
        next.gridStretch = true;
        break;
      case "stretch-center":
        next.gridJustify = "center";
        next.gridStretch = true;
        break;
      default:
        next.gridJustify = "start";
        next.gridStretch = false;
    }
    return next;
  }

  function currentTuning() {
    const spreadMode = controls.gridSpread?.value ?? "start";
    const base = {
      gapX: Number(controls.gapX?.value ?? DEFAULT_TUNING.gapX),
      gapY: Number(controls.gapY?.value ?? DEFAULT_TUNING.gapY),
      cardWidth: Number(controls.cardWidth?.value ?? DEFAULT_TUNING.cardWidth),
      cardHeight: Number(controls.cardHeight?.value ?? DEFAULT_TUNING.cardHeight),
      gridColumns: Number(controls.gridColumns?.value ?? DEFAULT_TUNING.gridColumns),
      pagePadX: Number(controls.pagePadX?.value ?? DEFAULT_TUNING.pagePadX),
      gridJustify: DEFAULT_TUNING.gridJustify,
      gridStretch: DEFAULT_TUNING.gridStretch,
    };
    return tuningFromSpreadMode(spreadMode, base);
  }

  function applyToDocument(tuning) {
    root.style.setProperty("--v2-gap-x", `${tuning.gapX}px`);
    root.style.setProperty("--v2-gap", `${tuning.gapY}px`);
    root.style.setProperty("--v2-card-width-compact", `${tuning.cardWidth}px`);
    root.style.setProperty("--v2-card-height", `${tuning.cardHeight}px`);
    root.style.setProperty("--v2-card-aspect-w", String(tuning.cardWidth));
    root.style.setProperty("--v2-card-aspect-h", String(tuning.cardHeight));
    root.style.setProperty("--v2-grid-columns", String(tuning.gridColumns));
    root.style.setProperty("--v2-grid-justify", tuning.gridJustify);
    root.style.setProperty(
      "--v2-grid-track-max",
      tuning.gridStretch ? "1fr" : "var(--v2-card-width-compact)"
    );
    root.style.setProperty("--v2-page-pad-x", `${tuning.pagePadX}px`);
  }

  function syncOutputs(tuning) {
    if (outputs.gapX) outputs.gapX.textContent = `${tuning.gapX}px`;
    if (outputs.gapY) outputs.gapY.textContent = `${tuning.gapY}px`;
    if (outputs.cardWidth) outputs.cardWidth.textContent = `${tuning.cardWidth}px`;
    if (outputs.cardHeight) outputs.cardHeight.textContent = `${tuning.cardHeight}px`;
    if (outputs.gridColumns) outputs.gridColumns.textContent = String(tuning.gridColumns);
    if (outputs.pagePadX) outputs.pagePadX.textContent = `${tuning.pagePadX}px`;
  }

  function updateReadout(tuning) {
    if (!readout) return;
    readout.textContent = [
      `--v2-gap-x: ${tuning.gapX}px;`,
      `--v2-gap: ${tuning.gapY}px;`,
      `--v2-card-width-compact: ${tuning.cardWidth}px;`,
      `--v2-card-height: ${tuning.cardHeight}px;`,
      `--v2-grid-columns: ${tuning.gridColumns};`,
      `--v2-grid-justify: ${tuning.gridJustify};`,
      `--v2-card-aspect-w: ${tuning.cardWidth};`,
      `--v2-card-aspect-h: ${tuning.cardHeight};`,
      `--v2-grid-track-max: ${tuning.gridStretch ? "1fr" : "var(--v2-card-width-compact)"};`,
      `--v2-page-pad-x: ${tuning.pagePadX}px;`,
    ].join(" ");
  }

  function applyTuning(tuning) {
    if (controls.gapX) controls.gapX.value = String(tuning.gapX);
    if (controls.gapY) controls.gapY.value = String(tuning.gapY);
    if (controls.cardWidth) controls.cardWidth.value = String(tuning.cardWidth);
    if (controls.cardHeight) controls.cardHeight.value = String(tuning.cardHeight);
    if (controls.gridColumns) controls.gridColumns.value = String(tuning.gridColumns);
    if (controls.gridSpread) controls.gridSpread.value = spreadModeFromTuning(tuning);
    if (controls.pagePadX) controls.pagePadX.value = String(tuning.pagePadX);
    applyToDocument(tuning);
    syncOutputs(tuning);
    updateReadout(tuning);
  }

  function onControlChange() {
    const tuning = currentTuning();
    applyToDocument(tuning);
    syncOutputs(tuning);
    updateReadout(tuning);
    saveTuning(tuning);
  }

  function resetTuning() {
    try {
      localStorage.removeItem(TUNING_KEY);
    } catch {
      /* ignore */
    }
    applyTuning(DEFAULT_TUNING);
  }

  function copyReadout() {
    if (!readout?.textContent) return;
    navigator.clipboard?.writeText(readout.textContent).catch(() => {});
  }

  function bindControls() {
    Object.values(controls).forEach((el) => {
      el?.addEventListener("input", onControlChange);
      el?.addEventListener("change", onControlChange);
    });
    document.getElementById("tune-reset-btn")?.addEventListener("click", resetTuning);
    document.getElementById("tune-copy-btn")?.addEventListener("click", copyReadout);
    document.getElementById("v2-tuner-close")?.addEventListener("click", () => {
      if (panel) panel.hidden = true;
      root.classList.remove("v2-tune-active");
    });
  }

  function shouldShowPanel() {
    const params = new URLSearchParams(window.location.search);
    return params.has("tune");
  }

  function init() {
    if (!panel) return;

    bindControls();

    if (shouldShowPanel()) {
      applyTuning(readTuning());
      panel.hidden = false;
      root.classList.add("v2-tune-active");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
