/**
 * Hero animation lab — jello poke-through.
 *
 * The mascot PNG is rendered on a raw WebGL canvas. A fragment shader
 * displaces pixels radially around the cursor; the push vector is driven by
 * a spring-damper simulation in JS (via gsap.ticker), so the dent left by
 * the cursor oscillates back to rest like jello.
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

  const SEASONS = {
    winter: { img: "/assets/hero/shy-winter.png", top: "#ffffff", bottom: "#8edcee" },
    spring: { img: "/assets/hero/shy-spring.png", top: "#b2fdb5", bottom: "#ffeea1" },
    summer: { img: "/assets/hero/shy-summer.png", top: "#ffeea1", bottom: "#ffaf64" },
    fall: { img: "/assets/hero/shy-fall.png", top: "#ffeea1", bottom: "#fd696c" },
  };

  const canvas = document.getElementById("jello-canvas");
  const gl =
    canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true }) ||
    canvas.getContext("experimental-webgl", { alpha: true, premultipliedAlpha: true });

  if (!gl) {
    document.getElementById("webgl-fail").hidden = false;
    canvas.hidden = true;
    return;
  }

  /* ---- Shaders ---------------------------------------------------------- */

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
    uniform vec2 u_mouse;   // uv space, y up
    uniform vec2 u_force;   // uv-space push vector
    uniform float u_radius; // influence radius in uv units
    uniform float u_wobble; // residual spring energy, 0..1
    uniform float u_time;
    uniform float u_aspect; // canvas width / height

    void main() {
      vec2 d = v_uv - u_mouse;
      d.x *= u_aspect; // keep the poke circular on a non-square canvas
      float dist = length(d);
      float infl = exp(-(dist * dist) / (u_radius * u_radius));

      // Main displacement: pixels shoved along the push vector near the cursor
      vec2 offset = u_force * infl;

      // Secondary ripple ring while the spring still has energy
      offset += normalize(d + 1e-5) * 0.014 * u_wobble *
                sin(dist * 42.0 - u_time * 11.0) * infl;

      vec4 c = texture2D(u_tex, clamp(v_uv - offset, 0.002, 0.998));
      gl_FragColor = c;
    }
  `;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
    }
    return sh;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
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

  /* ---- Texture ------------------------------------------------------------ */

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // NPOT-safe settings (mascot PNGs are 360x360)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  let texReady = false;
  let texAspect = 819 / 1024; // hero PNGs; re-synced from the loaded image

  function loadTexture(url) {
    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      texAspect = img.naturalWidth / img.naturalHeight;
      canvas.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
      texReady = true;
      resize();
    };
    img.src = url;
  }
  loadTexture(SEASONS.spring.img);

  /* ---- Sizing -------------------------------------------------------------- */

  // Buffer matches the canvas's CSS box, which follows the texture's
  // aspect ratio — so the PNG is never stretched or squashed.
  function resize() {
    const w = canvas.clientWidth || 240;
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
  resize();
  window.addEventListener("resize", resize);

  /* ---- Spring physics --------------------------------------------------------- */

  const STIFFNESS = 130;
  const MAX_PUSH = 0.22;

  let radius = 0.26;
  let strength = 1.3;
  let wobbliness = 0.6;

  const mouse = { x: 0.5, y: 0.5 }; // displayed (smoothed) poke centre
  const pointer = { x: 0.5, y: 0.5, vx: 0, vy: 0, lastT: 0, active: false };
  const force = { x: 0, y: 0, vx: 0, vy: 0 };

  function damping() {
    // wobbliness 0 -> stiff and quick (16), 1 -> long jiggle (4.5)
    return 16 - wobbliness * 11.5;
  }

  function uvFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: 1 - (e.clientY - r.top) / r.height, // y up, matching flipped texture
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

  canvas.addEventListener("pointermove", (e) => feedPointer(uvFromEvent(e), performance.now()));
  canvas.addEventListener("pointerdown", (e) => {
    feedPointer(uvFromEvent(e), performance.now());
    // A press is a little jab even without movement
    force.vx += (Math.random() - 0.5) * 0.6;
    force.vy -= 0.9;
  });
  canvas.addEventListener("pointerleave", () => {
    pointer.active = false;
  });

  /* ---- Programmatic gestures ----------------------------------------------------- */

  // Straight-ish swipe through the middle, like a finger dragged across
  function swirl() {
    const g = { t: 0 };
    gsap.to(g, {
      t: 1,
      duration: 1.1,
      ease: "power1.inOut",
      onUpdate() {
        feedPointer(
          { x: 0.08 + g.t * 0.84, y: 0.5 + 0.22 * Math.sin(g.t * Math.PI * 2) },
          performance.now()
        );
      },
      onComplete() {
        pointer.active = false;
      },
    });
  }

  function poke() {
    mouse.x = pointer.x = 0.35 + Math.random() * 0.3;
    mouse.y = pointer.y = 0.35 + Math.random() * 0.3;
    const a = Math.random() * Math.PI * 2;
    force.vx += Math.cos(a) * 1.4;
    force.vy += Math.sin(a) * 1.4;
  }

  document.getElementById("poke-btn").addEventListener("click", poke);
  document.getElementById("swirl-btn").addEventListener("click", swirl);

  /* ---- Main loop --------------------------------------------------------------------- */

  gsap.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(gsap.ticker.deltaRatio(60) / 60, 1 / 30);

    // Target push: cursor velocity shoves the pixels while it's moving through
    let tx = 0;
    let ty = 0;
    const moving = pointer.active && now - pointer.lastT < 90;
    if (moving) {
      tx = pointer.vx * 0.045 * strength;
      ty = pointer.vy * 0.045 * strength;
      const len = Math.hypot(tx, ty);
      if (len > MAX_PUSH) {
        tx = (tx / len) * MAX_PUSH;
        ty = (ty / len) * MAX_PUSH;
      }
    }

    // Spring-damper: oscillates back to rest when the cursor stops or leaves
    const damp = damping();
    force.vx += (STIFFNESS * (tx - force.x) - damp * force.vx) * dt;
    force.vy += (STIFFNESS * (ty - force.y) - damp * force.vy) * dt;
    force.x += force.vx * dt;
    force.y += force.vy * dt;

    // Smoothly track the poke centre to the cursor's last known position
    mouse.x += (pointer.x - mouse.x) * 0.35;
    mouse.y += (pointer.y - mouse.y) * 0.35;

    if (!texReady) return;
    resize();

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.mouse, mouse.x, mouse.y);
    gl.uniform2f(U.force, force.x, force.y);
    gl.uniform1f(U.radius, radius);
    gl.uniform1f(
      U.wobble,
      Math.min(Math.hypot(force.vx, force.vy) * 1.3, 1)
    );
    gl.uniform1f(U.time, now / 1000);
    gl.uniform1f(U.aspect, canvas.width / canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  });

  /* ---- Controls ------------------------------------------------------------------------- */

  function bindSlider(id, apply, fmt) {
    const input = document.getElementById(id);
    const out = document.getElementById(id + "-out");
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      apply(v);
      out.textContent = fmt(v);
    });
  }

  bindSlider("radius", (v) => (radius = v), (v) => v.toFixed(2));
  bindSlider("strength", (v) => (strength = v), (v) => v.toFixed(1));
  bindSlider("wobbliness", (v) => (wobbliness = v), (v) => v.toFixed(2));

  document.getElementById("season-row").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-season]");
    if (!btn) return;
    const s = SEASONS[btn.dataset.season];
    document
      .querySelectorAll("#season-row button")
      .forEach((b) => b.classList.toggle("is-active", b === btn));
    document.documentElement.style.setProperty("--bg-top", s.top);
    document.documentElement.style.setProperty("--bg-bottom", s.bottom);
    loadTexture(s.img);
  });
})();
