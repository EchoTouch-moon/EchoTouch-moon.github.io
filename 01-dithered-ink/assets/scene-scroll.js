/* Ink scene · "scroll" — Masterpiece Handscrolls (名画长卷·千里江山 & 清明上河).
   High-precision 1-bit Atkinson dithered woodblock handscroll presentation.
   Features:
   1. Default Masterpiece: Wang Ximeng's 《千里江山图》 (A Thousand Li of Rivers and Mountains).
   2. Alternate Masterpiece: Zhang Zeduan's 《清明上河图》 (Along the River During Qingming Festival).
   3. Upright vertical orientation: Mountain peaks & sky at the top, river & foothills at the bottom.
   4. Horizontal smooth gliding presentation (左右徐徐展卷卧游).
   5. Interactive pointer drag & toggle. */
(function () {
  "use strict";
  window.__INK_SCENES = window.__INK_SCENES || {};
  window.__INK_SCENES.scroll = `
    float scene_scroll(vec2 p, float t) {
      vec2 frag = gl_FragCoord.xy;
      vec2 uv = frag / u_res;

      // Coordinate mapping:
      // In standard WebGL texture coordinates (UNPACK_FLIP_Y_WEBGL = false):
      // texCoord.y = 0.0 samples Row 0 of the JPEG (the sky & mountain peaks).
      // texCoord.y = 1.0 samples Row 340 of the JPEG (the water & riverbank).
      // On screen, uv.y = 1.0 is the top of the canvas, uv.y = 0.0 is the bottom.
      // Therefore, texCoord.y = (1.0 - uv.y) ensures peaks point UP at the top of the canvas,
      // and water/ground rests naturally at the bottom!
      vec2 texCoord = vec2(
        u_texRect.x + uv.x * u_texRect.z,
        1.0 - uv.y
      );
      texCoord = clamp(texCoord, 0.0, 1.0);

      vec4 col = texture2D(u_tex, texCoord);
      float stroke = col.r; // 0.0 is background silk/paper, 1.0 is dark ink line

      // Gentle edge fade at extreme borders
      float edgeFade = 1.0;
      if (uv.y < 0.03) edgeFade *= smoothstep(0.0, 0.03, uv.y);
      if (uv.y > 0.97) edgeFade *= smoothstep(1.0, 0.97, uv.y);

      return clamp(stroke * edgeFade, 0.0, 1.0);
    }
  `;
})();
