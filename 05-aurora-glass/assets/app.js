/* Template 05 · Afterglow
   - gradient reading-progress bar (post pages)
   - staggered scroll reveals via IntersectionObserver
   - live read-time estimate from the article's word count
   Deliberately tiny; the aurora and glass are pure CSS.        */

(function () {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* --------------------- reading progress --------------------- */

  const bar = document.querySelector(".reading-progress");
  if (bar) {
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 1;
      bar.style.setProperty("--progress", String(p));
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  /* --------------------- heading anchors --------------------- */
  // Wired before the reveal block below, which returns early when
  // there are no .reveal targets or under reduced motion.

  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  document.querySelectorAll("article.prose h2, article.prose h3").forEach((heading) => {
    if (!heading.id) heading.id = slugify(heading.textContent);
    if (!heading.id || heading.querySelector(".anchor")) return;
    const link = document.createElement("a");
    link.className = "anchor";
    link.href = `#${heading.id}`;
    link.setAttribute("aria-label", "Link to this section");
    link.textContent = "#";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(heading.id)
        .scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    });
    heading.appendChild(link);
  });

  /* ---------------------- copy buttons ----------------------- */

  document.querySelectorAll("article.prose pre").forEach((pre) => {
    pre.style.position = "relative";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "copy";
    btn.setAttribute("aria-label", "copy code");
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
    pre.appendChild(btn);
  });

  /* ----------------------- back to top ----------------------- */

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

  /* ----------------------- scroll reveal ---------------------- */

  const targets = document.querySelectorAll(".reveal");
  // no early return here: read-time / aurora / card glow below must
  // still run for reduced-motion users and pages without reveals
  const simpleReveal = !targets.length || reduced || !("IntersectionObserver" in window);
  if (simpleReveal) {
    targets.forEach((el) => el.classList.add("in"));
  }
  if (!simpleReveal) {

  // Cards get a small cascade based on their position among siblings.
  targets.forEach((el) => {
    if (el.classList.contains("card")) {
      const siblings = Array.from(el.parentElement.children);
      el.style.setProperty("--d", `${Math.min(siblings.indexOf(el), 7) * 70}ms`);
    }
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
  );
    targets.forEach((el) => io.observe(el));
  }

  /* ------------------------- read time ------------------------ */

  const prose = document.querySelector("article.prose");
  const timeSlot = document.getElementById("read-time");
  if (prose && timeSlot) {
    const words = prose.textContent.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.round(words / 210));
    timeSlot.textContent = `${minutes} min read`;
  }

  /* --------------------- aurora parallax -----------------------
     The sky leans gently toward the cursor. CSS reads --arx/--ary
     on .aurora; each blob applies its own factor. The `translate`
     property composes with the existing transform keyframes.     */

  const aurora = document.querySelector(".aurora");
  if (aurora && !reduced && window.matchMedia("(hover: hover)").matches) {
    let pending = null;
    window.addEventListener("pointermove", (e) => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = null;
        const x = (e.clientX / window.innerWidth) * 2 - 1;   // -1..1
        const y = (e.clientY / window.innerHeight) * 2 - 1;
        document.documentElement.style.setProperty("--arx", x.toFixed(3));
        document.documentElement.style.setProperty("--ary", y.toFixed(3));
      });
    }, { passive: true });
  }

  /* -------------------- card cursor glow -----------------------
     Each card carries a soft radial highlight that follows the
     pointer inside it; CSS positions it from --cx/--cy.          */

  if (window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".card").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--cx", `${e.clientX - r.left}px`);
        card.style.setProperty("--cy", `${e.clientY - r.top}px`);
      }, { passive: true });
    });
  }
})();
