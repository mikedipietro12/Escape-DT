(function () {
  const HERO_SEASONS = {
    winter: "/assets/hero/shy-winter.png",
    spring: "/assets/hero/shy-spring.png",
    summer: "/assets/hero/shy-summer.png",
    fall: "/assets/hero/shy-fall.png",
  };

  const GROW_MS = 1400;
  const TUNING_KEY = "hero-speech-bubble-tuning";
  const TAIL_NOTCH_HALF = 11;
  const TAIL_TIP_X = -12.25;
  const TAIL_FRAME_PAD = 14;

  /** Keep in sync with demo/hero-speech-bubble-tuning.json (approved landing values). */
  const DEFAULT_TUNING = {
    tailY: "46",
    bubbleOffsetY: "18",
    bubbleGap: "-12",
    bgOpacity: "0.15",
    forceMotion: false,
  };

  const warnEl = document.getElementById("demo-warn");
  const heroImg = document.getElementById("hero-logo");
  const replayBtn = document.getElementById("replay-btn");
  const resetTuningBtn = document.getElementById("reset-tuning-btn");
  const tuningReadout = document.getElementById("tuning-readout");
  const tailY = document.getElementById("tail-y");
  const bubbleOffsetY = document.getElementById("bubble-offset-y");
  const bgOpacity = document.getElementById("bg-opacity");
  const bubbleGap = document.getElementById("bubble-gap");
  const forceMotion = document.getElementById("force-motion");

  let settleTimer = null;

  function assetBase() {
    if (location.protocol === "file:") return "..";
    return "";
  }

  function resolveAsset(path) {
    const base = assetBase();
    return base ? `${base}${path}` : path;
  }

  function showFileWarning() {
    if (!warnEl) return;
    warnEl.hidden = location.protocol !== "file:";
  }

  function setHeroSrc(season) {
    if (!heroImg || !HERO_SEASONS[season]) return;
    heroImg.classList.remove("hero-logo--missing");
    heroImg.src = resolveAsset(HERO_SEASONS[season]);
    document.querySelectorAll("[data-season-btn]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.seasonBtn === season);
    });
  }

  function onHeroError() {
    heroImg?.classList.add("hero-logo--missing");
  }

  function readTuning() {
    try {
      const raw = localStorage.getItem(TUNING_KEY);
      return raw ? { ...DEFAULT_TUNING, ...JSON.parse(raw) } : { ...DEFAULT_TUNING };
    } catch {
      return { ...DEFAULT_TUNING };
    }
  }

  function writeTuning() {
    const tuning = {
      tailY: tailY?.value ?? DEFAULT_TUNING.tailY,
      bubbleOffsetY: bubbleOffsetY?.value ?? DEFAULT_TUNING.bubbleOffsetY,
      bubbleGap: bubbleGap?.value ?? DEFAULT_TUNING.bubbleGap,
      bgOpacity: bgOpacity?.value ?? DEFAULT_TUNING.bgOpacity,
      forceMotion: Boolean(forceMotion?.checked),
    };
    try {
      localStorage.setItem(TUNING_KEY, JSON.stringify(tuning));
    } catch {
      /* ignore quota / private mode */
    }
    updateTuningReadout();
  }

  function updateTuningReadout() {
    if (!tuningReadout) return;
    const root = getComputedStyle(document.documentElement);
    const vars = [
      `--tail-y: ${root.getPropertyValue("--tail-y").trim() || "38px"};`,
      `--bubble-offset-y: ${root.getPropertyValue("--bubble-offset-y").trim() || "14px"};`,
      `--bubble-gap: ${root.getPropertyValue("--bubble-gap").trim() || "-14px"};`,
      `--bubble-bg-opacity: ${root.getPropertyValue("--bubble-bg-opacity").trim() || "1"};`,
    ];
    tuningReadout.textContent = vars.join(" ");
  }

  function applyTuning(tuning) {
    if (tailY) tailY.value = tuning.tailY;
    if (bubbleOffsetY) bubbleOffsetY.value = tuning.bubbleOffsetY;
    if (bubbleGap) bubbleGap.value = tuning.bubbleGap;
    if (bgOpacity) bgOpacity.value = tuning.bgOpacity ?? DEFAULT_TUNING.bgOpacity;
    if (forceMotion) forceMotion.checked = tuning.forceMotion;
  }

  function resetTuning() {
    try {
      localStorage.removeItem(TUNING_KEY);
    } catch {
      /* ignore */
    }
    applyTuning(DEFAULT_TUNING);
    [tailY, bubbleOffsetY, bubbleGap, bgOpacity].forEach((input) => {
      input?.dispatchEvent(new Event("input"));
    });
    applyForceMotion();
    replayBubble();
  }

  function bubbleBgOpacity() {
    return parseFloat(bgOpacity?.value ?? DEFAULT_TUNING.bgOpacity) || 1;
  }

  function syncBgOpacity() {
    const val = String(bubbleBgOpacity());
    document.documentElement.style.setProperty("--bubble-bg-opacity", val);
    const out = document.getElementById("bg-opacity-out");
    if (out) out.textContent = val;
    const wrap = document.getElementById("speech-wrap");
    wrap?.classList.toggle("is-goo-on", bubbleBgOpacity() >= 0.99);
  }

  function bindSlider(input, cssVar, suffix) {
    if (!input) return;
    const out = document.getElementById(`${input.id}-out`);
    const apply = () => {
      const val = input.value;
      if (out) out.textContent = suffix ? `${val}${suffix}` : val;
      if (cssVar) {
        document.documentElement.style.setProperty(cssVar, suffix ? `${val}${suffix}` : val);
      }
      writeTuning();
    };
    input.addEventListener("input", apply);
    apply();
  }

  function bindBgOpacitySlider() {
    if (!bgOpacity) return;
    const apply = () => {
      syncBgOpacity();
      writeTuning();
    };
    bgOpacity.addEventListener("input", apply);
    apply();
  }

  function applyForceMotion() {
    document.documentElement.classList.toggle("force-motion", Boolean(forceMotion?.checked));
    writeTuning();
  }

  function clearGrowTimers() {
    clearTimeout(settleTimer);
  }

  function tailYpx() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--tail-y").trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 38;
  }

  function parsePx(val) {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : 0;
  }

  function speechFramePathD(w, h, r, tailY) {
    const joinTop = Math.max(r, tailY - TAIL_NOTCH_HALF);
    const joinBot = Math.min(h - r, tailY + TAIL_NOTCH_HALF);
    return [
      `M ${r} 0`,
      `H ${w - r}`,
      `A ${r} ${r} 0 0 1 ${w} ${r}`,
      `V ${h - r}`,
      `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
      `H ${r}`,
      `A ${r} ${r} 0 0 1 0 ${h - r}`,
      `V ${joinBot}`,
      `L ${TAIL_TIP_X} ${tailY}`,
      `L 0 ${joinTop}`,
      `V ${r}`,
      `A ${r} ${r} 0 0 1 ${r} 0`,
      "Z",
    ].join(" ");
  }

  function syncSpeechFrame(bubble) {
    const svg = bubble?.querySelector(".speech-frame");
    const fill = bubble?.querySelector(".speech-frame-fill");
    const stroke = bubble?.querySelector(".speech-frame-stroke");
    if (!svg || !stroke || !bubble) return;

    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    if (w <= 0 || h <= 0) return;

    const style = getComputedStyle(bubble);
    const r = Math.min(parsePx(style.borderTopLeftRadius), w / 2, h / 2, 18.4);
    const tailY = tailYpx();
    const d = speechFramePathD(w, h, r, tailY);

    svg.setAttribute("viewBox", `${-TAIL_FRAME_PAD} 0 ${w + TAIL_FRAME_PAD} ${h}`);
    fill?.setAttribute("d", d);
    stroke.setAttribute("d", d);
  }

  function observeSpeechBubble(bubble) {
    if (!bubble || bubble._speechEdgeObserved) return;
    bubble._speechEdgeObserved = true;
    const ro = new ResizeObserver(() => syncSpeechFrame(bubble));
    ro.observe(bubble);
    syncSpeechFrame(bubble);
  }

  function finishGrow(wrap) {
    if (!wrap) return;
    wrap.classList.remove("is-animating", "is-goo-on");
    wrap.classList.add("is-settled");
    const bubble = wrap.querySelector(".speech-bubble");
    if (bubble) {
      requestAnimationFrame(() => syncSpeechFrame(bubble));
    }
  }

  function resetGrowAnimation(bubble) {
    if (!bubble) return;
    bubble.style.animation = "none";
    void bubble.offsetWidth;
    bubble.style.removeProperty("animation");
    bubble.style.removeProperty("transform");
  }

  function resetPseudoAnimations(bubble) {
    if (!bubble) return;
    const tail = bubble.querySelector(".speech-tail");
    bubble.classList.add("reset-pseudos");
    if (tail) {
      tail.style.animation = "none";
      tail.style.opacity = "0";
    }
    void bubble.offsetWidth;
    bubble.classList.remove("reset-pseudos");
    if (tail) {
      tail.style.removeProperty("animation");
      tail.style.removeProperty("opacity");
    }
  }

  function startGrow(wrap) {
    if (!wrap) return;
    clearGrowTimers();

    const bubble = wrap.querySelector(".speech-bubble");
    const line = wrap.querySelector(".speech-line");
    if (!bubble) return;

    wrap.classList.remove("is-settled", "is-animating", "is-goo-on");
    resetGrowAnimation(bubble);
    resetPseudoAnimations(bubble);
    if (line) {
      line.style.animation = "none";
      line.style.opacity = "0";
      void line.offsetWidth;
      line.style.removeProperty("animation");
      line.style.removeProperty("opacity");
    }

    void wrap.offsetWidth;
    wrap.classList.add("is-animating");
    wrap.classList.toggle("is-goo-on", bubbleBgOpacity() >= 0.99);

    bubble.removeEventListener("animationend", onBubbleGrowEnd);
    bubble.addEventListener("animationend", onBubbleGrowEnd);

    settleTimer = setTimeout(() => finishGrow(wrap), GROW_MS);
  }

  function onBubbleGrowEnd(e) {
    if (e.animationName !== "bubble-lava-grow") return;
    clearGrowTimers();
    finishGrow(e.target.closest(".speech-bubble-wrap"));
  }

  function replayBubble() {
    startGrow(document.getElementById("speech-wrap"));
  }

  function init() {
    showFileWarning();
    applyTuning(readTuning());

    if (heroImg) {
      heroImg.addEventListener("error", onHeroError);
      if (!heroImg.getAttribute("src") || heroImg.getAttribute("src").startsWith("/")) {
        heroImg.src = resolveAsset("/assets/hero/shy-spring.png");
      }
      heroImg.addEventListener("load", () => heroImg.classList.remove("hero-logo--missing"));
    }

    bindSlider(tailY, "--tail-y", "px");
    const bubbleEl = document.querySelector(".speech-bubble");
    if (bubbleEl) {
      observeSpeechBubble(bubbleEl);
      tailY?.addEventListener("input", () => syncSpeechFrame(bubbleEl));
    }
    bindSlider(bubbleOffsetY, "--bubble-offset-y", "px");
    bindSlider(bubbleGap, "--bubble-gap", "px");
    bindBgOpacitySlider();

    forceMotion?.addEventListener("change", () => {
      applyForceMotion();
      replayBubble();
    });

    const wrap = document.getElementById("speech-wrap");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion && forceMotion) forceMotion.checked = true;
    applyForceMotion();

    if (wrap) {
      if (reducedMotion && !document.documentElement.classList.contains("force-motion")) {
        finishGrow(wrap);
      } else {
        startGrow(wrap);
      }
    }

    document.querySelectorAll("[data-season-btn]").forEach((btn) => {
      btn.addEventListener("click", () => setHeroSrc(btn.dataset.seasonBtn));
    });

    replayBtn?.addEventListener("click", replayBubble);
    resetTuningBtn?.addEventListener("click", resetTuning);
    setHeroSrc("spring");
    updateTuningReadout();
  }

  init();
})();
