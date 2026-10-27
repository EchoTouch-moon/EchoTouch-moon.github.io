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

  if (!window.__INK_SCENES.scroll) {
    window.__INK_SCENES.scroll = `
      float scene_scroll(vec2 p, float t) {
        vec2 frag = gl_FragCoord.xy;
        vec2 uv = frag / u_res;
        vec2 texCoord = vec2(
          u_texRect.x + uv.x * u_texRect.z,
          1.0 - uv.y
        );
        texCoord = clamp(texCoord, 0.0, 1.0);

        vec4 col = texture2D(u_tex, texCoord);
        float stroke = col.r;

        float edgeFade = 1.0;
        if (uv.y < 0.03) edgeFade *= smoothstep(0.0, 0.03, uv.y);
        if (uv.y > 0.97) edgeFade *= smoothstep(1.0, 0.97, uv.y);

        return clamp(stroke * edgeFade, 0.0, 1.0);
      }
    `;
  }

  if (!window.__INK_SCENES.waves) {
    window.__INK_SCENES.waves = `
      float scene_waves(vec2 p, float t) {
        vec2 frag = gl_FragCoord.xy;
        vec2 uv = frag / u_res;
        vec2 sampleCoord = vec2(uv.x, mix(uv.y, 1.0 - uv.y, u_isLight));
        vec2 texCoord = u_texRect.xy + sampleCoord * u_texRect.zw;
        vec4 texColor = texture2D(u_tex, texCoord);
        float gray = texColor.r;
        return clamp(mix(gray, 1.0 - gray, u_isLight), 0.0, 1.0);
      }
    `;
  }

  if (!window.__INK_SCENES.clouds) {
    window.__INK_SCENES.clouds = `
      float scene_clouds(vec2 p, float t) {
        vec2 frag = gl_FragCoord.xy;
        vec2 uv = frag / u_res;
        vec2 sampleCoord = vec2(uv.x, mix(uv.y, 1.0 - uv.y, u_isLight));
        vec2 texCoord = u_texRect.xy + sampleCoord * u_texRect.zw;
        vec4 col = texture2D(u_tex, texCoord);
        float gray = col.r;

        float sharp = clamp((gray - 0.20) / 0.70, 0.0, 1.0);
        sharp = sharp * sharp * (3.0 - 2.0 * sharp);

        return clamp(mix(sharp, 1.0 - sharp, u_isLight), 0.0, 1.0);
      }
    `;
  }

  if (!window.__INK_SCENES.rain) {
    window.__INK_SCENES.rain = `
      float rain_segment(vec2 p, vec2 a, vec2 b, float width) {
        vec2 ab = b - a;
        float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.000001), 0.0, 1.0);
        float d = length(p - (a + ab * h));
        return 1.0 - smoothstep(width, width * 1.8, d);
      }

      float rain_streak(vec2 p, vec2 tail, vec2 head) {
        vec2 axis = head - tail;
        float h = clamp(dot(p - tail, axis) / max(dot(axis, axis), 0.000001), 0.0, 1.0);
        float headBias = smoothstep(0.0, 1.0, h);
        float width = mix(0.0010, 0.0035, headBias);
        float across = 1.0 - smoothstep(width, width * 1.9, length(p - (tail + axis * h)));
        float tailFade = smoothstep(0.0, 0.22, h);
        float weight = mix(0.10, 0.88, headBias * headBias);
        return across * tailFade * weight;
      }

      float rain_ring(vec2 p, vec2 center, float radius, float squash, float width) {
        vec2 q = p - center;
        q.y /= squash;
        float edge = abs(length(q) - radius);
        return 1.0 - smoothstep(width, width * 1.8, edge);
      }

      float rain_dot(vec2 p, vec2 center, float radius) {
        return 1.0 - smoothstep(radius, radius * 1.8, distance(p, center));
      }

      float scene_rain(vec2 p, float t) {
        float inten = clamp(u_intensity, 0.0, 1.0);
        float tone = 0.0;

        for (int j = 0; j < 3; j++) {
          float fj = float(j);
          float bandY = 0.22 + fj * 0.23 + 0.004 * sin(p.x * (1.35 + fj * 0.19) + fj * 2.4);
          float sx = p.x * (1.45 + fj * 0.12) + fj * 5.17;
          float cell = floor(sx);
          float within = fract(sx);
          float present = step(0.62, hash(vec2(cell, 51.0 + fj * 7.0)));
          float ends = smoothstep(0.08, 0.22, within) * (1.0 - smoothstep(0.70, 0.94, within));
          float thread = 1.0 - smoothstep(0.0025, 0.0065, abs(p.y - bandY));
          tone = max(tone, thread * ends * present * 0.30);
        }

        for (int i = 0; i < 48; i++) {
          float fi = float(i);
          float heavyBoost = smoothstep(0.55, 0.85, inten);
          float activeChance = min(0.98, 0.14 + 0.82 * inten + 0.36 * heavyBoost);
          if (hash(vec2(fi, 91.0)) > activeChance) { continue; }

          float cycleLength = 2.20 + hash(vec2(fi, 83.0)) * 1.25;
          float clock = t + hash(vec2(fi, 79.0)) * cycleLength;
          float cycle = floor(clock / cycleLength);
          float local = mod(clock, cycleLength);

          float rx = hash(vec2(fi, 11.0) + cycle * 7.31);
          float ry = hash(vec2(fi, 17.0) + cycle * 5.73);
          float rs = hash(vec2(fi, 23.0) + cycle * 3.91);
          float rl = hash(vec2(fi, 29.0) + cycle * 8.17);
          float rw = hash(vec2(fi, 37.0) + cycle * 6.43);

          float landY = 0.12 + ry * 0.72;
          float landX = 0.08 + rx * max(u_aspect - 0.16, 0.1);
          float perspective = mix(0.58, 1.0, 1.0 - landY);
          float wind = 0.12 + rw * 0.06 + inten * 0.05;
          float fallTime = mix(0.64, 0.34, inten) + rs * mix(0.18, 0.10, inten);

          if (local < fallTime) {
            float fall = local / fallTime;
            float headY = mix(1.13, landY, fall);
            float headX = landX - wind * (headY - landY);
            float trail = (0.044 + rl * 0.045 + inten * 0.030) * perspective;
            vec2 head = vec2(headX, headY);
            vec2 tail = head + vec2(-wind * trail, trail);
            float entry = smoothstep(0.02, 0.12, fall);
            float streak = rain_streak(p, tail, head);
            float bead = rain_dot(p, head, 0.0048) * 0.96;
            tone = max(tone, max(streak, bead) * entry);
          } else {
            float age = local - fallTime;
            vec2 hit = vec2(landX, landY);

            if (age < 0.19) {
              float splashPhase = age / 0.19;
              float splashFade = 1.0 - smoothstep(0.50, 1.0, splashPhase);
              float point = rain_dot(p, hit, 0.0070) * (1.0 - smoothstep(0.0, 0.12, age));
              float crownHeight = 0.052 * perspective * (1.0 - splashPhase);
              float crown = rain_segment(p, hit, hit + vec2(0.0, crownHeight), 0.0030) * splashFade;
              float arc = sin(splashPhase * 3.14159265);
              vec2 leftDrop = hit + vec2(-0.030 * splashPhase, 0.038 * arc) * perspective;
              vec2 rightDrop = hit + vec2(0.034 * splashPhase, 0.032 * arc) * perspective;
              float spray = max(rain_dot(p, leftDrop, 0.0038), rain_dot(p, rightDrop, 0.0035)) * splashFade;
              tone = max(tone, max(point * 0.95, max(crown, spray) * 0.82));
            }

            float squash = 0.29 + 0.10 * perspective;
            float ringWidth = 0.0044 + 0.0014 * perspective;
            if (age < 0.88) {
              float radius1 = (0.017 + age * (0.17 + 0.04 * inten)) * perspective;
              float fade1 = 1.0 - smoothstep(0.42, 0.88, age);
              float first = rain_ring(p, hit, radius1, squash, ringWidth);
              tone = max(tone, first * fade1 * 0.68);
            }

            float secondAge = age - 0.13;
            if (secondAge > 0.0 && secondAge < 0.72) {
              float radius2 = (0.014 + secondAge * (0.14 + 0.03 * inten)) * perspective;
              float fade2 = 1.0 - smoothstep(0.32, 0.72, secondAge);
              float second = rain_ring(p, hit, radius2, squash, ringWidth * 0.88);
              tone = max(tone, second * fade2 * 0.46);
            }
          }
        }
        return clamp(tone, 0.0, 1.0);
      }
    `;
  }

  if (!window.__INK_SCENES.willow) {
    window.__INK_SCENES.willow = `
      float xCore_willow(float u, float bx, float sway, float t, float phase) {
        return bx + sway * u * u + 0.007 * sin(t * 2.4 + u * 9.0 + phase) * u;
      }

      float frond_willow(vec2 p, float bx, float top, float len,
                         float phase, float dir, float t, float gust,
                         float toneF, float leafS, float hw, float leafN) {
        float s = (top - p.y) / len;
        if (s <= 0.0 || s >= 1.0) return 0.0;

        float sway = gust * (0.35 + 0.65 * sin(t * 0.9 + phase)) * dir;
        sway = clamp(sway, -u_aspect * 0.030, u_aspect * 0.030);

        float xc = xCore_willow(s, bx, sway, t, phase);
        float hwT = hw * (1.0 - 0.45 * s);
        float dCore = abs(p.x - xc);
        float core = (1.0 - smoothstep(hwT * 0.55, hwT, dCore)) * 0.85;

        float uc = s * leafN;
        float k0 = floor(uc);
        float leafAcc = 0.0;
        for (int c = 0; c < 2; c++) {
          float k = k0 - float(c);
          if (k < 0.0 || k > leafN - 0.5) { continue; }

          float hk1 = hash(vec2(k, 10.0 + phase));
          if (hk1 > 0.88) { continue; }

          float uk = (k + 0.5) / leafN;
          float sideK = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;

          vec2 ap = vec2(xCore_willow(uk, bx, sway, t, phase), top - uk * len);
          float hk2 = hash(vec2(k, 20.0 + phase));
          float Lk = leafS * (0.020 + 0.013 * hk2) * (1.0 - 0.35 * uk);
          float slope = 0.55 + 0.30 * hk2;
          vec2 dirL = normalize(vec2(sideK * slope, -1.0));
          vec2 tip = ap + dirL * Lk;

          vec2 ab2 = tip - ap;
          float sp2 = clamp(dot(p - ap, ab2) / dot(ab2, ab2), 0.0, 1.0);
          float dl2 = distance(p, ap + ab2 * sp2);
          float thick = leafS * (0.0034 + 0.0022 * (1.0 - sp2));
          float lf = 1.0 - smoothstep(thick * 0.5, thick, dl2);
          lf *= 0.70 + 0.30 * (1.0 - sp2);
          leafAcc = max(leafAcc, lf);
        }

        float strand = max(core, leafAcc);
        return strand * toneF * (0.72 + 0.28 * (1.0 - s * 0.5));
      }

      float willow_layer(vec2 p, float t, float gustG, float layer) {
        float layerTone = 0.0;
        float lane = floor(((p.x / max(u_aspect, 0.001) - 0.10) / 0.80) * 40.0);

        for (int n = 0; n < 7; n++) {
          float li = lane + float(n) - 3.0;
          if (li < 0.0 || li >= 40.0) { continue; }

          float fi = li + layer * 40.0;
          float h1 = hash(vec2(fi, 1.0));
          float h2 = hash(vec2(fi, 2.0));
          float h3 = hash(vec2(fi, 3.0));
          float h4 = hash(vec2(fi, 4.0));

          float toneF = layer < 0.5 ? 0.34 + h2 * 0.14 : layer < 1.5 ? 0.52 + h2 * 0.16 : layer < 2.5 ? 0.76 + h2 * 0.18 : 0.84 + h3 * 0.12;
          float len   = layer < 0.5 ? 0.16 + h3 * 0.30 : layer < 1.5 ? 0.32 + h3 * 0.30 : layer < 2.5 ? 0.48 + h3 * 0.40 : 0.10 + h3 * 0.14;
          float hw    = layer < 0.5 ? 0.0018 + h4 * 0.0010 : layer < 1.5 ? 0.0024 + h4 * 0.0012 : layer < 2.5 ? 0.0030 + h4 * 0.0014 : 0.0032 + h4 * 0.0012;
          float leafS = layer < 0.5 ? 0.75 + h4 * 0.25 : layer < 1.5 ? 0.95 + h4 * 0.30 : layer < 2.5 ? 1.15 + h4 * 0.40 : 1.30 + h4 * 0.30;
          float leafN = clamp(floor(len * 22.0), 5.0, 18.0);

          float gust  = gustG * (0.80 + 0.10 * layer - 0.05 * layer * layer);
          gust = max(gust, 0.10);

          float laneJitter = 0.15 + h1 * 0.70;
          float bx = u_aspect * (0.10 + ((li + laneJitter) / 40.0) * 0.80);
          float top = 0.98 + h4 * 0.08;
          if (layer > 2.5) top = 0.96 + h4 * 0.05;

          float dir = (h2 - 0.5) * 0.9 + (bx - u_aspect * 0.5) * 0.18;
          float phase = h3 * 6.2831 + li * 0.73;

          layerTone = max(layerTone, frond_willow(p, bx, top, len, phase, dir, t, gust, toneF, leafS, hw, leafN));
        }

        return layerTone;
      }

      float scene_willow(vec2 p, float t) {
        float tone = 0.0;
        float gustG = 0.15 + 0.10 * sin(t * 0.33 - 0.8) + 0.05 * sin(t * 0.85 + 1.4);

        for (int layerIndex = 0; layerIndex < 4; layerIndex++) {
          tone = max(tone, willow_layer(p, t, gustG, float(layerIndex)));
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

      function loadFallback() {
        if (fallbackImages[sceneName]) return;
        const fb = new Image();
        fb.crossOrigin = "anonymous";
        fb.src = getAssetPath(cfg.fallbackSrc);
        fb.onload = () => {
          mediaReady[sceneName] = true;
          draw(performance.now());
        };
        fallbackImages[sceneName] = fb;
      }

      v.addEventListener("error", () => {
        loadFallback();
      });

      v.addEventListener("loadeddata", () => {
        mediaReady[sceneName] = true;
        if (sceneName === "clouds") v.playbackRate = 0.5;
        if (currentActiveVideo === v) v.play().catch(() => loadFallback());
      });
      v.addEventListener("canplay", () => {
        mediaReady[sceneName] = true;
        if (sceneName === "clouds") v.playbackRate = 0.5;
        if (currentActiveVideo === v) v.play().catch(() => loadFallback());
      });

      videoElements[sceneName] = v;
    }
  }

  /* ----------------------------- render ---------------------------- */

  const startTime = performance.now();
  let lastFrame = -1000;
  let canvasVisible = true;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const isMobile = window.innerWidth <= 640;
    const maxDpr = isMobile ? 1.5 : 2.0;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
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

  let rafId = null;
  function startLoop() {
    if (reduced || rafId !== null) return;
    if (!document.hidden && canvasVisible) {
      rafId = requestAnimationFrame(loop);
    }
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function loop(now) {
    rafId = null;
    if (!document.hidden && canvasVisible) {
      if (needsResize) {
        needsResize = false;
        resize();
      }
      if (now - lastFrame >= 33) {
        draw(now);
        lastFrame = now;
      }
      if (!reduced) {
        rafId = requestAnimationFrame(loop);
      }
    }
  }

  let visibilityObserver = null;
  if ("IntersectionObserver" in window) {
    visibilityObserver = new IntersectionObserver(([entry]) => {
      const wasVisible = canvasVisible;
      canvasVisible = entry ? entry.isIntersecting : true;
      if (canvasVisible) lastFrame = -1000;
      updateVideoPlaybackState();
      if (canvasVisible && !wasVisible) startLoop();
      else if (!canvasVisible && wasVisible) stopLoop();
    }, { rootMargin: "80px 0px" });
    visibilityObserver.observe(canvas);
  }

  document.addEventListener("visibilitychange", () => {
    updateVideoPlaybackState();
    if (!document.hidden && canvasVisible) {
      lastFrame = -1000;
      startLoop();
    } else if (document.hidden) {
      stopLoop();
    }
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
  startLoop();
})();
