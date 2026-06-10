/**
 * Animated landing hero — jello mascot + elastic speech bubble (GSAP + WebGL).
 *
 * Supersedes js/landing-hero.js (kept on disk; swap the script tags in
 * index.html to revert). Same toggles as before:
 *   - Set data-hero-bubble="off" on <html>, or open ?hero=static
 *   - Preview with OS "reduce motion" on: ?hero=motion
 *
 * What it does:
 *   - Replaces the hero <img> with a WebGL canvas: dragging the cursor
 *     through the mascot warps it like jello (spring physics, snaps back).
 *     No WebGL -> the <img> stays and only the intro/bubble animate.
 *   - Intro: mascot pops up (back ease), bubble springs out (elastic ease),
 *     text fades in. Played at 0.5x speed (approved tuning).
 *   - Settled bubble re-uses the existing CSS (.is-settled frame + pulse).
 *
 * Approved tuning (demo/hero-combined.html):
 *   speed 0.50x, poke radius 0.24, push strength 1.1, wobbliness 0.80
 */
(function () {
  "use strict";

  /* ---- Approved tuning ---- */
  const INTRO_SPEED = 0.5;
  const JELLO_RADIUS = 0.24;
  const JELLO_STRENGTH = 1.1;
  const JELLO_WOBBLINESS = 0.8;

  const TAIL_NOTCH_HALF = 11;
  const TAIL_TIP_X = -12.25;
  const TAIL_FRAME_PAD = 14;

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
  if (root.dataset.heroBubble === "off" || !window.gsap) {
    return;
  }

  root.classList.add("hero-anim-js");

  function shouldAnimate() {
    if (root.classList.contains("force-motion")) return true;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* =====================================================================
     Speech-frame sync (unchanged from js/landing-hero.js)
     ===================================================================== */

  function parsePx(val) {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : 0;
  }

  function tailYpx() {
    const wrapEl = document.querySelector(".hero-mascot-wrap");
    const raw = wrapEl
      ? getComputedStyle(wrapEl).getPropertyValue("--tail-y").trim()
      : "46px";
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 46;
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
    const d = speechFramePathD(w, h, r, tailYpx());

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

  /* =====================================================================
     Jello mascot (WebGL) — from demo/hero-jello.js
     ===================================================================== */

  const VERT = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  const FRAG = `
    precision mediump float;
    varying vec2 v_uv;
    uniform sampler2D u_tex;
    uniform vec2 u_mouse;
    uniform vec2 u_force;
    uniform float u_radius;
    uniform float u_wobble;
    uniform float u_time;
    uniform float u_aspect;

    void main() {
      vec2 d = v_uv - u_mouse;
      d.x *= u_aspect;
      float dist = length(d);
      float infl = exp(-(dist * dist) / (u_radius * u_radius));
      vec2 offset = u_force * infl;
      offset += normalize(d + 1e-5) * 0.014 * u_wobble *
                sin(dist * 42.0 - u_time * 11.0) * infl;
      vec4 c = texture2D(u_tex, clamp(v_uv - offset, 0.002, 0.998));
      gl_FragColor = c;
    }
  `;

  const STIFFNESS = 130;
  const MAX_PUSH = 0.22;

  const mouse = { x: 0.5, y: 0.5 };
  const pointer = { x: 0.5, y: 0.5, vx: 0, vy: 0, lastT: 0, active: false };
  const force = { x: 0, y: 0, vx: 0, vy: 0 };

  let jello = null; // { canvas, gl, U, resize }

  function jelloPoke() {
    if (!jello) return;
    mouse.x = pointer.x = 0.35 + Math.random() * 0.3;
    mouse.y = pointer.y = 0.35 + Math.random() * 0.3;
    const a = Math.random() * Math.PI * 2;
    force.vx += Math.cos(a) * 1.4;
    force.vy += Math.sin(a) * 1.4;
  }

  function initJello(img) {
    if (!shouldAnimate()) return null;

    const canvas = document.createElement("canvas");
    canvas.className = "hero-jello-canvas";
    canvas.setAttribute("aria-hidden", "true");

    const gl =
      canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true }) ||
      canvas.getContext("experimental-webgl", { alpha: true, premultipliedAlpha: true });
    if (!gl) return null;

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
      return sh;
    }

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const U = {
      mouse: gl.getUniformLocation(prog, "u_mouse"),
      force: gl.getUniformLocation(prog, "u_force"),
      radius: gl.getUniformLocation(prog, "u_radius"),
      wobble: gl.getUniformLocation(prog, "u_wobble"),
      time: gl.getUniformLocation(prog, "u_time"),
      aspect: gl.getUniformLocation(prog, "u_aspect"),
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    let texAspect = 819 / 1024;

    function resize() {
      const w = canvas.clientWidth || 192;
      const h = canvas.clientHeight || Math.round(w / texAspect);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        gl.viewport(0, 0, pw, ph);
      }
    }

    const state = { canvas, gl, U, resize, ready: false };

    const texImg = new Image();
    texImg.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texImg);
      texAspect = texImg.naturalWidth / texImg.naturalHeight;
      canvas.style.aspectRatio = `${texImg.naturalWidth} / ${texImg.naturalHeight}`;
      // Swap the <img> for the canvas only once we can actually draw
      img.classList.add("hero-logo--jello");
      img.insertAdjacentElement("afterend", canvas);
      state.ready = true;
      resize();
    };
    texImg.src = img.currentSrc || img.src;

    function uvFromEvent(e) {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) / r.width,
        y: 1 - (e.clientY - r.top) / r.height,
      };
    }

    function feedPointer(uv, now) {
      const dt = Math.max(now - pointer.lastT, 4) / 1000;
      pointer.vx = (uv.x - pointer.x) / dt;
      pointer.vy = (uv.y - pointer.y) / dt;
      pointer.x = uv.x;
      pointer.y = uv.y;
      pointer.lastT = now;
      pointer.active = true;
    }

    canvas.addEventListener("pointermove", (e) =>
      feedPointer(uvFromEvent(e), performance.now())
    );
    canvas.addEventListener("pointerleave", () => {
      pointer.active = false;
    });

    window.addEventListener("resize", resize);

    gsap.ticker.add(() => {
      const now = performance.now();
      const dt = Math.min(gsap.ticker.deltaRatio(60) / 60, 1 / 30);

      let tx = 0;
      let ty = 0;
      const moving = pointer.active && now - pointer.lastT < 90;
      if (moving) {
        tx = pointer.vx * 0.045 * JELLO_STRENGTH;
        ty = pointer.vy * 0.045 * JELLO_STRENGTH;
        const len = Math.hypot(tx, ty);
        if (len > MAX_PUSH) {
          tx = (tx / len) * MAX_PUSH;
          ty = (ty / len) * MAX_PUSH;
        }
      }

      const damp = 16 - JELLO_WOBBLINESS * 11.5;
      force.vx += (STIFFNESS * (tx - force.x) - damp * force.vx) * dt;
      force.vy += (STIFFNESS * (ty - force.y) - damp * force.vy) * dt;
      force.x += force.vx * dt;
      force.y += force.vy * dt;

      mouse.x += (pointer.x - mouse.x) * 0.35;
      mouse.y += (pointer.y - mouse.y) * 0.35;

      if (!state.ready) return;
      resize();

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.mouse, mouse.x, mouse.y);
      gl.uniform2f(U.force, force.x, force.y);
      gl.uniform1f(U.radius, JELLO_RADIUS);
      gl.uniform1f(U.wobble, Math.min(Math.hypot(force.vx, force.vy) * 1.3, 1));
      gl.uniform1f(U.time, now / 1000);
      gl.uniform1f(U.aspect, canvas.width / canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });

    return state;
  }

  /* =====================================================================
     Intro + settle choreography (GSAP, elastic-pop variant @ 0.5x)
     ===================================================================== */

  const TAIL_ORIGIN_CSS = () => `left ${tailYpx()}px`;

  let master = null;
  let idleTweens = [];

  function mascotEl() {
    return (jello && jello.ready && jello.canvas) || document.getElementById("hero-logo");
  }

  function finishGrow(wrap) {
    if (!wrap) return;
    const bubble = wrap.querySelector(".speech-bubble");
    const line = wrap.querySelector(".speech-line");

    wrap.classList.remove("is-growing", "is-animating", "is-goo-on", "is-grow-pending");
    wrap.classList.add("is-settled");

    if (bubble) gsap.set(bubble, { clearProps: "all" });
    if (line) gsap.set(line, { clearProps: "all" });

    if (bubble) {
      requestAnimationFrame(() => {
        syncSpeechFrame(bubble);
        observeSpeechBubble(bubble);
      });
    }
  }

  function startIdle() {
    // Bubble pulse comes from CSS (.is-settled). Add a gentle breathe on the
    // mascot canvas/img to match the approved combined demo.
    idleTweens.push(
      gsap.to(mascotEl(), {
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

  function playIntro(wrap) {
    const bubble = wrap.querySelector(".speech-bubble");
    const line = wrap.querySelector(".speech-line");
    const mascot = mascotEl();
    if (!bubble || !mascot) {
      finishGrow(wrap);
      return;
    }

    master?.kill();
    idleTweens.forEach((t) => t.kill());
    idleTweens = [];
    gsap.set([mascot, bubble, line], { clearProps: "all" });

    wrap.classList.remove("is-settled", "is-growing", "is-animating", "is-goo-on");
    wrap.classList.add("is-grow-pending");

    master = gsap.timeline({ onComplete: () => {
      finishGrow(wrap);
      startIdle();
    } });

    master.set(line, { autoAlpha: 0 }, 0);

    // Mascot pops up
    master.from(mascot, {
      y: 36,
      scale: 0.7,
      autoAlpha: 0,
      transformOrigin: "50% 100%",
      duration: 0.7,
      ease: "back.out(1.7)",
    });

    // Bubble springs out, elastic
    master.call(
      () => {
        wrap.classList.remove("is-grow-pending");
        wrap.classList.add("is-growing", "is-animating");
      },
      null,
      "-=0.15"
    );
    master.set(
      bubble,
      { scaleX: 0.1, scaleY: 0.1, transformOrigin: TAIL_ORIGIN_CSS() },
      "-=0.15"
    );
    master.to(
      bubble,
      { scaleX: 1, scaleY: 1, duration: 1.15, ease: "elastic.out(1, 0.45)" },
      "<"
    );

    // The pop knocks the jello loose for a beat
    master.add(jelloPoke, 0.55);

    // Text fades in while the bubble finishes wobbling
    master.to(line, { autoAlpha: 1, duration: 0.7, ease: "power1.out" }, "-=0.55");

    master.timeScale(INTRO_SPEED);
  }

  /* =====================================================================
     Boot
     ===================================================================== */

  let started = false;

  function init(replay) {
    const wrap = document.getElementById("speech-wrap");
    const img = document.getElementById("hero-logo");
    if (!wrap || !img) return;

    if (!shouldAnimate()) {
      finishGrow(wrap);
      return;
    }

    if (!jello) {
      jello = initJello(img);
    }

    if (!replay && started) return;
    started = true;

    // Give the texture a moment to swap in the canvas; the intro works on
    // either the canvas or the fallback <img>.
    requestAnimationFrame(() => requestAnimationFrame(() => playIntro(wrap)));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init(false), { once: true });
  } else {
    init(false);
  }

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      init(true);
    }
  });
})();
