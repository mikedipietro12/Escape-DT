/**
 * Year-round fade themes (Vancouver / Northern hemisphere).
 * Six labelled periods, split at the 15th so each half-month has one gradient.
 * Sets --fade-top / --fade-bottom on <html> before paint when loaded in <head>.
 * Preview: ?season=winter|thaw|spring|summer|autumn|late-fall
 */
(function applySeasonTheme() {
  const FADE = {
    yellow: "#ffeea1",
    green: "#b2fdb5",
    red: "#fd696c",
    blue: "#8edcee",
    orange: "#ffaf64",
    white: "#ffffff",
  };

  /** @type {Record<string, { top: string, bottom: string }>} */
  const THEMES = {
    winter: { top: FADE.white, bottom: FADE.blue },
    thaw: { top: FADE.blue, bottom: FADE.green },
    spring: { top: FADE.green, bottom: FADE.yellow },
    summer: { top: FADE.yellow, bottom: FADE.orange },
    autumn: { top: FADE.yellow, bottom: FADE.red },
    "late-fall": { top: FADE.red, bottom: FADE.blue },
  };

  /** Route-map walking lines follow the seasonal art direction. */
  const MAP_ROUTE_COLORS = {
    winter: ["#8edcee", "#b7c3c8"],
    thaw: [FADE.blue, FADE.green],
    spring: [FADE.green, FADE.yellow],
    summer: [FADE.orange, FADE.yellow],
    autumn: [FADE.red, FADE.orange],
    "late-fall": [FADE.red, FADE.orange],
  };

  /** Hero mascot PNGs (transparent); reuse closest art when no dedicated asset. */
  const HERO_LOGO = {
    winter: "assets/hero/shy-winter.png",
    thaw: "assets/hero/shy-winter.png",
    spring: "assets/hero/shy-spring.png",
    summer: "assets/hero/shy-summer.png",
    autumn: "assets/hero/shy-fall.png",
    "late-fall": "assets/hero/shy-fall.png",
  };

  /** 0 = days 1–15, 1 = days 16–end */
  function halfMonthIndex(date) {
    return date.getMonth() * 2 + (date.getDate() >= 16 ? 1 : 0);
  }

  /**
   * Calendar labels (overlapping) → non-overlapping half-months (chronological):
   * Dec–Feb: Dec 16–Feb 15 | Feb–Apr: Feb 16–Apr 15 | Apr–Jun: Apr 16–Jun 15
   * Jun–Sept: Jun 16–Sep 15 | Sept–Oct: Sep 16–Oct 15 | Oct–Dec: Oct 16–Dec 15
   */
  function themeKeyFromDate(date) {
    const i = halfMonthIndex(date);
    if (i <= 2 || i === 23) return "winter";
    if (i <= 6) return "thaw";
    if (i <= 10) return "spring";
    if (i <= 16) return "summer";
    if (i <= 18) return "autumn";
    if (i <= 22) return "late-fall";
    return "winter";
  }

  const params = new URLSearchParams(window.location.search);
  const override = (params.get("season") || "").toLowerCase();
  const key = THEMES[override] ? override : themeKeyFromDate(new Date());
  const theme = THEMES[key];
  const root = document.documentElement;

  root.dataset.season = key;
  root.dataset.heroLogo = HERO_LOGO[key];
  root.style.setProperty("--fade-top", theme.top);
  root.style.setProperty("--fade-bottom", theme.bottom);
  root.style.setProperty("--map-route-colors", MAP_ROUTE_COLORS[key].join(", "));
})();
