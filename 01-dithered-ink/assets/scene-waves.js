/* Ink scene · "waves" — Oceanic drone wave footage (directly inspired by dark.ronacher.eu).
   Uses real-life ocean wave footage with Atkinson 1-bit dithering:
   - In dark mode: frothy white wave crests form delicate cream stipple foam on black water.
   - In light mode: Y-axis is inverted so breaking foam lands at the bottom, dissolving
     into the page, while deep ocean water forms rich carbon ink stipple. */
(function () {
  "use strict";
  window.__INK_SCENES = window.__INK_SCENES || {};
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
})();
