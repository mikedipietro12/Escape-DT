/**
 * Hero animation lab — GSAP variants.
 *
 * Demo only. Each intro is a single gsap.timeline(); after it completes,
 * idle "breathing" loops start (equivalent of the live hero-bubble-pulse).
 *
 * Reference for the shipped animation: js/landing-hero.js (Web Animations API).
 */
(function () {
  "use strict";

  const warn = document.getElementById("demo-warn");
  if (location.protocol === "file:" || !window.gsap) {
    if (warn) warn.hidden = false;
    if (!window.gsap) return;
  }

  gsap.registerPlugin(CustomEase, SplitText);

  // Same cubic-bezier as GROW_EASING in js/landing-hero.js
  CustomEase.create("heroGrow", "0.22,0.85,0.25,1");

  const SEASONS = {
    winter: { img: "/assets/hero/shy-winter.png", top: "#ffffff", bottom: "#8edcee" },
    spring: { img: "/assets/hero/shy-spring.png", top: "#b2fdb5", bottom: "#ffeea1" },
    summer: { img: "/assets/hero/shy-summer.png", top: "#ffeea1", bottom: "#ffaf64" },
    fall: { img: "/assets/hero/shy-fall.png", top: "#ffeea1", bottom: "#fd696c" },
  };

  const mascot = document.getElementById("hero-logo");
  const bubble = document.getElementById("speech-bubble");
  const skin = document.getElementById("speech-skin");
  const line = document.getElementById("speech-line");

  const TAIL_ORIGIN = "left 46px";

  let master = null;
  let idleTweens = [];
  let split = null;
  let currentVariant = "current";
  let speed = 1;

  function startIdle() {
    idleTweens.push(
      gsap.to(bubble, {
        scaleX: 1.019,
        scaleY: 1.015,
        transformOrigin: TAIL_ORIGIN,
        duration: 2.35,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      }),
      gsap.to(mascot, {
        scaleY: 1.012,
        scaleX: 1.004,
        transformOrigin: "50% 100%",
        duration: 2.8,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      })
    );
  }

  function resetAll() {
    master?.kill();
    master = null;
    idleTweens.forEach((t) => t.kill());
    idleTweens = [];
    split?.revert();
    split = null;
    gsap.set([mascot, bubble, skin, line], { clearProps: "all" });
  }

  /* ---- Variants ------------------------------------------------------ */

  // 1:1 recreation of the shipped Web Animations grow (see js/landing-hero.js):
  // 1.2s delay, 2.4s grow from scale(0.2, 0.8) with blob border-radius,
  // overshoot 1.06 at 92%, text fade from 67%.
  function variantCurrent() {
    const tl = gsap.timeline();
    tl.set(bubble, { autoAlpha: 0, transformOrigin: TAIL_ORIGIN }, 0);
    tl.set(line, { autoAlpha: 0 }, 0);
    tl.set(skin, { borderRadius: "50% 50% 48% 52% / 54% 46% 50% 50%" }, 0);

    tl.set(bubble, { autoAlpha: 1, scaleX: 0.2, scaleY: 0.8 }, 1.2);
    tl.to(
      bubble,
      {
        keyframes: {
          "92%": { scaleX: 1.06, scaleY: 1.054 },
          "100%": { scaleX: 1, scaleY: 1 },
          easeEach: "none",
        },
        duration: 2.4,
        ease: "heroGrow",
      },
      1.2
    );
    tl.to(skin, { borderRadius: "1.15rem", duration: 2.4, ease: "heroGrow" }, 1.2);
    tl.to(line, { autoAlpha: 1, duration: 0.8, ease: "power1.out" }, 1.2 + 2.4 * 0.67);
    return tl;
  }

  // Mascot pops up first, bubble springs out with an elastic ease,
  // text simply fades in once the bubble has mostly settled.
  function variantElastic() {
    const tl = gsap.timeline();
    tl.set(bubble, { autoAlpha: 0, transformOrigin: TAIL_ORIGIN }, 0);
    tl.set(line, { autoAlpha: 0 }, 0);

    tl.from(mascot, {
      y: 36,
      scale: 0.7,
      autoAlpha: 0,
      transformOrigin: "50% 100%",
      duration: 0.7,
      ease: "back.out(1.7)",
    });
    tl.set(bubble, { autoAlpha: 1, scaleX: 0.1, scaleY: 0.1 }, "-=0.15");
    tl.to(
      bubble,
      { scaleX: 1, scaleY: 1, duration: 1.15, ease: "elastic.out(1, 0.45)" },
      "<"
    );
    tl.to(line, { autoAlpha: 1, duration: 0.7, ease: "power1.out" }, "-=0.55");
    return tl;
  }

  // Quick bubble pop, then characters type on. Mascot leans in slightly
  // while "speaking", then settles.
  function variantTypewriter() {
    split = new SplitText(line, { type: "words,chars" });
    const tl = gsap.timeline();
    tl.set(bubble, { autoAlpha: 0, transformOrigin: TAIL_ORIGIN }, 0);
    tl.set(split.chars, { autoAlpha: 0 }, 0);

    tl.set(bubble, { autoAlpha: 1, scaleX: 0.3, scaleY: 0.3 }, 0.5);
    tl.to(bubble, { scaleX: 1, scaleY: 1, duration: 0.5, ease: "back.out(1.6)" }, 0.5);
    tl.to(
      mascot,
      { rotation: 2.5, transformOrigin: "50% 100%", duration: 0.4, ease: "power1.out" },
      0.6
    );
    const typing = gsap.to(split.chars, {
      autoAlpha: 1,
      duration: 0.01,
      stagger: 0.011,
      ease: "none",
    });
    tl.add(typing, 1.0);
    tl.to(mascot, { rotation: 0, duration: 0.6, ease: "power1.inOut" }, ">-0.3");
    return tl;
  }

  // Mascot drops in with a bounce + squash-and-stretch landing,
  // bubble inflates with a wobble, text rises in.
  function variantBounce() {
    const tl = gsap.timeline();
    tl.set(bubble, { autoAlpha: 0, transformOrigin: TAIL_ORIGIN, rotation: -6 }, 0);
    tl.set(line, { autoAlpha: 0 }, 0);

    tl.from(mascot, { y: -280, duration: 0.9, ease: "bounce.out" });
    tl.to(
      mascot,
      { scaleY: 0.92, scaleX: 1.06, transformOrigin: "50% 100%", duration: 0.1 },
      "-=0.45"
    );
    tl.to(mascot, { scaleY: 1, scaleX: 1, duration: 0.35, ease: "back.out(3)" });

    tl.set(bubble, { autoAlpha: 1, scaleX: 0, scaleY: 0 }, "-=0.2");
    tl.to(
      bubble,
      {
        keyframes: [
          { scaleX: 1.1, scaleY: 1.1, rotation: 2, duration: 0.32, ease: "power2.out" },
          { scaleX: 0.97, scaleY: 0.97, rotation: -1, duration: 0.18, ease: "none" },
          { scaleX: 1, scaleY: 1, rotation: 0, duration: 0.28, ease: "power1.out" },
        ],
      },
      "<"
    );
    tl.to(line, { autoAlpha: 1, y: 0, startAt: { y: 8 }, duration: 0.45 }, "-=0.25");
    return tl;
  }

  const VARIANTS = {
    current: variantCurrent,
    elastic: variantElastic,
    typewriter: variantTypewriter,
    bounce: variantBounce,
  };

  /* ---- Playback / controls ------------------------------------------- */

  function play() {
    resetAll();
    master = VARIANTS[currentVariant]();
    master.timeScale(speed);
    master.eventCallback("onComplete", startIdle);
  }

  document.getElementById("variant-row").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-variant]");
    if (!btn) return;
    currentVariant = btn.dataset.variant;
    document
      .querySelectorAll("#variant-row button")
      .forEach((b) => b.classList.toggle("is-active", b === btn));
    play();
  });

  document.getElementById("replay-btn").addEventListener("click", play);

  const speedInput = document.getElementById("speed");
  const speedOut = document.getElementById("speed-out");
  speedInput.addEventListener("input", () => {
    speed = parseFloat(speedInput.value);
    speedOut.textContent = speed.toFixed(2) + "\u00d7";
    master?.timeScale(speed);
  });

  function applySeason(key) {
    const s = SEASONS[key];
    if (!s) return;
    mascot.src = s.img;
    document.documentElement.style.setProperty("--bg-top", s.top);
    document.documentElement.style.setProperty("--bg-bottom", s.bottom);
  }

  document.getElementById("season-row").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-season]");
    if (!btn) return;
    document
      .querySelectorAll("#season-row button")
      .forEach((b) => b.classList.toggle("is-active", b === btn));
    applySeason(btn.dataset.season);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", play, { once: true });
  } else {
    play();
  }
})();
