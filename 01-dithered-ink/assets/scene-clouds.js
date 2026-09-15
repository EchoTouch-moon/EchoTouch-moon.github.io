/* Ink scene · "clouds" — High-definition cumulus cloud sea timelapse.
   High-contrast 1080p footage with Atkinson 1-bit dithering:
   - In dark mode: luminous billowing cloud masses roll across the night sky.
   - In light mode: clouds dissolve into clean paper, while deep sky forms rich ink stipple.
   - S-curve contrast expansion sculpts crisp, three-dimensional cloud contours. */
(function () {
  "use strict";
  window.__INK_SCENES = window.__INK_SCENES || {};
  window.__INK_SCENES.clouds = `
    float scene_clouds(vec2 p, float t) {
      vec2 frag = gl_FragCoord.xy;
      vec2 uv = frag / u_res;
      vec2 sampleCoord = vec2(uv.x, mix(uv.y, 1.0 - uv.y, u_isLight));
      vec2 texCoord = u_texRect.xy + sampleCoord * u_texRect.zw;
      vec4 col = texture2D(u_tex, texCoord);
      float gray = col.r;

      // High-definition contrast expansion & smooth S-curve
      // eliminates diffuse blur and sculpts crisp, billowing cumulus contours
      float sharp = clamp((gray - 0.20) / 0.70, 0.0, 1.0);
      sharp = sharp * sharp * (3.0 - 2.0 * sharp);

      return clamp(mix(sharp, 1.0 - sharp, u_isLight), 0.0, 1.0);
    }
  `;
})();
