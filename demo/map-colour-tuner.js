(function () {
  const STORAGE_KEY = "map-route-colour-tuner";
  const CURRENT_SUMMER = ["#ffaf64", "#ffeea1"];
  const SUGGESTED_SUMMER = ["#cc4f18", "#e66d1f", "#f28b2e", "#d49a00"];

  function normalizeHex(value, fallback) {
    const text = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
  }

  function loadPalette() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(saved) && saved.length === 4) {
        return saved.map((value, index) => normalizeHex(value, SUGGESTED_SUMMER[index]));
      }
    } catch {
      /* Ignore corrupt localStorage and fall back to the approved candidate. */
    }
    return [...SUGGESTED_SUMMER];
  }

  function savePalette(palette) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(palette));
  }

  function setRoutePalette(palette) {
    document.documentElement.style.setProperty("--map-route-colors", palette.join(", "));
  }

  function replaySoon() {
    window.clearTimeout(replaySoon.timer);
    replaySoon.timer = window.setTimeout(() => {
      document.getElementById("btn-replay")?.click();
    }, 120);
  }

  function renderTuner() {
    const controls = document.querySelector(".demo-controls");
    if (!controls) return;

    const palette = loadPalette();
    setRoutePalette(palette);

    const tuner = document.createElement("section");
    tuner.className = "map-colour-tuner";
    tuner.innerHTML = `
      <div class="map-colour-tuner__title">Summer map colour tuner</div>
      <p class="map-colour-tuner__hint">
        Forward route legs use the orange shades. Reverse legs use the final yellow.
      </p>
      <div class="map-colour-tuner__controls">
        ${palette.map((color, index) => `
          <label>
            ${index === palette.length - 1 ? "Reverse yellow" : `Orange ${index + 1}`}
            <input type="color" value="${color}" data-colour-index="${index}">
          </label>
        `).join("")}
      </div>
      <div class="map-colour-tuner__actions">
        <button type="button" data-palette="suggested">Suggested deeper</button>
        <button type="button" data-palette="current">Current summer</button>
        <button type="button" data-copy-palette>Copy CSS value</button>
      </div>
      <code class="map-colour-tuner__value">${palette.join(", ")}</code>
    `;

    controls.insertAdjacentElement("afterend", tuner);

    const valueEl = tuner.querySelector(".map-colour-tuner__value");
    const inputs = [...tuner.querySelectorAll("input[type='color']")];

    function update(nextPalette) {
      nextPalette.forEach((color, index) => {
        inputs[index].value = color;
      });
      valueEl.textContent = nextPalette.join(", ");
      setRoutePalette(nextPalette);
      savePalette(nextPalette);
      replaySoon();
    }

    inputs.forEach((input) => {
      input.addEventListener("input", () => {
        const next = inputs.map((el, index) => normalizeHex(el.value, palette[index]));
        update(next);
      });
    });

    tuner.querySelector("[data-palette='suggested']").addEventListener("click", () => {
      update([...SUGGESTED_SUMMER]);
    });

    tuner.querySelector("[data-palette='current']").addEventListener("click", () => {
      update([CURRENT_SUMMER[0], CURRENT_SUMMER[0], CURRENT_SUMMER[0], CURRENT_SUMMER[1]]);
    });

    tuner.querySelector("[data-copy-palette]").addEventListener("click", async () => {
      const text = valueEl.textContent;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        window.prompt("Copy palette value", text);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderTuner);
  } else {
    renderTuner();
  }
})();
