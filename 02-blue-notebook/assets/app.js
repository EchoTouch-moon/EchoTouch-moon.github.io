/* Template 02 · The Blue Notebook — v2 behaviors
   - data-initial-load teardown → arms the 300ms theme cross-fade
   - light/dark/system theme (attribute + light-dark() CSS)
   - copy-as-markdown: click, or Cmd/Ctrl+C with nothing selected
   - "N years old" date badge
   - ≈N min read byline
   - hover-reveal heading anchors with smooth scroll
   - footnote ↔ reference hover pairing
   - code block copy buttons
   - back-to-top pill
   - footer almanac: local time + day-part greeting
   - image fade-in on decode                                          */

(function () {
  "use strict";

  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* the head script set data-initial-load to suppress first-paint
     transitions; drop it after paint so the theme can fade */
  setTimeout(() => root.removeAttribute("data-initial-load"), 0);

  /* ------------------------------ theme ------------------------------ */

  function readTheme() {
    try { return localStorage.getItem("notebook-theme"); } catch { return null; }
  }
  function writeTheme(theme) {
    try {
      if (theme === "system") localStorage.removeItem("notebook-theme");
      else localStorage.setItem("notebook-theme", theme);
    } catch { /* ignore */ }
  }

  function applyTheme(theme) {
    if (theme !== "light" && theme !== "dark") theme = "system";
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    document.dispatchEvent(new CustomEvent("nb:themechange", { detail: { theme } }));
  }

  const themeForm = document.getElementById("theme-form");
  if (themeForm) {
    const radios = themeForm.querySelectorAll("input[name='theme']");
    const sync = (t) => radios.forEach((r) => { r.checked = r.value === t; });
    sync(readTheme() || "system");
    themeForm.addEventListener("change", (e) => {
      writeTheme(e.target.value);
      applyTheme(e.target.value);
    });
  }

  /* ------------------------- copy as markdown ------------------------ */

  const link = document.getElementById("copy-markdown");
  const article = document.querySelector("main article");

  function flash(message) {
    let note = document.querySelector(".flash-note");
    if (!note) {
      note = document.createElement("div");
      note.className = "flash-note";
      document.body.appendChild(note);
    }
    note.textContent = message;
    requestAnimationFrame(() => { note.style.opacity = "1"; });
    setTimeout(() => { note.style.opacity = "0"; }, 1500);
  }

  async function copyAsMarkdown() {
    if (!article) return;

    // Generated posts expose their exact published Markdown source. This is
    // more faithful than reverse-engineering Markdown from rendered HTML.
    if (link?.dataset.source) {
      try {
        const response = await fetch(link.dataset.source);
        if (!response.ok) throw new Error(`source returned ${response.status}`);
        await navigator.clipboard.writeText(await response.text());
        flash("copied exact markdown source");
        return;
      } catch { /* legacy/file:// pages fall back to readable plain text */ }
    }

    const clone = article.cloneNode(true);
    clone.querySelectorAll(".post-nav, .post-date, .markdown-links, .tags, .copy-btn, .anchor, h1").forEach((n) => n.remove());
    clone.querySelectorAll("h2, h3").forEach((h) => {
      const level = h.tagName === "H2" ? "##" : "###";
      h.textContent = `\n${level} ${h.textContent}\n`;
    });
    const title = document.querySelector("article h1")?.innerText || "";
    const text = `# ${title}\n\n` + clone.innerText.trim();
    try {
      await navigator.clipboard.writeText(text);
      flash("copied to clipboard as markdown");
    } catch {
      flash("clipboard unavailable in this browser");
    }
  }

  if (link && article) {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      copyAsMarkdown();
    });
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        if (String(window.getSelection()).length === 0) copyAsMarkdown();
      }
    });
  }

  /* --------------------------- age warning --------------------------- */

  document.querySelectorAll("p[data-date]").forEach((el) => {
    const pub = new Date(el.dataset.date);
    if (Number.isNaN(pub.getTime())) return;
    const days = (Date.now() - pub.getTime()) / 86400000;
    if (days >= 365) {
      const years = Math.floor(days / 365);
      const badge = document.createElement("span");
      badge.className = "date-warning";
      badge.textContent = `— this article is ${years} year${years === 1 ? "" : "s"} old.`;
      el.appendChild(document.createTextNode(" "));
      el.appendChild(badge);
    }
  });

  /* ---------------------------- reading time ------------------------- */

  if (article) {
    const slot = document.getElementById("read-time");
    if (slot && !slot.textContent.includes("min")) {
      const words = article.textContent.trim().split(/\s+/).length;
      slot.textContent = `· ≈ ${Math.max(1, Math.round(words / 220))} min read`;
    }
  }

  /* ------------------------- heading anchors ------------------------- */

  function slugify(text) {
    return text.toLowerCase().trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  document.querySelectorAll("main article h2, main article h3").forEach((h) => {
    if (h.closest(".entry-overview")) return;   // listing titles, not prose
    if (!h.id) h.id = slugify(h.textContent) || h.tagName.toLowerCase();
    if (h.querySelector(".anchor")) return;
    const a = document.createElement("a");
    a.className = "anchor";
    a.href = "#" + h.id;
    a.textContent = "#";
    a.setAttribute("aria-label", "link to this section");
    h.appendChild(a);
    a.addEventListener("click", (e) => {
      e.preventDefault();
      history.replaceState(null, "", a.href);
      h.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    });
  });

  /* ------------------- footnote ↔ reference pairing ------------------ */

  // Hand-written pages used data-fn. markdown-it-footnote uses matching
  // fnrefN/fnN ids, so normalize either form before wiring the interaction.
  const refs = Array.from(document.querySelectorAll("sup a[data-fn], .footnote-ref a[href^='#fn']"));
  const notes = Array.from(document.querySelectorAll(".footnotes li[data-fn], .footnotes li[id^='fn']"));
  refs.forEach((ref, index) => {
    if (!ref.dataset.fn) {
      const match = (ref.getAttribute("href") || "").match(/^#fn(\d+)/);
      ref.dataset.fn = match?.[1] || String(index + 1);
    }
  });
  notes.forEach((note, index) => {
    if (!note.dataset.fn) {
      const match = (note.id || "").match(/^fn(\d+)/);
      note.dataset.fn = match?.[1] || String(index + 1);
    }
  });
  if (refs.length && notes.length) {
    function pair(selector, attr, on) {
      const target = document.querySelector(`${selector}[data-fn="${attr}"]`);
      if (target) target.classList.toggle("lit", on);
    }
    function dimAll(on) {
      document.querySelector(".footnotes")?.classList.toggle("dim", on);
      refs.forEach((r) => r.classList.toggle("dim-other", false));
    }
    refs.forEach((ref) => {
      ref.addEventListener("mouseenter", () => {
        dimAll(true);
        pair(".footnotes li", ref.dataset.fn, true);
      });
      ref.addEventListener("mouseleave", () => {
        dimAll(false);
        document.querySelectorAll(".footnotes li.lit").forEach((li) => li.classList.remove("lit"));
      });
    });
    notes.forEach((li) => {
      li.addEventListener("mouseenter", () => {
        const ref = document.querySelector(`sup a[data-fn="${li.dataset.fn}"]`);
        if (ref) ref.classList.add("lit");
      });
      li.addEventListener("mouseleave", () => {
        document.querySelectorAll("sup a.lit").forEach((r) => r.classList.remove("lit"));
      });
    });
  }

  /* ------------------------- code copy buttons ----------------------- */

  document.querySelectorAll("main article pre").forEach((pre) => {
    if (pre.querySelector(".copy-btn")) return;
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.type = "button";
    btn.textContent = "copy";
    btn.setAttribute("aria-label", "copy code");
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(pre.querySelector("code")?.innerText ?? pre.innerText);
        btn.textContent = "copied ✓";
        btn.classList.add("ok");
      } catch {
        btn.textContent = "failed";
      }
      setTimeout(() => {
        btn.textContent = "copy";
        btn.classList.remove("ok");
      }, 1400);
    });
    pre.appendChild(btn);
  });

  /* ---------------------------- back to top -------------------------- */

  const toTop = document.querySelector(".to-top");
  if (toTop) {
    const update = () => {
      toTop.classList.toggle("visible", window.scrollY > window.innerHeight * 1.2);
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
    toTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    });
  }

  /* ------------------------ footer almanac --------------------------- */

  const clock = document.getElementById("local-time");
  const greet = document.getElementById("greeting");
  if (clock) {
    const tick = () => {
      const now = new Date();
      clock.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (greet) {
        greet.textContent =
          ["good night", "good morning", "good afternoon", "good evening"][Math.floor(now.getHours() / 6)];
      }
    };
    tick();
    setInterval(tick, 30000);
  }

  /* --------------------------- image fade-in ------------------------- */

  document.querySelectorAll("main article img").forEach((img) => {
    if (img.complete) img.classList.add("loaded");
    else img.addEventListener("load", () => img.classList.add("loaded"), { once: true });
  });
})();
