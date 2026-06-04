/**
 * Animated landing hero (mascot + speech bubble).
 *
 * Revert without deleting files:
 *   - Set data-hero-bubble="off" on <html>, or open ?hero=static
 *
 * Preview grow animation when OS "reduce motion" is on: ?hero=motion
 *
 * Full removal: remove this script and css/landing-hero.css from index.html
 * and restore the static <img class="hero-logo"> block (see index.html comment).
 */
(function () {
  const GROW_MS = 1400;
  const TAIL_NOTCH_HALF = 11;
  const TAIL_TIP_X = -12.25;
  const TAIL_FRAME_PAD = 14;
  const BUBBLE_BG_OPACITY = 0.15;

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

  const heroImg = document.getElementById("hero-logo");
  const wrap = document.getElementById("speech-wrap");

  let settleTimer = null;

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
  }

  function finishGrow(speechWrap) {
    if (!speechWrap) return;
    speechWrap.classList.remove("is-animating", "is-goo-on");
    speechWrap.classList.add("is-settled");
    const bubble = speechWrap.querySelector(".speech-bubble");
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

  function startGrow(speechWrap) {
    if (!speechWrap) return;
    clearGrowTimers();

    const bubble = speechWrap.querySelector(".speech-bubble");
    const line = speechWrap.querySelector(".speech-line");
    if (!bubble) return;

    speechWrap.classList.remove("is-settled", "is-animating", "is-goo-on");
    resetGrowAnimation(bubble);
    resetPseudoAnimations(bubble);
    if (line) {
      line.style.animation = "none";
      line.style.opacity = "0";
      void line.offsetWidth;
      line.style.removeProperty("animation");
      line.style.removeProperty("opacity");
    }

    void speechWrap.offsetWidth;
    speechWrap.classList.add("is-animating");
    speechWrap.classList.toggle("is-goo-on", BUBBLE_BG_OPACITY >= 0.99);

    bubble.removeEventListener("animationend", onBubbleGrowEnd);
    bubble.addEventListener("animationend", onBubbleGrowEnd);

    settleTimer = setTimeout(() => finishGrow(speechWrap), GROW_MS);
  }

  function onBubbleGrowEnd(e) {
    if (e.animationName !== "bubble-lava-grow") return;
    clearGrowTimers();
    finishGrow(e.target.closest(".speech-bubble-wrap"));
  }

  function shouldAnimate() {
    if (root.classList.contains("force-motion")) return true;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function init() {
    const bubbleEl = document.querySelector(".speech-bubble");
    if (bubbleEl) {
      observeSpeechBubble(bubbleEl);
    }

    if (wrap) {
      if (shouldAnimate()) {
        startGrow(wrap);
      } else {
        finishGrow(wrap);
      }
    }

    if (heroImg) {
      heroImg.addEventListener("error", () => {
        heroImg.classList.add("hero-logo--missing");
      });
      heroImg.addEventListener("load", () => {
        heroImg.classList.remove("hero-logo--missing");
      });
    }
  }

  function scheduleInit() {
    requestAnimationFrame(() => requestAnimationFrame(init));
  }

  if (wrap) {
    scheduleInit();
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleInit);
  } else {
    scheduleInit();
  }
})();
