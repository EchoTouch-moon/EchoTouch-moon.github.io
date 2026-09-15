/* Template 01 · Dithered Ink — v20 engine.
   Scenes are pluggable: any script that runs before this one may
   register a GLSL function via

     window.__INK_SCENES = window.__INK_SCENES || {};
     window.__INK_SCENES.<name> = `
       float scene_<name>(vec2 p, float t) { ... }
     `;

   Coordinate contract for scenes: p.x in [0, u_aspect] (band-height
   units, ~4.27 at 1280px), p.y in [0,1] bottom-up, t seconds.
   Return tone [0,1] (0 = paper, 1 = solid ink, mid tones dither).

   Scene pick: canvas data-scene attr > ?scene= URL param > a random
   rain/clouds/willow choice that persists across in-site navigation
   and is reselected only on an explicit browser reload.
   Rain intensity (?rain=drizzle|light|heavy|storm|auto) feeds the
   u_intensity uniform for scenes that use it. Media mode: point the
   canvas at data-src="clip.mp4|photo.jpg" to dither your own
   footage instead of any scene.

   Rendering: 4x4 ordered dither at native physical-pixel detail
   (~30fps), static frame under
   prefers-reduced-motion. All scene code is original to this
   template; ordered dithering is a classic public technique.       */

(function () {
  "use strict";

  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.getElementById("ink-canvas");
  if (!canvas) return;
  // Match the reference site's presentation model: WebGL supplies only the
  // ink pixels, while the stable CSS background shows through everywhere else.
  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: true,
    premultipliedAlpha: false
  });
  if (!gl) return;

  /* --------------------------- scene pick -------------------------- */

  // builtin scene, always available (also the fallback)
  window.__INK_SCENES = window.__INK_SCENES || {};
  if (!window.__INK_SCENES.dunes) {
    window.__INK_SCENES.dunes = `
      float scene_dunes(vec2 p, float t) {
        vec2 uv = vec2(p.x / u_aspect, p.y);
        float tt = t * 0.35;
        float tone = 0.0;
        float d = distance(uv, vec2(0.68, 0.88));
        float ring = step(d, 0.070);
        ring = max(ring, step(d, 0.100) * 0.45);
        ring = max(ring, step(d, 0.128) * 0.20);
        tone = max(tone, ring);
        for (int k = 0; k < 4; k++) {
          float fk = float(k);
          float base = 0.24 + 0.18 * fk;
          float amp  = 0.035 + 0.012 * fk;
          float y = base
            + amp * sin(uv.x * (3.1 + 1.4 * fk) * 3.14159 + tt * (0.30 + 0.10 * fk) + fk * 2.1)
            + amp * 0.45 * sin(uv.x * (6.6 + 2.2 * fk) * 3.14159 - tt * 0.42 + fk * 4.7);
          float plane = 0.28 + 0.20 * fk;
          float below = 1.0 - smoothstep(y - 0.002, y + 0.002, uv.y);
          tone = mix(tone, plane, below);
          tone = max(tone, (1.0 - smoothstep(0.0, 0.0035, abs(uv.y - y))) * below);
        }
        return clamp(tone, 0.0, 1.0);
      }
    `;
  }

  const SESSION_SCENE_KEY = "ink-banner-scene";
  const RANDOM_SCENES = ["scroll", "waves", "rain", "willow", "clouds"];

  function readSessionScene() {
    try { return sessionStorage.getItem(SESSION_SCENE_KEY); }
    catch { return null; }
  }

  function writeSessionScene(name) {
    try { sessionStorage.setItem(SESSION_SCENE_KEY, name); }
    catch { /* storage may be unavailable on file: URLs */ }
  }

  function isReloadNavigation() {
    try {
      const entries = performance.getEntriesByType
        ? performance.getEntriesByType("navigation")
        : [];
      if (entries.length) return entries[0].type === "reload";
      return Boolean(performance.navigation && performance.navigation.type === 1);
    } catch {
      return false;
    }
  }

  function randomScene(exclude) {
    const available = RANDOM_SCENES.filter(
      (name) => window.__INK_SCENES[name] && name !== exclude
    );
    if (!available.length) return window.__INK_SCENES.rain ? "rain" : "dunes";
    return available[Math.floor(Math.random() * available.length)];
  }

  function pickSceneName() {
    const attr = canvas.dataset.scene;
    if (attr && window.__INK_SCENES[attr]) {
      writeSessionScene(attr);
      return attr;
    }
    try {
      const q = new URLSearchParams(location.search).get("scene");
      if (q && window.__INK_SCENES[q]) {
        writeSessionScene(q);
        return q;
      }
    } catch { /* ignore */ }

    const previous = readSessionScene();
    const validPrevious = RANDOM_SCENES.includes(previous)
      && Boolean(window.__INK_SCENES[previous]);
    if (!isReloadNavigation() && validPrevious) return previous;

    const selected = randomScene(validPrevious ? previous : null);
    writeSessionScene(selected);
    return selected;
  }

  /* ------------------------- rain intensity ------------------------ */

  const RAIN_LEVELS = { drizzle: 0.15, light: 0.40, heavy: 0.70, storm: 1.0 };
  // Parse rain mode once at init — URL doesn't change during the page lifecycle
  let _rainMode = "auto";
  try {
    const q = new URLSearchParams(location.search).get("rain");
    if (q && (q in RAIN_LEVELS || q === "auto")) _rainMode = q;
  } catch { /* ignore */ }

  function rainIntensity(t) {
    if (_rainMode !== "auto") return RAIN_LEVELS[_rainMode];
    // auto: start in legible light rain, build to a storm, then ease back.
    const cycle = ((t + 7) % 36) / 36;
    return 0.22 + 0.78 * (0.5 - 0.5 * Math.cos(cycle * Math.PI * 2));
  }

  /* ------------------------------ shaders -------------------------- */

  const vsSource = `
    attribute vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
  `;

  function buildFragmentSource() {
    // deterministic order: builtin dunes first, then registered scenes
    const names = Object.keys(window.__INK_SCENES);
    const parts = [];

    parts.push(`
      precision mediump float;
      uniform vec2  u_res;
      uniform highp float u_time;
      uniform vec3  u_ink;
      uniform vec3  u_bg;
      uniform float u_scene;
      uniform float u_aspect;
      uniform float u_intensity;
      uniform float u_media;
      uniform sampler2D u_tex;
      uniform vec4  u_texRect;
      uniform float u_isLight;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u2 = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u2.x), mix(c, d, u2.x), u2.y);
      }

      // High-performance Atkinson 4x4 threshold — zero loop, zero dynamic array allocations
      float atkinson4(vec2 pos) {
        int x = int(mod(pos.x, 4.0));
        int y = int(mod(pos.y, 4.0));
        vec4 row = (y == 0) ? vec4(0.0, 12.0, 3.0, 15.0)
                 : (y == 1) ? vec4(8.0, 4.0, 11.0, 7.0)
                 : (y == 2) ? vec4(2.0, 14.0, 1.0, 13.0)
                 :            vec4(10.0, 6.0, 9.0, 5.0);
        float val = (x == 0) ? row.x : (x == 1) ? row.y : (x == 2) ? row.z : row.w;
        return (val + 0.5) / 16.0;
      }

    `);

    for (const name of names) parts.push(window.__INK_SCENES[name]);

    // dispatcher over the ordered scene list
    const branches = names.map((name, i) => {
      const cmp = i === 0 ? "if" : "else if";
      return `${cmp} (idx < ${i + 0.5}) { tone = scene_${name}(p, t); }`;
    });
    parts.push(`
      float applyScene(vec2 p, float t, float idx) {
        float tone = 0.0;
        ${branches.join("\n        ")}
        return tone;
      }
    `);

    parts.push(`
      void main() {
        // Native physical-pixel sampling preserves the fine stipple of the
        // reference. Flicker is controlled by keeping large animated
        // mid-tone fields out of the scene, rather than enlarging every dot.
        vec2 frag = gl_FragCoord.xy;
        vec2 uv = frag / u_res;                 // 0..1, y up
        vec2 p = frag / u_res.y;                // x in band-height units

        float tone = applyScene(p, u_time, u_scene);

        if (u_media > 0.5) {
          vec3 rgb = texture2D(u_tex, vec2(uv.x, 1.0 - uv.y)).rgb;
          float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
          tone = lum * (0.96 + 0.08 * hash(frag + floor(u_time * 2.0)));
        }

        // Fade tone smoothly toward zero at bottom edge.
        // For panoramic scroll (u_media == 1.0), use a gentle 8% bottom dissolution
        // so water and shoreline details remain clearly visible;
        // for waves and other scenes, use 40% dissolution.
        float fade = mix(smoothstep(0.0, 0.40, uv.y), smoothstep(0.0, 0.08, uv.y), u_media);
        tone *= fade;

        // Atkinson-style dithering: contrast boost + 4x4 threshold
        float boosted = clamp(tone * 1.2 - 0.1, 0.0, 1.0);
        float threshold = atkinson4(frag);

        // Keep the ordered-dither grid stable in screen pixels. The scene
        // moves underneath it, but the threshold itself must not animate;
        // otherwise thousands of dots flip together while the page scrolls.
        float ink = step(threshold, boosted);

        // Keep paper/page color out of the animated GPU surface. Only opaque
        // one-bit ink dots are emitted; CSS supplies the stable background.
        // Multiply RGB by ink (alpha) for clean premultiplied alpha compositing,
        // preventing unmultiplied RGB bleed/flicker during browser scrolling.
        gl_FragColor = vec4(u_ink * ink, ink);
      }
    `);

    return parts.join("\n");
  }

  /* ------------------------------ program -------------------------- */

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
    }
    return s;
  }

  const sceneNames = Object.keys(window.__INK_SCENES);
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, buildFragmentSource()));
  gl.linkProgram(program);
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const u = (n) => gl.getUniformLocation(program, n);
  const uRes = u("u_res"), uTime = u("u_time"), uInk = u("u_ink"), uBg = u("u_bg"),
        uScene = u("u_scene"), uAspect = u("u_aspect"),
        uIntensity = u("u_intensity"), uMedia = u("u_media"), uTex = u("u_tex"),
        uTexRect = u("u_texRect"), uIsLight = u("u_isLight");

  /* ------------------------- ink + bg colors ------------------------ */

  let probe = null;
  let cachedInk = null, cachedBg = null;
  let settleUntil = 0;  // re-read every frame while a theme transition runs

  function probeColor(cssVar) {
    if (!probe) {
      probe = document.createElement("span");
      probe.style.display = "none";
      document.body.appendChild(probe);
    }
    probe.style.color = "var(" + cssVar + ")";
    const m = getComputedStyle(probe).color.match(/[\d.]+/g);
    return m ? m.slice(0, 3).map(Number) : null;
  }

  function readColors() {
    if (!cachedInk || !cachedBg || performance.now() < settleUntil) {
      cachedInk = probeColor("--canvas-ink") || [43, 29, 16];
      cachedBg = probeColor("--bg") || [251, 243, 228];
    }
    return { ink: cachedInk, bg: cachedBg };
  }

  function colorsChanged() {
    settleUntil = performance.now() + 400;  // > body transition duration
    draw(performance.now());
  }

  /* ------------------------ media & scroll engine ------------------------- */

  const VIDEO_SOURCES = {
    waves: {
      videoSrc: "waves.mp4",
      fallbackSrc: "waves-fallback.png"
    },
    clouds: {
      videoSrc: "clouds.mp4",
      fallbackSrc: "clouds-fallback.png"
    }
  };

  const SCROLL_SOURCES = {
    qianli: "scroll-qianli.jpg",
    qingming: "scroll-qingming.jpg"
  };

  let activeScrollKey = "qianli"; // 千里江山图 is default!
  // Remove any overlay button if present
  try { const b = document.getElementById("ink-scroll-toggle"); if (b) b.remove(); } catch {}
  let scrollImg = null;
  let scrollReady = false;
  let scrollTex = null;

  let isDraggingScroll = false;
  let dragStartX = 0;
  let dragStartOffset = 0;
  let userScrollOffset = 0;
  let lastDragTime = -10000;

  const videoElements = {};
  const fallbackImages = {};
  const mediaReady = {};
  let currentActiveVideo = null;
  let mediaTex = null;
  let mediaAllocW = 0, mediaAllocH = 0;

  /** Pause all video elements except the one matching `keepKey`.
      Called only on scene transitions, not every frame. */
  function pauseAllVideosExcept(keepKey) {
    for (const key in videoElements) {
      if (key !== keepKey && videoElements[key] && !videoElements[key].paused) {
        videoElements[key].pause();
      }
    }
  }

  const scriptEl = document.currentScript || document.querySelector('script[src*="dither.js"]');
  const assetBase = scriptEl ? new URL(".", scriptEl.src).href : "assets/";

  function getAssetPath(file) {
    try {
      return new URL(file, assetBase).href;
    } catch {
      const isNested = location.pathname.includes("/posts/");
      return (isNested ? "../../assets/" : "assets/") + file;
    }
  }


  
  let loadedScrollTarget = "";
  function initScrollMedia(targetKey) {
    const key = targetKey || activeScrollKey;
    if (!scrollTex) {
      scrollTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, scrollTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([0]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    if (loadedScrollTarget !== key) {
      loadedScrollTarget = key;
      scrollReady = false;
      scrollImg = new Image();
      scrollImg.crossOrigin = "anonymous";
      scrollImg.src = getAssetPath(SCROLL_SOURCES[key]);
      scrollImg.onload = () => {
        scrollReady = true;
        gl.bindTexture(gl.TEXTURE_2D, scrollTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, scrollImg);
        draw(performance.now());
      };
    }
  }

  function toggleScrollMasterpiece() {
    activeScrollKey = (activeScrollKey === "qingming") ? "qianli" : "qingming";
    loadedScrollTarget = "";
    initScrollMedia(activeScrollKey);
  }

  // Pointer interactions for dragging panoramic scroll
  canvas.addEventListener("pointerdown", (e) => {
    if (sceneNames[sceneIdx] === "scroll") {
      isDraggingScroll = true;
      dragStartX = e.clientX;
      dragStartOffset = userScrollOffset;
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      canvas.style.cursor = "grabbing";
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (isDraggingScroll && (sceneNames[sceneIdx] === "scroll")) {
      const dx = e.clientX - dragStartX;
      const texAspect = 4096 / 341;
      const canvasAspect = canvas.width / canvas.height;
      const winW = Math.min(1.0, canvasAspect / texAspect);
      const maxScroll = Math.max(0.001, 1.0 - winW);
      const deltaU = -dx / (canvas.width * (texAspect / canvasAspect));
      userScrollOffset = Math.max(0.0, Math.min(maxScroll, dragStartOffset + deltaU));
      lastDragTime = performance.now();
      draw(performance.now());
    }
  });

  function endScrollDrag(e) {
    if (isDraggingScroll) {
      isDraggingScroll = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch {}
      canvas.style.cursor = (sceneNames[sceneIdx] === "scroll") ? "grab" : "default";
    }
  }
  canvas.addEventListener("pointerup", endScrollDrag);
  canvas.addEventListener("pointercancel", endScrollDrag);
  canvas.addEventListener("dblclick", () => {
    if (sceneNames[sceneIdx] === "scroll") {
      toggleScrollMasterpiece();
    }
  });

  function initMediaForScene(sceneName) {
    if (!VIDEO_SOURCES[sceneName]) return;
    if (!mediaTex) {
      mediaTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mediaTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([128]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(uTex, 0);
    }

    if (!videoElements[sceneName]) {
      const cfg = VIDEO_SOURCES[sceneName];
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.loop = true;
      v.muted = true;
      v.autoplay = true;
      v.playsInline = true;
      if (sceneName === "clouds") v.playbackRate = 0.5;
      v.src = getAssetPath(cfg.videoSrc);

      const fb = new Image();
      fb.crossOrigin = "anonymous";
      fb.src = getAssetPath(cfg.fallbackSrc);
      fb.onload = () => {
        if (!mediaReady[sceneName]) mediaReady[sceneName] = true;
      };

      v.addEventListener("loadeddata", () => {
        mediaReady[sceneName] = true;
        if (sceneName === "clouds") v.playbackRate = 0.5;
        if (currentActiveVideo === v) v.play().catch(() => {});
      });
      v.addEventListener("canplay", () => {
        mediaReady[sceneName] = true;
        if (sceneName === "clouds") v.playbackRate = 0.5;
        if (currentActiveVideo === v) v.play().catch(() => {});
      });

      videoElements[sceneName] = v;
      fallbackImages[sceneName] = fb;
    }
  }

  /* ----------------------------- render ---------------------------- */

  const startTime = performance.now();
  let lastFrame = -1000;
  let canvasVisible = true;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uAspect, canvas.width / canvas.height);
  }

  let activeScene = pickSceneName();
  canvas.dataset.activeScene = activeScene;
  let sceneIdx = sceneNames.indexOf(activeScene);
  canvas.style.cursor = (activeScene === "scroll") ? "grab" : "default";

  if (VIDEO_SOURCES[activeScene]) initMediaForScene(activeScene);
  else pauseAllVideosExcept(null);  // No video scene active at init — pause all
  if (!VIDEO_SOURCES[activeScene]) currentActiveVideo = null;
  if (activeScene === "scroll") initScrollMedia();

  document.addEventListener("ink:scenechange", (e) => {
    const next = e.detail && e.detail.scene;
    if (next && window.__INK_SCENES[next]) {
      activeScene = next;
      sceneIdx = sceneNames.indexOf(next);
      canvas.dataset.activeScene = next;
      canvas.style.cursor = (next === "scroll") ? "grab" : "default";
      writeSessionScene(next);
      // Pause non-active videos only on scene switch, not every frame
      pauseAllVideosExcept(VIDEO_SOURCES[next] ? next : null);
      if (!VIDEO_SOURCES[next]) currentActiveVideo = null;
      if (VIDEO_SOURCES[next]) initMediaForScene(next);
      if (next === "scroll") initScrollMedia();
      draw(performance.now());
    } else if (next === "auto") {
      writeSessionScene("");
      activeScene = randomScene(null);
      sceneIdx = sceneNames.indexOf(activeScene);
      canvas.dataset.activeScene = activeScene;
      canvas.style.cursor = (activeScene === "scroll") ? "grab" : "default";
      pauseAllVideosExcept(VIDEO_SOURCES[activeScene] ? activeScene : null);
      if (!VIDEO_SOURCES[activeScene]) currentActiveVideo = null;
      if (VIDEO_SOURCES[activeScene]) initMediaForScene(activeScene);
      if (activeScene === "scroll") initScrollMedia();
      draw(performance.now());
    }
  });

  function draw(now) {
    const t = reduced ? 21.0 : (now - startTime) / 1000;
    const { ink, bg } = readColors();
    const currentSceneName = sceneNames[sceneIdx] || "";
    const isVideoScene = Boolean(VIDEO_SOURCES[currentSceneName]);
    const isScrollScene = (currentSceneName === "scroll");

    if (isVideoScene) {
      initMediaForScene(currentSceneName);
      const activeV = videoElements[currentSceneName];
      const activeFb = fallbackImages[currentSceneName];

      currentActiveVideo = activeV;
      if (activeV && activeV.paused && activeV.readyState >= 2) {
        activeV.play().catch(() => {});
      }

      const srcW = (activeV && activeV.videoWidth) || (activeFb && activeFb.naturalWidth) || 1024;
      const srcH = (activeV && activeV.videoHeight) || (activeFb && activeFb.naturalHeight) || 206;
      const canvasAspect = canvas.width / canvas.height;
      const sourceAspect = srcW / srcH;
      let texLeft = 0.0, texBottom = 0.0, texWidth = 1.0, texHeight = 1.0;
      if (sourceAspect > canvasAspect) {
        const scale = canvasAspect / sourceAspect;
        texLeft = (1.0 - scale) / 2.0;
        texWidth = scale;
      } else {
        const scale = sourceAspect / canvasAspect;
        texHeight = scale;
        texBottom = 0.0;
      }
      gl.uniform4f(uTexRect, texLeft, texBottom, texWidth, texHeight);

      if (mediaTex && mediaReady[currentSceneName]) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, mediaTex);
        const source = (activeV && activeV.readyState >= 2) ? activeV : activeFb;
        try {
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          if (mediaAllocW === srcW && mediaAllocH === srcH) {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, source);
          } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, source);
            mediaAllocW = srcW;
            mediaAllocH = srcH;
          }
        } catch { /* frame not ready */ }
        gl.uniform1i(uTex, 0);
      }
    } else if (isScrollScene) {
      initScrollMedia();

      const texAspect = 4096 / 341;
      const canvasAspect = canvas.width / canvas.height;
      const winW = Math.min(1.0, canvasAspect / texAspect);
      const maxScroll = Math.max(0.0, 1.0 - winW);

      let scrollX = 0.0;
      const idleTime = now - lastDragTime;
      if (isDraggingScroll) {
        scrollX = userScrollOffset;
      } else if (idleTime < 3000) {
        scrollX = userScrollOffset;
      } else {
        // Serene ping-pong unrolling across the masterwork scroll (~80s cycle)
        const cycle = 0.5 - 0.5 * Math.cos(t * 0.08);
        const autoX = cycle * maxScroll;
        if (idleTime < 6000) {
          const blend = (idleTime - 3000) / 3000;
          scrollX = userScrollOffset * (1.0 - blend) + autoX * blend;
        } else {
          scrollX = autoX;
          userScrollOffset = autoX;
        }
      }

      gl.uniform4f(uTexRect, scrollX, 0.0, winW, 1.0);

      if (scrollTex && scrollReady) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, scrollTex);
        gl.uniform1i(uTex, 0);
      }
    }

    const isLightMode = (bg[0] > 128) ? 1.0 : 0.0;
    gl.uniform1f(uIsLight, isLightMode);

    gl.uniform3f(uInk, ink[0] / 255, ink[1] / 255, ink[2] / 255);
    gl.uniform3f(uBg, bg[0] / 255, bg[1] / 255, bg[2] / 255);
    gl.uniform1f(uTime, t);
    gl.uniform1f(uScene, sceneIdx);
    gl.uniform1f(uIntensity, rainIntensity(t));
    gl.uniform1f(uMedia, isScrollScene ? 1.0 : 0.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  let needsResize = false;
  function markResize() {
    needsResize = true;
  }

  function updateVideoPlaybackState() {
    const shouldPlay = canvasVisible && !document.hidden;
    for (const key in videoElements) {
      const v = videoElements[key];
      if (!v) continue;
      if (shouldPlay && v === currentActiveVideo) {
        if (v.paused) v.play().catch(() => {});
      } else {
        if (!v.paused) v.pause();
      }
    }
  }

  function loop(now) {
    if (!document.hidden && canvasVisible) {
      if (needsResize) {
        needsResize = false;
        resize();
      }
      if (now - lastFrame >= 33) {
        draw(now);
        lastFrame = now;
      }
    }
    if (!reduced) requestAnimationFrame(loop);
  }

  let visibilityObserver = null;
  if ("IntersectionObserver" in window) {
    visibilityObserver = new IntersectionObserver(([entry]) => {
      canvasVisible = entry ? entry.isIntersecting : true;
      if (canvasVisible) lastFrame = -1000;
      updateVideoPlaybackState();
    }, { rootMargin: "80px 0px" });
    visibilityObserver.observe(canvas);
  }

  document.addEventListener("visibilitychange", () => {
    updateVideoPlaybackState();
    if (!document.hidden && canvasVisible) lastFrame = -1000;
  });

  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(() => markResize());
    ro.observe(canvas);
  } else {
    window.addEventListener("resize", markResize);
  }

  document.addEventListener("ink:themechange", colorsChanged);
  window.matchMedia("(prefers-color-scheme: dark)")
    .addEventListener?.("change", () => setTimeout(colorsChanged, 30));

  resize();
  draw(performance.now());
  if (!reduced) requestAnimationFrame(loop);
})();
