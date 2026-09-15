/* Ink scene · "rain" — sparse rain falling onto a calm water surface.
   The water itself is deliberately stable: only a few broken hairlines
   describe the plane. Motion is confined to falling drops, tiny impact
   splashes and expanding ripples, so scrolling never has to resample a
   full canvas of animated mid-tone noise. */
(function () {
  "use strict";
  window.__INK_SCENES = window.__INK_SCENES || {};
  window.__INK_SCENES.rain = `
    float rain_segment(vec2 p, vec2 a, vec2 b, float width) {
      vec2 ab = b - a;
      float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.000001), 0.0, 1.0);
      float d = length(p - (a + ab * h));
      return 1.0 - smoothstep(width, width * 1.8, d);
    }

    float rain_streak(vec2 p, vec2 tail, vec2 head) {
      vec2 axis = head - tail;
      float h = clamp(
        dot(p - tail, axis) / max(dot(axis, axis), 0.000001),
        0.0,
        1.0
      );
      float headBias = smoothstep(0.0, 1.0, h);
      float width = mix(0.0010, 0.0035, headBias);
      float across = 1.0 - smoothstep(
        width,
        width * 1.9,
        length(p - (tail + axis * h))
      );
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

      /* A calm water plane: three sparse, motionless ink threads.
         Unlike the old fog field, these never change brightness. */
      for (int j = 0; j < 3; j++) {
        float fj = float(j);
        float bandY = 0.22 + fj * 0.23
          + 0.004 * sin(p.x * (1.35 + fj * 0.19) + fj * 2.4);
        float sx = p.x * (1.45 + fj * 0.12) + fj * 5.17;
        float cell = floor(sx);
        float within = fract(sx);
        float present = step(0.62, hash(vec2(cell, 51.0 + fj * 7.0)));
        float ends = smoothstep(0.08, 0.22, within)
          * (1.0 - smoothstep(0.70, 0.94, within));
        float thread = 1.0 - smoothstep(0.0025, 0.0065, abs(p.y - bandY));
        tone = max(tone, thread * ends * present * 0.30);
      }

      /* Independent drops. Higher intensity activates more lanes, shortens
         the physical fall and lengthens the motion trail. The cycle clock
         itself stays stable so auto weather changes never make drops jump. */
      for (int i = 0; i < 48; i++) {
        float fi = float(i);
        float heavyBoost = smoothstep(0.55, 0.85, inten);
        float activeChance = min(
          0.98,
          0.14 + 0.82 * inten + 0.36 * heavyBoost
        );
        if (hash(vec2(fi, 91.0)) > activeChance) { continue; }

        float cycleLength = 2.20 + hash(vec2(fi, 83.0)) * 1.25;
        float clock = t + hash(vec2(fi, 79.0)) * cycleLength;
        float cycle = floor(clock / cycleLength);
        float local = mod(clock, cycleLength);

        /* Every cycle gets a new landing point and a subtly different drop. */
        float rx = hash(vec2(fi, 11.0) + cycle * 7.31);
        float ry = hash(vec2(fi, 17.0) + cycle * 5.73);
        float rs = hash(vec2(fi, 23.0) + cycle * 3.91);
        float rl = hash(vec2(fi, 29.0) + cycle * 8.17);
        float rw = hash(vec2(fi, 37.0) + cycle * 6.43);

        float landY = 0.12 + ry * 0.72;
        float landX = 0.08 + rx * max(u_aspect - 0.16, 0.1);
        float perspective = mix(0.58, 1.0, 1.0 - landY);
        float wind = 0.12 + rw * 0.06 + inten * 0.05;
        float fallTime = mix(0.64, 0.34, inten)
          + rs * mix(0.18, 0.10, inten);

        if (local < fallTime) {
          /* A true head-heavy rain mark: the upper tail is thin and faint,
             then both width and ink density build toward the falling head. */
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

          /* The impact is brief: a pin point, a central crown and two
             separated droplets. Nothing sits at the landing point early. */
          if (age < 0.19) {
            float splashPhase = age / 0.19;
            float splashFade = 1.0 - smoothstep(0.50, 1.0, splashPhase);
            float point = rain_dot(p, hit, 0.0070)
              * (1.0 - smoothstep(0.0, 0.12, age));
            float crownHeight = 0.052 * perspective * (1.0 - splashPhase);
            float crown = rain_segment(
              p,
              hit,
              hit + vec2(0.0, crownHeight),
              0.0030
            ) * splashFade;
            float arc = sin(splashPhase * 3.14159265);
            vec2 leftDrop = hit + vec2(-0.030 * splashPhase, 0.038 * arc) * perspective;
            vec2 rightDrop = hit + vec2(0.034 * splashPhase, 0.032 * arc) * perspective;
            float spray = max(
              rain_dot(p, leftDrop, 0.0038),
              rain_dot(p, rightDrop, 0.0035)
            ) * splashFade;
            tone = max(tone, max(point * 0.95, max(crown, spray) * 0.82));
          }

          /* Two clean perspective rings establish the water surface.
             They expand continuously and fade before the next cycle. */
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
})();
