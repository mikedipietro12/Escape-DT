/**
 * Animated landing hero (mascot + speech bubble).
 *
 * Revert without deleting files:
 *   - Set data-hero-bubble="off" on <html>, or open ?hero=static
 *
 * Preview grow animation when OS "reduce motion" is on: ?hero=motion
 */
(function () {
  const GROW_MS = 1100;
  const GROW_DELAY_MS = 0;
  const GROW_START_X = 0.2;
  const GROW_START_Y = 0.8;
  const GROW_OVERSHOOT = 1.06;
  const TEXT_FADE_PCT = 0.67;
  const GROW_EASING = "cubic-bezier(0.22, 0.85, 0.25, 1)";
  const TAIL_NOTCH_HALF = 11;
  const TAIL_TIP_X = -12.25;
  const TAIL_FRAME_PAD = 14;
  const BUBBLE_BG_OPACITY = 0.6;

  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  if (params.get("hero") === "static") {
    root.dataset.heroBubble = "off";
  }
  if (params.get("hero") === "motion") {
    root.classList.add("force-motion");
  }
  if (!root.dataset.heroBubble) {
    root.dataset.heroBubble = "on";
  }
  if (root.dataset.heroBubble === "off") {
    return;
  }

  root.classList.add("hero-anim-js");

  let heroImg = document.getElementById("hero-logo");
  let wrap = document.getElementById("speech-wrap");
  let settleTimer = null;
  let growDelayTimer = null;
  let growAnim = null;

  function tailYpx() {
    const wrapEl = document.querySelector(".hero-mascot-wrap");
    const raw = wrapEl
      ? getComputedStyle(wrapEl).getPropertyValue("--tail-y").trim()
      : "46px";
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 46;
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

  function clearGrowTimers() {
    clearTimeout(settleTimer);
    clearTimeout(growDelayTimer);
    settleTimer = null;
    growDelayTimer = null;
  }

  function cancelGrowAnimations(bubble) {
    growAnim?.cancel();
    growAnim = null;
    bubble?.getAnimations?.().forEach((anim) => anim.cancel());
  }

  function finishGrow(speechWrap) {
    if (!speechWrap) return;
    clearGrowTimers();

    const bubble = speechWrap.querySelector(".speech-bubble");
    const line = speechWrap.querySelector(".speech-line");

    speechWrap.classList.remove("is-growing", "is-animating", "is-goo-on", "is-grow-pending");
    speechWrap.classList.add("is-settled");

    if (bubble) {
      cancelGrowAnimations(bubble);
      bubble.style.removeProperty("transform");
      bubble.style.removeProperty("transform-origin");
      bubble.style.removeProperty("border-radius");
      bubble.style.removeProperty("animation");
    }
    if (line) {
      line.getAnimations?.().forEach((anim) => anim.cancel());
      line.style.removeProperty("opacity");
      line.style.removeProperty("animation");
    }

    if (bubble) {
      requestAnimationFrame(() => {
        syncSpeechFrame(bubble);
        observeSpeechBubble(bubble);
      });
    }
  }

  function startGrow(speechWrap) {
    const bubble = speechWrap?.querySelector(".speech-bubble");
    const line = speechWrap?.querySelector(".speech-line");
    if (!bubble || typeof bubble.animate !== "function") {
      finishGrow(speechWrap);
      return;
    }

    clearGrowTimers();
    cancelGrowAnimations(bubble);

    speechWrap.classList.remove("is-settled", "is-growing", "is-animating", "is-goo-on", "is-grow-pending");
    speechWrap.classList.add("is-growing", "is-animating");
    speechWrap.classList.toggle("is-goo-on", BUBBLE_BG_OPACITY >= 0.99);

    const origin = `left ${tailYpx()}px`;
    bubble.style.transformOrigin = origin;

    if (line) {
      line.style.opacity = "0";
    }

    void bubble.offsetWidth;

    growAnim = bubble.animate(
      [
        {
          transform: `scale(${GROW_START_X}, ${GROW_START_Y})`,
          borderRadius: "50% 50% 48% 52% / 54% 46% 50% 50%",
        },
        {
          transform: `scale(${GROW_OVERSHOOT}, ${GROW_OVERSHOOT - 0.006})`,
          borderRadius: "1.12rem",
          offset: 0.92,
        },
        {
          transform: "scale(1, 1)",
          borderRadius: "1.15rem",
        },
      ],
      {
        duration: GROW_MS,
        easing: GROW_EASING,
        fill: "forwards",
      }
    );

    if (line) {
      line.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        {
          duration: GROW_MS,
          easing: GROW_EASING,
          fill: "forwards",
          delay: Math.round(GROW_MS * TEXT_FADE_PCT),
        }
      );
    }

    growAnim.onfinish = () => finishGrow(speechWrap);
    growAnim.oncancel = () => {};

    settleTimer = setTimeout(() => finishGrow(speechWrap), GROW_MS + 120);
  }

  function scheduleGrow(speechWrap, { skipDelay = false } = {}) {
    if (!speechWrap) return;

    clearGrowTimers();
    speechWrap.classList.remove("is-settled", "is-growing", "is-animating", "is-goo-on");
    speechWrap.classList.add("is-grow-pending");

    const delay = skipDelay ? 0 : GROW_DELAY_MS;
    growDelayTimer = setTimeout(() => {
      growDelayTimer = null;
      startGrow(speechWrap);
    }, delay);
  }

  function shouldAnimate() {
    if (root.classList.contains("force-motion")) return true;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function bindHeroImg() {
    if (!heroImg) return;
    heroImg.addEventListener("error", () => {
      heroImg.classList.add("hero-logo--missing");
    });
    heroImg.addEventListener("load", () => {
      heroImg.classList.remove("hero-logo--missing");
    });
  }

  function init(replay) {
    if (!wrap) {
      wrap = document.getElementById("speech-wrap");
    }
    if (!wrap) return;

    bindHeroImg();

    const bubble = wrap.querySelector(".speech-bubble");
    if (bubble) {
      syncSpeechFrame(bubble);
    }

    if (shouldAnimate() && (replay || !wrap.dataset.growPlayed)) {
      wrap.dataset.growPlayed = "1";
      scheduleGrow(wrap, { skipDelay: replay });
    } else {
      finishGrow(wrap);
    }
  }

  function scheduleInit(replay) {
    requestAnimationFrame(() => requestAnimationFrame(() => init(replay)));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scheduleInit(false), { once: true });
  } else {
    scheduleInit(false);
  }

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      delete wrap?.dataset.growPlayed;
      scheduleInit(true);
    }
  });
})();
