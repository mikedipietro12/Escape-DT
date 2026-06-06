(function () {
  const HERO_SEASONS = {
    winter: "/assets/hero/shy-winter.png",
    spring: "/assets/hero/shy-spring.png",
    summer: "/assets/hero/shy-summer.png",
    fall: "/assets/hero/shy-fall.png",
  };

  const GROW_EASING = "cubic-bezier(0.22, 0.85, 0.25, 1)";
  const TUNING_KEY = "hero-speech-bubble-tuning";
  const TAIL_NOTCH_HALF = 11;
  const TAIL_TIP_X = -12.25;
  const TAIL_FRAME_PAD = 14;

  /** Keep in sync with demo/hero-speech-bubble-tuning.json (approved landing values). */
  const DEFAULT_TUNING = {
    tailY: "46",
    bubbleOffsetY: "12",
    bubbleGap: "-18",
    bgOpacity: "0.6",
    heroWidth: "192",
    bubbleMaxWidth: "340",
    growMs: "2400",
    growDelay: "1200",
    growStartX: "0.2",
    growStartY: "0.8",
    growOvershoot: "1.06",
    textFadePct: "67",
    forceMotion: false,
    showBorder: false,
    pulseEnabled: true,
    pulseDuration: "4.7",
    pulseDelay: "0.1",
    pulseScaleX: "1.019",
    pulseScaleY: "1.015",
  };

  const warnEl = document.getElementById("demo-warn");
  const heroImg = document.getElementById("hero-logo");
  const replayBtn = document.getElementById("replay-btn");
  const replayFullBtn = document.getElementById("replay-full-btn");
  const resetTuningBtn = document.getElementById("reset-tuning-btn");
  const tuningReadout = document.getElementById("tuning-readout");
  const tailY = document.getElementById("tail-y");
  const bubbleOffsetY = document.getElementById("bubble-offset-y");
  const bgOpacity = document.getElementById("bg-opacity");
  const bubbleGap = document.getElementById("bubble-gap");
  const heroWidth = document.getElementById("hero-width");
  const bubbleMaxWidth = document.getElementById("bubble-max-width");
  const growMs = document.getElementById("grow-ms");
  const growDelay = document.getElementById("grow-delay");
  const growStartX = document.getElementById("grow-start-x");
  const growStartY = document.getElementById("grow-start-y");
  const growOvershoot = document.getElementById("grow-overshoot");
  const textFadePct = document.getElementById("text-fade-pct");
  const showBorder = document.getElementById("show-border");
  const pulseEnabled = document.getElementById("pulse-enabled");
  const pulseDuration = document.getElementById("pulse-duration");
  const pulseDelay = document.getElementById("pulse-delay");
  const pulseScaleX = document.getElementById("pulse-scale-x");
  const pulseScaleY = document.getElementById("pulse-scale-y");
  const forceMotion = document.getElementById("force-motion");

  let settleTimer = null;
  let growDelayTimer = null;
  let growAnim = null;

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

  function numInput(input, fallback) {
    const n = parseFloat(input?.value ?? fallback);
    return Number.isFinite(n) ? n : parseFloat(fallback);
  }

  function growDurationMs() {
    return numInput(growMs, DEFAULT_TUNING.growMs);
  }

  function growDelayMs() {
    return numInput(growDelay, DEFAULT_TUNING.growDelay);
  }

  function writeTuning() {
    const tuning = {
      tailY: tailY?.value ?? DEFAULT_TUNING.tailY,
      bubbleOffsetY: bubbleOffsetY?.value ?? DEFAULT_TUNING.bubbleOffsetY,
      bubbleGap: bubbleGap?.value ?? DEFAULT_TUNING.bubbleGap,
      bgOpacity: bgOpacity?.value ?? DEFAULT_TUNING.bgOpacity,
      heroWidth: heroWidth?.value ?? DEFAULT_TUNING.heroWidth,
      bubbleMaxWidth: bubbleMaxWidth?.value ?? DEFAULT_TUNING.bubbleMaxWidth,
      growMs: growMs?.value ?? DEFAULT_TUNING.growMs,
      growDelay: growDelay?.value ?? DEFAULT_TUNING.growDelay,
      growStartX: growStartX?.value ?? DEFAULT_TUNING.growStartX,
      growStartY: growStartY?.value ?? DEFAULT_TUNING.growStartY,
      growOvershoot: growOvershoot?.value ?? DEFAULT_TUNING.growOvershoot,
      textFadePct: textFadePct?.value ?? DEFAULT_TUNING.textFadePct,
      forceMotion: Boolean(forceMotion?.checked),
      showBorder: Boolean(showBorder?.checked),
      pulseEnabled: Boolean(pulseEnabled?.checked),
      pulseDuration: pulseDuration?.value ?? DEFAULT_TUNING.pulseDuration,
      pulseDelay: pulseDelay?.value ?? DEFAULT_TUNING.pulseDelay,
      pulseScaleX: pulseScaleX?.value ?? DEFAULT_TUNING.pulseScaleX,
      pulseScaleY: pulseScaleY?.value ?? DEFAULT_TUNING.pulseScaleY,
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
      `--tail-y: ${root.getPropertyValue("--tail-y").trim() || "46px"};`,
      `--bubble-offset-y: ${root.getPropertyValue("--bubble-offset-y").trim() || "18px"};`,
      `--bubble-gap: ${root.getPropertyValue("--bubble-gap").trim() || "-12px"};`,
      `--bubble-bg-opacity: ${root.getPropertyValue("--bubble-bg-opacity").trim() || "0.15"};`,
      `--hero-figure-width: ${root.getPropertyValue("--hero-figure-width").trim() || "200px"};`,
      `--bubble-max-width: ${root.getPropertyValue("--bubble-max-width").trim() || "300px"};`,
    ];
    const anim = [
      `grow: ${growDurationMs()}ms`,
      growDelayMs() > 0 ? `grow delay: ${growDelayMs()}ms` : null,
      `start: scale(${growStartX?.value ?? DEFAULT_TUNING.growStartX}, ${growStartY?.value ?? DEFAULT_TUNING.growStartY})`,
      `overshoot: ${growOvershoot?.value ?? DEFAULT_TUNING.growOvershoot}`,
      `text@${textFadePct?.value ?? DEFAULT_TUNING.textFadePct}%`,
      showBorder?.checked === false ? "border: off" : "border: on",
    ].filter(Boolean);
    const pulse = pulseEnabled?.checked
      ? [
          `pulse: ${pulseDuration?.value ?? DEFAULT_TUNING.pulseDuration}s`,
          `delay ${pulseDelay?.value ?? DEFAULT_TUNING.pulseDelay}s`,
          `peak scale(${pulseScaleX?.value ?? DEFAULT_TUNING.pulseScaleX}, ${pulseScaleY?.value ?? DEFAULT_TUNING.pulseScaleY})`,
        ].join(" · ")
      : "pulse: off";
    tuningReadout.textContent = `${vars.join(" ")} · ${anim.join(" · ")} · ${pulse}`;
  }

  function applyTuning(tuning) {
    if (tailY) tailY.value = tuning.tailY;
    if (bubbleOffsetY) bubbleOffsetY.value = tuning.bubbleOffsetY;
    if (bubbleGap) bubbleGap.value = tuning.bubbleGap;
    if (bgOpacity) bgOpacity.value = tuning.bgOpacity ?? DEFAULT_TUNING.bgOpacity;
    if (heroWidth) heroWidth.value = tuning.heroWidth ?? DEFAULT_TUNING.heroWidth;
    if (bubbleMaxWidth) bubbleMaxWidth.value = tuning.bubbleMaxWidth ?? DEFAULT_TUNING.bubbleMaxWidth;
    if (growMs) growMs.value = tuning.growMs ?? DEFAULT_TUNING.growMs;
    if (growDelay) growDelay.value = tuning.growDelay ?? DEFAULT_TUNING.growDelay;
    if (growStartX) growStartX.value = tuning.growStartX ?? DEFAULT_TUNING.growStartX;
    if (growStartY) growStartY.value = tuning.growStartY ?? DEFAULT_TUNING.growStartY;
    if (growOvershoot) growOvershoot.value = tuning.growOvershoot ?? DEFAULT_TUNING.growOvershoot;
    if (textFadePct) textFadePct.value = tuning.textFadePct ?? DEFAULT_TUNING.textFadePct;
    if (showBorder) showBorder.checked = Boolean(tuning.showBorder);
    if (pulseEnabled) pulseEnabled.checked = tuning.pulseEnabled !== false;
    if (pulseDuration) pulseDuration.value = tuning.pulseDuration ?? DEFAULT_TUNING.pulseDuration;
    if (pulseDelay) pulseDelay.value = tuning.pulseDelay ?? DEFAULT_TUNING.pulseDelay;
    if (pulseScaleX) pulseScaleX.value = tuning.pulseScaleX ?? DEFAULT_TUNING.pulseScaleX;
    if (pulseScaleY) pulseScaleY.value = tuning.pulseScaleY ?? DEFAULT_TUNING.pulseScaleY;
    if (forceMotion) forceMotion.checked = tuning.forceMotion;
  }

  function resetTuning() {
    try {
      localStorage.removeItem(TUNING_KEY);
    } catch {
      /* ignore */
    }
    applyTuning(DEFAULT_TUNING);
    [
      tailY,
      bubbleOffsetY,
      bubbleGap,
      bgOpacity,
      heroWidth,
      bubbleMaxWidth,
      growMs,
      growDelay,
      growStartX,
      growStartY,
      growOvershoot,
      textFadePct,
      pulseDuration,
      pulseDelay,
      pulseScaleX,
      pulseScaleY,
    ].forEach((input) => {
      input?.dispatchEvent(new Event("input"));
    });
    applyForceMotion();
    applyShowBorder();
    applyPulse(true);
    replayBubble(true);
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

  function bindSlider(input, cssVar, suffix, onChange) {
    if (!input) return;
    const out = document.getElementById(`${input.id}-out`);
    const apply = () => {
      const val = input.value;
      if (out) {
        out.textContent = suffix ? `${val}${suffix}` : val;
      }
      if (cssVar) {
        document.documentElement.style.setProperty(cssVar, suffix ? `${val}${suffix}` : val);
      }
      writeTuning();
      onChange?.();
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

  function applyShowBorder() {
    document.documentElement.classList.toggle("bubble-border-off", !showBorder?.checked);
    writeTuning();
  }

  function restartPulseAnimation(wrap) {
    const bubble = wrap?.querySelector(".speech-bubble");
    if (!bubble || !wrap.classList.contains("is-settled")) return;
    bubble.style.animation = "none";
    void bubble.offsetWidth;
    bubble.style.removeProperty("animation");
  }

  function applyPulse(restart) {
    const wrap = document.getElementById("speech-wrap");
    const enabled = Boolean(pulseEnabled?.checked);
    wrap?.classList.toggle("is-pulse-on", enabled);
    document.documentElement.style.setProperty(
      "--pulse-duration",
      `${pulseDuration?.value ?? DEFAULT_TUNING.pulseDuration}s`
    );
    document.documentElement.style.setProperty(
      "--pulse-delay",
      `${pulseDelay?.value ?? DEFAULT_TUNING.pulseDelay}s`
    );
    document.documentElement.style.setProperty(
      "--pulse-scale-x",
      pulseScaleX?.value ?? DEFAULT_TUNING.pulseScaleX
    );
    document.documentElement.style.setProperty(
      "--pulse-scale-y",
      pulseScaleY?.value ?? DEFAULT_TUNING.pulseScaleY
    );
    writeTuning();
    if (restart && enabled) restartPulseAnimation(wrap);
  }

  function bindPulseControls() {
    const restart = () => applyPulse(true);
    bindSlider(pulseDuration, "--pulse-duration", "s", restart);
    bindSlider(pulseDelay, "--pulse-delay", "s", restart);
    bindSlider(pulseScaleX, "--pulse-scale-x", null, restart);
    bindSlider(pulseScaleY, "--pulse-scale-y", null, restart);
    pulseEnabled?.addEventListener("change", restart);
  }

  function clearGrowTimers() {
    clearTimeout(settleTimer);
    clearTimeout(growDelayTimer);
    settleTimer = null;
    growDelayTimer = null;
  }

  function cancelGrowAnimations(bubble, line) {
    growAnim?.cancel();
    growAnim = null;
    bubble?.getAnimations?.().forEach((anim) => anim.cancel());
    line?.getAnimations?.().forEach((anim) => anim.cancel());
  }

  function tailYpx() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--tail-y").trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 46;
  }

  function parsePx(val) {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : 0;
  }

  function speechFramePathD(w, h, r, tailYVal) {
    const joinTop = Math.max(r, tailYVal - TAIL_NOTCH_HALF);
    const joinBot = Math.min(h - r, tailYVal + TAIL_NOTCH_HALF);
    return [
      `M ${r} 0`,
      `H ${w - r}`,
      `A ${r} ${r} 0 0 1 ${w} ${r}`,
      `V ${h - r}`,
      `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
      `H ${r}`,
      `A ${r} ${r} 0 0 1 0 ${h - r}`,
      `V ${joinBot}`,
      `L ${TAIL_TIP_X} ${tailYVal}`,
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
    const tailYVal = tailYpx();
    const d = speechFramePathD(w, h, r, tailYVal);

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
    clearGrowTimers();

    const bubble = wrap.querySelector(".speech-bubble");
    const line = wrap.querySelector(".speech-line");

    wrap.classList.remove("is-growing", "is-animating", "is-goo-on", "is-grow-pending");
    wrap.classList.add("is-settled");

    if (bubble) {
      cancelGrowAnimations(bubble, line);
      bubble.style.removeProperty("transform");
      bubble.style.removeProperty("transform-origin");
      bubble.style.removeProperty("border-radius");
      bubble.style.removeProperty("animation");
    }
    if (line) {
      line.style.removeProperty("opacity");
      line.style.removeProperty("animation");
    }

    if (bubble) {
      requestAnimationFrame(() => {
        syncSpeechFrame(bubble);
        applyPulse(false);
      });
    }
  }

  function startGrow(wrap) {
    if (!wrap) return;
    clearGrowTimers();

    const bubble = wrap.querySelector(".speech-bubble");
    const line = wrap.querySelector(".speech-line");
    if (!bubble) return;

    if (typeof bubble.animate !== "function") {
      finishGrow(wrap);
      return;
    }

    cancelGrowAnimations(bubble, line);

    wrap.classList.remove("is-settled", "is-growing", "is-animating", "is-goo-on", "is-grow-pending");
    wrap.classList.add("is-growing", "is-animating");
    wrap.classList.toggle("is-goo-on", bubbleBgOpacity() >= 0.99);

    const duration = growDurationMs();
    const startX = numInput(growStartX, DEFAULT_TUNING.growStartX);
    const startY = numInput(growStartY, DEFAULT_TUNING.growStartY);
    const overshoot = numInput(growOvershoot, DEFAULT_TUNING.growOvershoot);
    const textPct = numInput(textFadePct, DEFAULT_TUNING.textFadePct) / 100;

    const origin = `left ${tailYpx()}px`;
    bubble.style.transformOrigin = origin;

    if (line) {
      line.style.opacity = "0";
    }

    void bubble.offsetWidth;

    growAnim = bubble.animate(
      [
        {
          transform: `scale(${startX}, ${startY})`,
          borderRadius: "50% 50% 48% 52% / 54% 46% 50% 50%",
        },
        {
          transform: `scale(${overshoot}, ${overshoot - 0.006})`,
          borderRadius: "1.12rem",
          offset: 0.92,
        },
        {
          transform: "scale(1, 1)",
          borderRadius: "1.15rem",
        },
      ],
      {
        duration,
        easing: GROW_EASING,
        fill: "forwards",
      }
    );

    if (line) {
      line.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        {
          duration,
          easing: GROW_EASING,
          fill: "forwards",
          delay: Math.round(duration * textPct),
        }
      );
    }

    growAnim.onfinish = () => finishGrow(wrap);
    growAnim.oncancel = () => {};

    settleTimer = setTimeout(() => finishGrow(wrap), duration + 120);
  }

  function scheduleGrow(wrap, { skipDelay = false } = {}) {
    if (!wrap) return;

    clearGrowTimers();
    wrap.classList.remove("is-settled", "is-growing", "is-animating", "is-goo-on");
    wrap.classList.add("is-grow-pending");

    const delay = skipDelay ? 0 : growDelayMs();
    growDelayTimer = setTimeout(() => {
      growDelayTimer = null;
      startGrow(wrap);
    }, delay);
  }

  function replayBubble(skipDelay) {
    scheduleGrow(document.getElementById("speech-wrap"), { skipDelay: Boolean(skipDelay) });
  }

  function shouldAnimate() {
    if (document.documentElement.classList.contains("force-motion")) return true;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

    const bubbleEl = document.querySelector(".speech-bubble");
    bindSlider(tailY, "--tail-y", "px", () => {
      if (bubbleEl) syncSpeechFrame(bubbleEl);
    });
    if (bubbleEl) observeSpeechBubble(bubbleEl);

    bindSlider(bubbleOffsetY, "--bubble-offset-y", "px");
    bindSlider(bubbleGap, "--bubble-gap", "px");
    bindSlider(heroWidth, "--hero-figure-width", "px");
    bindSlider(bubbleMaxWidth, "--bubble-max-width", "px");
    bindSlider(growMs, null, "ms");
    bindSlider(growDelay, null, "ms", () => replayBubble(false));
    bindSlider(growStartX, null, null);
    bindSlider(growStartY, null, null);
    bindSlider(growOvershoot, null, null);
    bindSlider(textFadePct, null, "%");
    bindBgOpacitySlider();
    bindPulseControls();

    forceMotion?.addEventListener("change", () => {
      applyForceMotion();
      replayBubble(true);
    });

    showBorder?.addEventListener("change", applyShowBorder);

    const wrap = document.getElementById("speech-wrap");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion && forceMotion) forceMotion.checked = true;
    applyForceMotion();
    applyShowBorder();
    applyPulse(false);

    if (wrap) {
      if (reducedMotion && !document.documentElement.classList.contains("force-motion")) {
        finishGrow(wrap);
      } else {
        scheduleGrow(wrap);
      }
    }

    document.querySelectorAll("[data-season-btn]").forEach((btn) => {
      btn.addEventListener("click", () => setHeroSrc(btn.dataset.seasonBtn));
    });

    replayBtn?.addEventListener("click", () => replayBubble(true));
    replayFullBtn?.addEventListener("click", () => replayBubble(false));
    resetTuningBtn?.addEventListener("click", resetTuning);
    setHeroSrc("spring");
    updateTuningReadout();
  }

  init();
})();
