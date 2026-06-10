/**
 * Hero animation lab — blob & deform.
 *
 * Two velocity-driven deformations for the mascot PNG:
 *
 *  - "jelly": scroll velocity -> squash & stretch transforms; an elastic.out
 *    tween snaps it back into shape when scrolling stops. Hover/tap/poke
 *    plays the same wobble.
 *  - "goo":   scroll velocity -> feDisplacementMap scale (SVG filter), with
 *    slowly drifting feTurbulence so the warp feels organic, not static.
 *
 * Demo only; the live landing page is unchanged.
 */
(function () {
  "use strict";

  const warn = document.getElementById("demo-warn");
  if (location.protocol === "file:" || !window.gsap) {
    if (warn) warn.hidden = false;
    if (!window.gsap) return;
  }

  const mascot = document.getElementById("hero-logo");
  const turb = document.querySelector("#blob-warp feTurbulence");
  const disp = document.querySelector("#blob-warp feDisplacementMap");

  let mode = "jelly"; // jelly | goo | both
  let intensity = 1;

  /* ---- Scroll velocity tracking --------------------------------------- */

  let lastY = window.scrollY;
  let lastT = performance.now();
  let velocity = 0; // px/s, signed (positive = scrolling down)

  window.addEventListener(
    "scroll",
    () => {
      const now = performance.now();
      const dt = Math.max(now - lastT, 1) / 1000;
      velocity = (window.scrollY - lastY) / dt;
      lastY = window.scrollY;
      lastT = now;
    },
    { passive: true }
  );

  /* ---- Jelly (squash & stretch) ---------------------------------------- */

  const MAX_STRETCH = 0.32;
  let jellyActive = false; // currently writing transforms from the ticker
  let snapTween = null;
  let wobbleTl = null;

  function killSnap() {
    snapTween?.kill();
    snapTween = null;
  }

  function applyJelly(stretch) {
    // Stretch along the scroll axis, thin out sideways, slight lag offset.
    gsap.set(mascot, {
      transformOrigin: "50% 100%",
      scaleY: 1 + stretch,
      scaleX: 1 - stretch * 0.55,
      y: -stretch * 26,
    });
  }

  function snapBack() {
    killSnap();
    snapTween = gsap.to(mascot, {
      scaleX: 1,
      scaleY: 1,
      y: 0,
      duration: 1.1,
      ease: "elastic.out(1, 0.22)",
    });
  }

  function wobble() {
    if (wobbleTl?.isActive()) return;
    killSnap();
    jellyActive = false;
    const s = 0.16 * intensity;
    wobbleTl = gsap
      .timeline()
      .to(mascot, {
        scaleX: 1 + s,
        scaleY: 1 - s * 0.85,
        transformOrigin: "50% 100%",
        duration: 0.12,
        ease: "power2.out",
      })
      .to(mascot, {
        scaleX: 1,
        scaleY: 1,
        duration: 1.5,
        ease: "elastic.out(1, 0.16)",
      });

    if (mode !== "jelly") {
      // Give the goo filter a kick too
      gsap.to(goo, { kick: 28 * intensity, duration: 0.12, ease: "power2.out" });
      gsap.to(goo, { kick: 0, duration: 1.6, ease: "elastic.out(1, 0.3)", delay: 0.12 });
    }
  }

  /* ---- Goo warp (SVG filter) -------------------------------------------- */

  const goo = { scale: 0, kick: 0 };
  let filterOn = false;

  function setFilter(on) {
    if (on === filterOn) return;
    filterOn = on;
    mascot.style.filter = on ? "url(#blob-warp)" : "";
  }

  /* ---- Main ticker --------------------------------------------------------- */

  gsap.ticker.add(() => {
    const t = gsap.ticker.time;

    // Scroll events stop firing the instant scrolling stops; decay manually.
    velocity *= 0.88;
    if (Math.abs(velocity) < 4) velocity = 0;

    const speed = Math.min(Math.abs(velocity) / 2600, 1); // 0..1

    // Jelly: write transforms while moving, elastic snap-back when stopped
    if ((mode === "jelly" || mode === "both") && !wobbleTl?.isActive()) {
      const stretch = speed * MAX_STRETCH * intensity;
      if (stretch > 0.004) {
        killSnap();
        jellyActive = true;
        applyJelly(stretch);
      } else if (jellyActive) {
        jellyActive = false;
        snapBack();
      }
    }

    // Goo: displacement scale follows velocity (+ any wobble kick)
    if (mode === "goo" || mode === "both") {
      const target = speed * 55 * intensity;
      goo.scale += (target - goo.scale) * 0.14;
      const total = goo.scale + goo.kick;
      if (total > 0.5) {
        setFilter(true);
        disp.setAttribute("scale", total.toFixed(2));
        // Drift the noise so the warp ripples instead of holding one shape
        turb.setAttribute(
          "baseFrequency",
          `${(0.012 + 0.004 * Math.sin(t * 1.3)).toFixed(4)} ${(0.018 + 0.005 * Math.cos(t * 0.9)).toFixed(4)}`
        );
      } else {
        setFilter(false); // keep the PNG crisp at rest
      }
    } else {
      setFilter(false);
    }
  });

  /* ---- Triggers --------------------------------------------------------------- */

  mascot.addEventListener("pointerenter", wobble);
  mascot.addEventListener("pointerdown", wobble);
  document.getElementById("poke-btn").addEventListener("click", wobble);

  /* ---- Controls ------------------------------------------------------------------ */

  document.getElementById("mode-row").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    mode = btn.dataset.mode;
    document
      .querySelectorAll("#mode-row button")
      .forEach((b) => b.classList.toggle("is-active", b === btn));
    if (mode === "goo") {
      killSnap();
      gsap.set(mascot, { clearProps: "transform" });
      jellyActive = false;
    }
  });

  const intensityInput = document.getElementById("intensity");
  const intensityOut = document.getElementById("intensity-out");
  intensityInput.addEventListener("input", () => {
    intensity = parseFloat(intensityInput.value);
    intensityOut.textContent = intensity.toFixed(1);
  });
})();
