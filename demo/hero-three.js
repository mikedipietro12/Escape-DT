/**
 * Hero animation lab — three.js + GSAP hybrid.
 *
 * Two small WebGL scenes:
 *   1. #mascot-canvas — the mascot PNG on a plane, with pointer parallax tilt.
 *      GSAP runs the intro (scale pop) and the idle float by tweening
 *      mesh.scale / mesh.position directly.
 *   2. #particle-canvas — full-viewport seasonal particle field
 *      (snow / petals / motes / leaves), updated on the CPU each frame.
 *
 * The speech bubble stays in the DOM and is animated with GSAP.
 */
import * as THREE from "three";

const warn = document.getElementById("demo-warn");
if (location.protocol === "file:" || !window.gsap) {
  if (warn) warn.hidden = false;
}

const SEASONS = {
  winter: {
    img: "/assets/hero/shy-winter.png",
    top: "#ffffff",
    bottom: "#8edcee",
    particle: { color: "#ffffff", size: 14, fall: 28, sway: 18, drift: 0, opacity: 0.95 },
  },
  spring: {
    img: "/assets/hero/shy-spring.png",
    top: "#b2fdb5",
    bottom: "#ffeea1",
    particle: { color: "#ffb7d5", size: 11, fall: 22, sway: 34, drift: 6, opacity: 0.9 },
  },
  summer: {
    img: "/assets/hero/shy-summer.png",
    top: "#ffeea1",
    bottom: "#ffaf64",
    particle: { color: "#ffd76e", size: 9, fall: -10, sway: 22, drift: 4, opacity: 0.75 },
  },
  fall: {
    img: "/assets/hero/shy-fall.png",
    top: "#ffeea1",
    bottom: "#fd696c",
    particle: { color: "#ff8c3b", size: 13, fall: 42, sway: 46, drift: 10, opacity: 0.9 },
  },
};

let season = SEASONS.spring;

/* ---- Mascot scene ----------------------------------------------------- */

const mascotCanvas = document.getElementById("mascot-canvas");
const mascotRenderer = new THREE.WebGLRenderer({
  canvas: mascotCanvas,
  alpha: true,
  antialias: true,
});
mascotRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const mascotScene = new THREE.Scene();
const mascotCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 10);
mascotCamera.position.z = 3;

const texLoader = new THREE.TextureLoader();

function loadMascotTexture(url) {
  return texLoader.load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
  });
}

const mascotMat = new THREE.MeshBasicMaterial({
  map: loadMascotTexture(season.img),
  transparent: true,
});
const mascot = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), mascotMat);
const mascotGroup = new THREE.Group();
mascotGroup.add(mascot);
mascotScene.add(mascotGroup);

function sizeMascotCanvas() {
  const w = mascotCanvas.clientWidth || 220;
  mascotRenderer.setSize(w, w, false);
}
sizeMascotCanvas();

/* ---- Particle scene ---------------------------------------------------- */

const particleCanvas = document.getElementById("particle-canvas");
const particleRenderer = new THREE.WebGLRenderer({
  canvas: particleCanvas,
  alpha: true,
  antialias: false,
});
particleRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const particleScene = new THREE.Scene();
// Ortho camera in "pixel-ish" units: 1 world unit = 1 CSS pixel
const particleCamera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);

const MAX_PARTICLES = 240;
let particleCount = 120;

// Soft round sprite, tinted via material.color
function makeSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.7, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const positions = new Float32Array(MAX_PARTICLES * 3);
const seeds = new Float32Array(MAX_PARTICLES); // phase offset per particle
const scales = new Float32Array(MAX_PARTICLES); // size/speed multiplier

const particleGeo = new THREE.BufferGeometry();
particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

const particleMat = new THREE.PointsMaterial({
  map: makeSprite(),
  color: new THREE.Color(season.particle.color),
  size: season.particle.size,
  transparent: true,
  opacity: season.particle.opacity,
  depthWrite: false,
  sizeAttenuation: false,
});
const particles = new THREE.Points(particleGeo, particleMat);
particleScene.add(particles);

let vw = 1;
let vh = 1;

function seedParticle(i, anywhere) {
  positions[i * 3] = Math.random() * vw;
  positions[i * 3 + 1] = anywhere ? Math.random() * vh : vh + 20;
  positions[i * 3 + 2] = 0;
  seeds[i] = Math.random() * Math.PI * 2;
  scales[i] = 0.6 + Math.random() * 0.8;
}

function sizeParticleCanvas() {
  vw = window.innerWidth;
  vh = window.innerHeight;
  particleRenderer.setSize(vw, vh, false);
  particleCamera.right = vw;
  particleCamera.top = vh;
  particleCamera.updateProjectionMatrix();
}
sizeParticleCanvas();
for (let i = 0; i < MAX_PARTICLES; i++) seedParticle(i, true);

/* ---- Pointer parallax --------------------------------------------------- */

const tilt = { x: 0, y: 0, tx: 0, ty: 0 };

window.addEventListener("pointermove", (e) => {
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = (e.clientY / window.innerHeight) * 2 - 1;
  tilt.tx = nx * 0.28;
  tilt.ty = -ny * 0.16;
});

/* ---- Render loop --------------------------------------------------------- */

const clock = new THREE.Clock();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  const p = season.particle;

  for (let i = 0; i < particleCount; i++) {
    const k = scales[i];
    positions[i * 3 + 1] -= p.fall * k * dt;
    positions[i * 3] +=
      (Math.sin(t * 0.8 + seeds[i]) * p.sway + p.drift) * k * dt;

    if (p.fall >= 0 && positions[i * 3 + 1] < -20) seedParticle(i, false);
    if (p.fall < 0 && positions[i * 3 + 1] > vh + 20) {
      seedParticle(i, false);
      positions[i * 3 + 1] = -20;
    }
    if (positions[i * 3] < -30) positions[i * 3] = vw + 20;
    if (positions[i * 3] > vw + 30) positions[i * 3] = -20;
  }
  // Hide unused slots offscreen
  for (let i = particleCount; i < MAX_PARTICLES; i++) {
    positions[i * 3 + 1] = -9999;
  }
  particleGeo.attributes.position.needsUpdate = true;

  // Smooth tilt toward pointer
  tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 5);
  tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 5);
  mascotGroup.rotation.y = tilt.x;
  mascotGroup.rotation.x = tilt.y;

  particleRenderer.render(particleScene, particleCamera);
  mascotRenderer.render(mascotScene, mascotCamera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.addEventListener("resize", () => {
  sizeParticleCanvas();
  sizeMascotCanvas();
});

/* ---- GSAP choreography ---------------------------------------------------- */

const bubble = document.getElementById("speech-bubble");
const line = document.getElementById("speech-line");
const TAIL_ORIGIN = "left 46px";

let master = null;
let idleTweens = [];

function startIdle() {
  idleTweens.push(
    // GSAP tweens three.js properties directly — same API as DOM tweens
    gsap.to(mascot.position, {
      y: 0.045,
      duration: 2.6,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    }),
    gsap.to(mascot.rotation, {
      z: 0.02,
      duration: 3.4,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    }),
    gsap.to(bubble, {
      scaleX: 1.019,
      scaleY: 1.015,
      transformOrigin: TAIL_ORIGIN,
      duration: 2.35,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    })
  );
}

function playIntro() {
  master?.kill();
  idleTweens.forEach((tw) => tw.kill());
  idleTweens = [];
  gsap.set(bubble, { clearProps: "all" });
  gsap.set(line, { clearProps: "all" });
  mascot.position.set(0, 0, 0);
  mascot.rotation.set(0, 0, 0);

  master = gsap.timeline({ onComplete: startIdle });

  master.set(bubble, { autoAlpha: 0, transformOrigin: TAIL_ORIGIN }, 0);
  master.set(line, { autoAlpha: 0 }, 0);

  // Mascot pops up in WebGL space
  master.fromTo(
    mascot.scale,
    { x: 0.001, y: 0.001 },
    { x: 1, y: 1, duration: 0.9, ease: "back.out(1.6)" },
    0.3
  );
  master.fromTo(
    mascot.position,
    { y: -0.35 },
    { y: 0, duration: 0.9, ease: "back.out(1.6)" },
    0.3
  );

  // Bubble springs out in the DOM
  master.set(bubble, { autoAlpha: 1, scaleX: 0.1, scaleY: 0.1 }, 0.95);
  master.to(
    bubble,
    { scaleX: 1, scaleY: 1, duration: 1.15, ease: "elastic.out(1, 0.5)" },
    0.95
  );
  master.to(line, { autoAlpha: 1, duration: 0.6, ease: "power1.out" }, 1.45);
}

/* ---- Controls -------------------------------------------------------------- */

function applySeason(key) {
  season = SEASONS[key];
  document.documentElement.style.setProperty("--bg-top", season.top);
  document.documentElement.style.setProperty("--bg-bottom", season.bottom);
  mascotMat.map = loadMascotTexture(season.img);
  mascotMat.needsUpdate = true;
  particleMat.color.set(season.particle.color);
  particleMat.size = season.particle.size;
  particleMat.opacity = season.particle.opacity;
}

document.getElementById("season-row").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-season]");
  if (!btn) return;
  document
    .querySelectorAll("#season-row button")
    .forEach((b) => b.classList.toggle("is-active", b === btn));
  applySeason(btn.dataset.season);
});

document.getElementById("replay-btn").addEventListener("click", playIntro);

const density = document.getElementById("density");
const densityOut = document.getElementById("density-out");
density.addEventListener("input", () => {
  particleCount = parseInt(density.value, 10);
  densityOut.textContent = String(particleCount);
});

playIntro();
