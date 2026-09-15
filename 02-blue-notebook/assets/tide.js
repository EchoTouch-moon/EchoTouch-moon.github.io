/* Template 02 · The Blue Notebook — "Blue Tide" v5: the real thing.
   The water effect below is lucumr.pocoo.org's WebGL shader and render
   loop, used nearly verbatim (by Armin Ronacher — see
   github.com/mitsuhiko/lucumr). Rendering per device pixel via WebGL
   is what makes it crisp; the earlier Canvas2D port looked soft by
   comparison.

   Adaptations from the original (everything else is untouched):
   - the empty-area color and the hover-accent red are uniforms fed
     from this site's CSS variables (--bg, --secondary) instead of the
     original's hardcoded page colors
   - canvases are discovered by class (.tide-canvas[data-flip])
   - prefers-reduced-motion renders a single static frame            */

(function () {
  "use strict";

  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- site palette (CSS variables → rgb) ------------ */

  let probe = null;
  function resolveColor(varName) {
    if (!probe) {
      probe = document.createElement("span");
      probe.style.display = "none";
      document.body.appendChild(probe);
    }
    probe.style.color = `var(${varName})`;
    const m = getComputedStyle(probe).color.match(/[\d.]+/g);
    return m ? m.slice(0, 3).map(Number) : [255, 255, 255];
  }

  // resolved once, refreshed on theme switches (not per frame)
  let pageBgRGB = [255, 255, 255];
  let accentRGB = [205, 14, 14];
  function refreshPalette() {
    pageBgRGB = resolveColor("--bg");
    accentRGB = resolveColor("--secondary");
  }

  /* ------------------------- theme state --------------------------- */

  function getIsDark() {
    const theme = root.getAttribute("data-theme");
    if (theme === "dark") return 1.0;
    if (theme === "light") return 0.0;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? 1.0 : 0.0;
  }

  /* ------------------------- the shaders --------------------------- */

  const vsSource = `
    attribute vec2 a_position;
    varying vec2 v_position;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_position = a_position;
    }
  `;

  // Original: lucumr.pocoo.org static/app.js ("Animation effect
  // (WebGL metaballs)"). Only pageBg/accent were changed to uniforms.
  const fsSource = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_isDark;
    uniform float u_fadeTop;
    uniform float u_dpr;
    uniform float u_hover;
    uniform vec3 u_pageBg;
    uniform vec3 u_accent;
    varying vec2 v_position;

    // Cheap hash - single multiply-add chain
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    vec2 hash2(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return fract(sin(p) * 43758.5453);
    }

    // Simple value noise - much cheaper than simplex
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      ) * 2.0 - 1.0;
    }

    // Metaball field - sums smooth falloff from nearby blob centers
    // When blobs approach, their fields add up and merge organically
    // Returns vec2(field, accentWeight) where accentWeight is 0-1 based on accent blob contribution
    vec2 metaball(vec2 p, float time) {
      vec2 i = floor(p);
      vec2 f = fract(p);

      float sum = 0.0;
      float accentSum = 0.0;

      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 neighbor = vec2(float(x), float(y));
          vec2 cellId = i + neighbor;
          vec2 point = hash2(cellId);
          point = 0.5 + 0.4 * sin(time * 0.3 + 6.28 * point);
          vec2 diff = neighbor + point - f;
          float r2 = dot(diff, diff);

          // Smooth polynomial falloff: (1 - r²)³ for r² < 1, else 0
          // This creates soft edges that blend when overlapping
          float influence = max(0.0, 1.0 - r2);
          float contrib = influence * influence * influence;
          sum += contrib;

          // Check if this blob is an accent blob (~8% chance based on cell)
          float isAccent = step(0.92, hash(cellId + 0.5));
          // Random delay for staggered fade-in (0 to 0.75 of the 0-1 range = 0-2s of 2.65s total)
          float blobDelay = hash(cellId + 0.7) * 0.75;
          // Blob visibility based on hover progress and delay
          float blobVisible = smoothstep(blobDelay, blobDelay + 0.25, u_hover);
          accentSum += contrib * isAccent * blobVisible;
        }
      }

      // Normalize accent weight by total contribution
      float accentWeight = sum > 0.0 ? accentSum / sum : 0.0;
      return vec2(sum, accentWeight);
    }

    // Cheap warping using value noise
    vec2 warpCoords(vec2 p, float time) {
      float warp1 = vnoise(p * 0.5 + time * 0.05);
      float warp2 = vnoise(p * 0.3 - time * 0.03 + 100.0);
      return p + vec2(warp1, warp2) * 0.4;
    }

    void main() {
      float scale = 0.0133;
      vec2 p = gl_FragCoord.xy * scale;

      // Wind Waker colors
      vec3 lightBright = vec3(0.10, 0.42, 0.70);
      vec3 lightDark = vec3(0.04, 0.22, 0.44);
      vec3 darkBright = vec3(0.32, 0.55, 0.82);
      vec3 darkDark = vec3(0.12, 0.24, 0.40);

      vec3 bright = mix(lightBright, darkBright, u_isDark);
      vec3 dark = mix(lightDark, darkDark, u_isDark);
      // adapted: page background and accent red come from the host site
      vec3 pageBg = u_pageBg;
      vec3 accent = u_accent;

      // Calculate boundary first so metaballs can react to it
      float baseHeight = 50.0 * u_dpr;
      float waveAmplitude = 25.0 * u_dpr;
      float xCoord = gl_FragCoord.x / u_dpr;
      float boundary = baseHeight;
      boundary += vnoise(vec2(xCoord * 0.008, u_time * 0.08)) * waveAmplitude;
      boundary += vnoise(vec2(xCoord * 0.02, u_time * 0.04 + 50.0)) * waveAmplitude * 0.4;

      float pixelY = mix(gl_FragCoord.y, u_resolution.y - gl_FragCoord.y, u_fadeTop);
      float distToBoundary = pixelY - boundary;

      // Wall influence - blobs pool against the boundary
      float wallRange = 40.0 * u_dpr;
      float wallInfluence = smoothstep(wallRange, 0.0, distToBoundary) * 0.25;

      // Bottom layer - darker, larger scale
      vec2 p1 = p * 0.7 + vec2(u_time * 0.02, u_time * 0.015);
      vec2 meta1 = metaball(warpCoords(p1, u_time * 0.6), u_time * 0.6);
      float field1 = meta1.x + wallInfluence;
      float accent1 = meta1.y;

      // Top layer - brighter, smaller scale
      vec2 p2 = p + vec2(u_time * 0.06, -u_time * 0.02);
      vec2 meta2 = metaball(warpCoords(p2 + 100.0, u_time), u_time);
      float field2 = meta2.x + wallInfluence;
      float accent2 = meta2.y;

      // Taper off fields below boundary (allows slight overhang)
      float taperRange = 30.0 * u_dpr;
      float taper = smoothstep(-taperRange, 0.0, distToBoundary);
      field1 *= taper;
      field2 *= taper;

      // Metaball thresholds - higher = smaller blobs, lower = more merging
      // Use smoothstep for ~0.5px anti-aliasing on low-DPI screens
      float aaWidth = 0.005 / max(u_dpr, 1.0);

      float blend1 = smoothstep(0.92 - aaWidth, 0.92 + aaWidth, field1);
      float blend2 = smoothstep(0.95 - aaWidth, 0.95 + aaWidth, field2);

      // Hard threshold for accent - blob is either accent or not
      float isAccent1 = step(0.5, accent1);
      float isAccent2 = step(0.5, accent2);

      // Blend accent color based on hover state
      vec3 dark1 = mix(dark, accent, isAccent1 * u_hover);
      vec3 bright2 = mix(bright, accent, isAccent2 * u_hover);

      vec3 color = mix(pageBg, dark1, blend1);
      color = mix(color, bright2, blend2);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  /* --------------------- effect initialization --------------------- */

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function initWaterEffect(canvas, fadeTop) {
    const gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) return null;   // the original shows nothing without WebGL

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const u = (name) => gl.getUniformLocation(program, name);
    gl.uniform1f(u("u_fadeTop"), fadeTop ? 1.0 : 0.0);

    return {
      canvas,
      gl,
      resolutionLoc: u("u_resolution"),
      timeLoc: u("u_time"),
      isDarkLoc: u("u_isDark"),
      dprLoc: u("u_dpr"),
      hoverLoc: u("u_hover"),
      pageBgLoc: u("u_pageBg"),
      accentLoc: u("u_accent"),
      hoverTarget: 0,
      hoverValue: 0,
      needsResize: true,
    };
  }

  /* -------------------------- render loop -------------------------- */

  const FRAME_INTERVAL = 33; // ~30fps
  let isPageVisible = true;
  let visibleCanvases = new Set();
  let effects = [];
  let startTime = performance.now();
  let lastFrameTime = 0;
  let currentDpr = window.devicePixelRatio;

  // For low-DPI screens, use supersampling (render at higher res)
  function getEffectiveDpr() {
    const dpr = window.devicePixelRatio;
    // On low-DPI screens (dpr <= 1), render at 1.5x for smoother edges
    return dpr <= 1 ? 1.5 : dpr;
  }

  function render(timestamp) {
    // Skip rendering if page is hidden or no canvases are visible
    if (isPageVisible && visibleCanvases.size > 0) {
      if (timestamp - lastFrameTime >= FRAME_INTERVAL) {
        lastFrameTime = timestamp;

        const elapsed = (performance.now() - startTime) / 1000.0;
        const isDark = getIsDark();

        // Detect DPI changes (e.g., moving window between monitors)
        const newDpr = window.devicePixelRatio;
        if (newDpr !== currentDpr) {
          currentDpr = newDpr;
          for (const effect of effects) effect.needsResize = true;
        }

        const effectiveDpr = getEffectiveDpr();
        const deltaTime = FRAME_INTERVAL / 1000.0;
        const pageBg = pageBgRGB;
        const accent = accentRGB;

        for (const effect of effects) {
          const { canvas, gl } = effect;

          if (!visibleCanvases.has(canvas)) continue;

          if (effect.needsResize) {
            canvas.width = canvas.offsetWidth * effectiveDpr;
            canvas.height = canvas.offsetHeight * effectiveDpr;
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform2f(effect.resolutionLoc, canvas.width, canvas.height);
            effect.needsResize = false;
          }

          // Animate hover linearly (~2.65 second total for staggered blobs)
          const hoverSpeed = 1.0 / 2.65;
          if (effect.hoverTarget > effect.hoverValue) {
            effect.hoverValue = Math.min(effect.hoverTarget, effect.hoverValue + deltaTime * hoverSpeed);
          } else if (effect.hoverTarget < effect.hoverValue) {
            effect.hoverValue = Math.max(effect.hoverTarget, effect.hoverValue - deltaTime * hoverSpeed);
          }

          gl.uniform1f(effect.timeLoc, elapsed);
          gl.uniform1f(effect.isDarkLoc, isDark);
          gl.uniform1f(effect.dprLoc, effectiveDpr);
          gl.uniform1f(effect.hoverLoc, effect.hoverValue);
          gl.uniform3f(effect.pageBgLoc, pageBg[0] / 255, pageBg[1] / 255, pageBg[2] / 255);
          gl.uniform3f(effect.accentLoc, accent[0] / 255, accent[1] / 255, accent[2] / 255);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      }
      if (!reduced) requestAnimationFrame(render);
    } else if (!reduced) {
      requestAnimationFrame(render);
    }
  }

  function init() {
    effects = Array.from(document.querySelectorAll("canvas.tide-canvas"))
      .map((cv) => initWaterEffect(cv, cv.dataset.flip === "true"))
      .filter(Boolean);

    if (effects.length === 0) return;

    // Set up hover listeners (each band has independent hover state)
    effects.forEach(function (effect) {
      const container = effect.canvas.parentElement;
      if (container) {
        container.addEventListener("mouseenter", function () { effect.hoverTarget = 1; });
        container.addEventListener("mouseleave", function () { effect.hoverTarget = 0; });
      }
    });

    // Track page visibility
    document.addEventListener("visibilitychange", function () {
      isPageVisible = !document.hidden;
      if (isPageVisible && reduced) render(performance.now());
    });

    // Track canvas visibility with IntersectionObserver
    const observer = new IntersectionObserver(function (entries) {
      for (const entry of entries) {
        if (entry.isIntersecting) visibleCanvases.add(entry.target);
        else visibleCanvases.delete(entry.target);
      }
      if (reduced) render(performance.now());
    }, { threshold: 0 });

    for (const effect of effects) observer.observe(effect.canvas);

    window.addEventListener("resize", function () {
      for (const effect of effects) effect.needsResize = true;
      if (reduced) render(performance.now());
    });

    // refresh the cached palette on theme switches; the per-frame
    // loop then picks it up without touching computed styles
    refreshPalette();
    document.addEventListener("nb:themechange", () => {
      refreshPalette();
      if (reduced) render(performance.now());
    });
    window.matchMedia("(prefers-color-scheme: dark)")
      .addEventListener?.("change", () => {
        setTimeout(() => {
          refreshPalette();
          if (reduced) render(performance.now());
        }, 30);
      });

    render(performance.now());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
