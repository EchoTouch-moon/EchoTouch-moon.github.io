/* Template 03 · Phosphor Terminal
   - phosphor/amber themes (data-theme="amber")
   - typewriter boot line + blinking block caret
   - j/k to move through the directory listing, Enter/-> to open,
     "/" to focus search
   All keyboard helpers respect reduced-motion and don't hijack
   typing inside inputs.                                            */

(function () {
  "use strict";

  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------ theme ------------------------------ */

  function readTheme() {
    try { return localStorage.getItem("phos-theme"); } catch { return null; }
  }
  function writeTheme(theme) {
    try {
      if (theme === "phosphor") localStorage.removeItem("phos-theme");
      else localStorage.setItem("phos-theme", theme);
    } catch { /* ignore */ }
  }

  function applyTheme(theme) {
    if (theme === "amber") root.setAttribute("data-theme", "amber");
    else root.removeAttribute("data-theme");
    document.dispatchEvent(new CustomEvent("phos:themechange", { detail: { theme } }));
  }

  applyTheme(readTheme() || "phosphor");

  const themeForm = document.getElementById("theme-form");
  if (themeForm) {
    const radios = themeForm.querySelectorAll("input[name='theme']");
    const sync = (t) => radios.forEach((r) => { r.checked = r.value === t; });
    document.addEventListener("phos:themechange", (e) => sync(e.detail.theme));
    sync(readTheme() || "phosphor");
    themeForm.addEventListener("change", (e) => {
      writeTheme(e.target.value);
      applyTheme(e.target.value);
    });
  }

  /* --------------------------- boot typing --------------------------- */

  const typed = document.getElementById("typed-line");
  if (typed && !reduced) {
    const full = typed.textContent;
    typed.textContent = "";
    let i = 0;
    (function type() {
      if (i <= full.length) {
        typed.textContent = full.slice(0, i++);
        setTimeout(type, 34);
      }
    })();
  }

  /* ------------------------ keyboard navigation ---------------------- */

  const rows = Array.from(document.querySelectorAll(".dirlist .row a"));
  let idx = rows.findIndex((a) => a.classList.contains("is-active"));
  if (idx < 0) idx = 0;

  function focusRow(i) {
    if (!rows.length) return;
    idx = Math.max(0, Math.min(rows.length - 1, i));
    const a = rows[idx];
    rows.forEach((r) => r.closest(".row")?.classList.remove("focused"));
    a.closest(".row")?.classList.add("focused");
    a.focus({ preventScroll: false });
  }

  function inForm(e) {
    const t = e.target;
    return t instanceof HTMLElement &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  }

  document.addEventListener("keydown", (e) => {
    if (inForm(e) || e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === "/") {
      const search = document.getElementById("search-box");
      if (search) { e.preventDefault(); search.focus(); }
    } else if (e.key === "j") {
      focusRow(idx + 1);
    } else if (e.key === "k") {
      focusRow(idx - 1);
    }
  });

  /* --------------------------- back to top --------------------------- */

  const toTop = document.getElementById("to-top");
  if (toTop) {
    const toggleTop = () => {
      // show past ~1.2 viewports, or past 60% of a short page's range
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const threshold = Math.min(window.innerHeight * 1.2, max * 0.6);
      toTop.classList.toggle("visible", window.scrollY > threshold);
    };
    window.addEventListener("scroll", toggleTop, { passive: true });
    toggleTop();
    toTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    });
  }

  /* ------------------- statusbar: vim-style scroll % ------------------ */

  const scrollPct = document.getElementById("scroll-pct");
  if (scrollPct) {
    const updatePct = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) { scrollPct.textContent = "All"; return; }
      const p = window.scrollY / max;
      if (p <= 0.001) scrollPct.textContent = "Top";
      else if (p >= 0.999) scrollPct.textContent = "Bot";
      else scrollPct.textContent = Math.round(p * 100) + "%";
    };
    window.addEventListener("scroll", updatePct, { passive: true });
    updatePct();
  }

  /* --------------------------- copy blocks --------------------------- */

  function wireCopyButtons() {
    document.querySelectorAll(".termblock pre").forEach((pre) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.textContent = "copy";
      btn.setAttribute("aria-label", "copy code");
      pre.style.position = "relative";
      pre.appendChild(btn);
      btn.addEventListener("click", () => {
        navigator.clipboard.writeText(pre.innerText).then(() => {
          btn.textContent = "copied \u2713";
          btn.classList.add("done");
          setTimeout(() => {
            btn.textContent = "copy";
            btn.classList.remove("done");
          }, 1400);
        }).catch(() => { /* clipboard unavailable */ });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireCopyButtons);
  } else {
    wireCopyButtons();
  }
})();
