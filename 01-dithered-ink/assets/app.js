/* Template 01 · Dithered Ink
   - light/dark/system theme with localStorage persistence
     (radio group in the footer, ink:themechange event for the
     WebGL banner in dither.js)
   - adds an "N years old" badge under article dates via data-date
   The banner rendering itself lives in assets/dither.js.          */

(function () {
  "use strict";

  const root = document.documentElement;

  /* ------------------------------------------------ theme ---- */

  function readTheme() {
    // URL override wins (?theme=light / ?theme=dark) — handy for
    // sharing theme-specific screenshots; then localStorage.
    try {
      const q = new URLSearchParams(location.search).get("theme");
      if (q === "light" || q === "dark") return q;
    } catch { /* ignore */ }
    try { return localStorage.getItem("ink-theme"); } catch { return null; }
  }
  function writeTheme(theme) {
    try {
      if (theme === "system") localStorage.removeItem("ink-theme");
      else localStorage.setItem("ink-theme", theme);
    } catch { /* storage unavailable: theme stays in-memory */ }
  }

  function applyTheme(theme) {
    if (theme !== "light" && theme !== "dark") theme = "system";
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    document.dispatchEvent(new CustomEvent("ink:themechange", { detail: { theme } }));
  }

  applyTheme(readTheme() || "system");

  /* ------------------------------------ theme radios ---- */

  const themeForm = document.getElementById("theme-form");
  if (themeForm) {
    const radios = themeForm.querySelectorAll("input[name='theme']");
    function syncRadios(theme) {
      radios.forEach((r) => { r.checked = r.value === theme; });
    }
    document.addEventListener("ink:themechange", (e) => syncRadios(e.detail.theme));
    syncRadios(readTheme() || "system");
    themeForm.addEventListener("change", (e) => {
      writeTheme(e.target.value);
      applyTheme(e.target.value);
    });
  }

  /* ------------------------------------ scene radios ---- */

  const sceneForm = document.getElementById("scene-form");
  if (sceneForm) {
    const radios = sceneForm.querySelectorAll("input[name='scene']");
    function readActiveScene() {
      const canvas = document.getElementById("ink-canvas");
      if (canvas && canvas.dataset.activeScene) return canvas.dataset.activeScene;
      try {
        const q = new URLSearchParams(location.search).get("scene");
        if (q) return q;
      } catch {}
      try {
        const s = sessionStorage.getItem("ink-banner-scene");
        if (s) return s;
      } catch {}
      return "auto";
    }
    function syncSceneRadios(scene) {
      radios.forEach((r) => { r.checked = r.value === scene; });
    }
    syncSceneRadios(readActiveScene());
    // Also sync if canvas activeScene was determined after script run
    window.addEventListener("DOMContentLoaded", () => {
      syncSceneRadios(readActiveScene());
    });
    sceneForm.addEventListener("change", (e) => {
      const scene = e.target.value;
      document.dispatchEvent(new CustomEvent("ink:scenechange", { detail: { scene } }));
    });
  }

  /* --------------------------------------- age warning ---- */

  document.querySelectorAll("p[data-date]").forEach((el) => {
    const pub = new Date(el.dataset.date);
    if (Number.isNaN(pub.getTime())) return;
    const days = (Date.now() - pub.getTime()) / 86400000;
    if (days >= 365) {
      const years = Math.floor(days / 365);
      const badge = document.createElement("span");
      badge.className = "age-badge";
      badge.textContent = `this piece is ${years} year${years === 1 ? "" : "s"} old`;
      el.appendChild(document.createTextNode(" "));
      el.appendChild(badge);
    }
  });

  /* ------------------------------------ category tabs ---- */

  const categoryTabs = document.querySelector(".category-tabs");
  if (categoryTabs) {
    const tabBtns = categoryTabs.querySelectorAll(".tab-btn");
    const entries = document.querySelectorAll("#entry-list .entry");

    function applyCategory(cat, updateUrl) {
      const activeCat = cat || "all";
      tabBtns.forEach((btn) => {
        const isActive = (btn.dataset.filter === activeCat) || (activeCat === "all" && btn.dataset.filter === "all");
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      entries.forEach((entry) => {
        const match = activeCat === "all" || entry.dataset.category === activeCat;
        entry.style.display = match ? "" : "none";
      });

      // Update active state in top navigation if applicable
      document.querySelectorAll("nav.navigation a[data-nav-filter]").forEach((navLink) => {
        const isCurrent = navLink.dataset.navFilter === activeCat;
        if (isCurrent) navLink.setAttribute("aria-current", "page");
        else navLink.removeAttribute("aria-current");
      });

      if (updateUrl && history.replaceState) {
        const url = new URL(location.href);
        if (activeCat === "all") url.searchParams.delete("cat");
        else url.searchParams.set("cat", activeCat);
        history.replaceState(null, "", url.toString());
      }
    }

    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        applyCategory(btn.dataset.filter, true);
      });
    });

    // Intercept top navigation category links when on the homepage
    document.querySelectorAll("nav.navigation a[data-nav-filter]").forEach((navLink) => {
      navLink.addEventListener("click", (e) => {
        e.preventDefault();
        applyCategory(navLink.dataset.navFilter, true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    // Initial check from URL ?cat=
    try {
      const q = new URLSearchParams(location.search).get("cat");
      if (q) applyCategory(q, false);
    } catch {}
  }
})();

