/* Ink scene · "willow" — photographic crop, 100% real strands.
   Four depth layers (back: pale/thin/short = soft distance feel;
   mid; front: dark/thick/large; plus a crisp dark fringe under the
   top edge). Every frond: hash-random length, thickness, sway.

   Leaves v2 — real willow leaves instead of vertical dashes:
   each leaf is its own short ANGLED segment (pointing outward and
   down like lanceolate willow leaves), attached to the moving
   core, alternating sides cell by cell, with per-leaf random
   length / angle / occasional gaps. Leaf count scales with strand
   length so foliage density is uniform.

   Performance: anchors sit in lightly jittered lanes. Each fragment checks
   only the seven nearby anchors per depth instead of all 160 strands. The
   visible density is unchanged, but the fragment workload is far smaller. */
(function () {
  "use strict";
  window.__INK_SCENES = window.__INK_SCENES || {};
  window.__INK_SCENES.willow = `
    /* core x-position at strand parameter u (0..1), incl. sway+flutter */
    float xCore_willow(float u, float bx, float sway, float t, float phase) {
      return bx + sway * u * u
           + 0.007 * sin(t * 2.4 + u * 9.0 + phase) * u;
    }

    /* One frond: tapered core + individual angled leaves. */
    float frond_willow(vec2 p, float bx, float top, float len,
                       float phase, float dir, float t, float gust,
                       float toneF, float leafS, float hw, float leafN) {
      float s = (top - p.y) / len;
      if (s <= 0.0 || s >= 1.0) return 0.0;

      float sway = gust * (0.35 + 0.65 * sin(t * 0.9 + phase)) * dir;
      sway = clamp(sway, -u_aspect * 0.030, u_aspect * 0.030);

      /* core line, tapering toward the tip */
      float xc = xCore_willow(s, bx, sway, t, phase);
      float hwT = hw * (1.0 - 0.45 * s);
      float dCore = abs(p.x - xc);
      float core = (1.0 - smoothstep(hwT * 0.55, hwT, dCore)) * 0.85;

      /* leaves: one per cell along the strand. a pixel can be
         covered by the leaf of its own cell or the one above (leaves
         point downward), so test two cells.                          */
      float uc = s * leafN;
      float k0 = floor(uc);
      float leafAcc = 0.0;
      for (int c = 0; c < 2; c++) {
        float k = k0 - float(c);
        if (k < 0.0 || k > leafN - 0.5) { continue; }

        float hk1 = hash(vec2(k, 10.0 + phase));
        if (hk1 > 0.88) { continue; }          // occasional natural gap

        float uk = (k + 0.5) / leafN;          // attach parameter
        float sideK = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;

        // attach point rides the moving core
        vec2 ap = vec2(xCore_willow(uk, bx, sway, t, phase),
                       top - uk * len);

        // per-leaf character
        float hk2 = hash(vec2(k, 20.0 + phase));
        float Lk = leafS * (0.020 + 0.013 * hk2) * (1.0 - 0.35 * uk);
        float slope = 0.55 + 0.30 * hk2;       // how far outward
        vec2 dirL = normalize(vec2(sideK * slope, -1.0));
        vec2 tip = ap + dirL * Lk;

        vec2 ab2 = tip - ap;
        float sp2 = clamp(dot(p - ap, ab2) / dot(ab2, ab2), 0.0, 1.0);
        float dl2 = distance(p, ap + ab2 * sp2);
        float thick = leafS * (0.0034 + 0.0022 * (1.0 - sp2));
        float lf = 1.0 - smoothstep(thick * 0.5, thick, dl2);
        lf *= 0.70 + 0.30 * (1.0 - sp2);       // brighter at base
        leafAcc = max(leafAcc, lf);
      }

      float strand = max(core, leafAcc);
      return strand * toneF * (0.72 + 0.28 * (1.0 - s * 0.5));
    }

    float willow_layer(vec2 p, float t, float gustG, float layer) {
      float layerTone = 0.0;
      float lane = floor(
        ((p.x / max(u_aspect, 0.001) - 0.10) / 0.80) * 40.0
      );

      /* A strand can lean by roughly one and a half lanes; leaf tips add
         less than one more. Three neighbours on either side therefore cover
         every strand that can actually reach this pixel. */
      for (int n = 0; n < 7; n++) {
        float li = lane + float(n) - 3.0;
        if (li < 0.0 || li >= 40.0) { continue; }

        float fi = li + layer * 40.0;
        float h1 = hash(vec2(fi, 1.0));
        float h2 = hash(vec2(fi, 2.0));
        float h3 = hash(vec2(fi, 3.0));
        float h4 = hash(vec2(fi, 4.0));

        /* per-layer character */
        float toneF  = layer < 0.5 ? 0.34 + h2 * 0.14
                     : layer < 1.5 ? 0.52 + h2 * 0.16
                     : layer < 2.5 ? 0.76 + h2 * 0.18
                     :               0.84 + h3 * 0.12;
        float len    = layer < 0.5 ? 0.16 + h3 * 0.30
                     : layer < 1.5 ? 0.32 + h3 * 0.30
                     : layer < 2.5 ? 0.48 + h3 * 0.40
                     :               0.10 + h3 * 0.14;
        float hw     = layer < 0.5 ? 0.0018 + h4 * 0.0010
                     : layer < 1.5 ? 0.0024 + h4 * 0.0012
                     : layer < 2.5 ? 0.0030 + h4 * 0.0014
                     :               0.0032 + h4 * 0.0012;
        float leafS  = layer < 0.5 ? 0.75 + h4 * 0.25
                     : layer < 1.5 ? 0.95 + h4 * 0.30
                     : layer < 2.5 ? 1.15 + h4 * 0.40
                     :               1.30 + h4 * 0.30;
        // leaf COUNT scales with strand length -> uniform foliage
        float leafN  = clamp(floor(len * 22.0), 5.0, 18.0);

        float gust   = gustG * (0.80 + 0.10 * layer - 0.05 * layer * layer);
        gust = max(gust, 0.10);

        /* Stratified anchors retain natural spacing while avoiding clusters
           of duplicate strands and wide accidental gaps. */
        float laneJitter = 0.15 + h1 * 0.70;
        float bx = u_aspect
                 * (0.10 + ((li + laneJitter) / 40.0) * 0.80);
        float top = 0.98 + h4 * 0.08;                // hang from the top edge
        if (layer > 2.5) top = 0.96 + h4 * 0.05;     // fringe sits a bit lower

        float dir = (h2 - 0.5) * 0.9
                  + (bx - u_aspect * 0.5) * 0.18;
        float phase = h3 * 6.2831 + li * 0.73;

        layerTone = max(
          layerTone,
          frond_willow(p, bx, top, len, phase, dir,
                       t, gust, toneF, leafS, hw, leafN)
        );
      }

      return layerTone;
    }

    float scene_willow(vec2 p, float t) {
      // Keep the open paper perfectly still; all motion belongs to the fronds.
      float tone = 0.0;
      float gustG = 0.15 + 0.10 * sin(t * 0.33 - 0.8)
                        + 0.05 * sin(t * 0.85 + 1.4);

      for (int layerIndex = 0; layerIndex < 4; layerIndex++) {
        tone = max(
          tone,
          willow_layer(p, t, gustG, float(layerIndex))
        );
      }
      return clamp(tone, 0.0, 1.0);
    }
  `;
})();
