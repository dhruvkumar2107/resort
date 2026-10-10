/* ==========================================================================
   Akshaya Milan — Site interactions
   ========================================================================== */
(function () {
  "use strict";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* ---------- Current year ---------- */
  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

  /* ---------- Header shadow on scroll ---------- */
  const header = $(".site-header");
  const onScroll = () => {
    if (header) header.classList.toggle("scrolled", window.scrollY > 12);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Mobile navigation ---------- */
  const body = document.body;
  const toggle = $(".nav-toggle");
  let scrim = $(".nav-scrim");
  if (toggle && !scrim) {
    scrim = document.createElement("div");
    scrim.className = "nav-scrim";
    body.appendChild(scrim);
  }
  const closeNav = () => {
    body.classList.remove("nav-open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  };
  const openNav = () => {
    body.classList.add("nav-open");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
  };
  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () =>
      body.classList.contains("nav-open") ? closeNav() : openNav()
    );
  }
  if (scrim) scrim.addEventListener("click", closeNav);
  $$(".nav-links a").forEach((a) => a.addEventListener("click", closeNav));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeNav();
      closeLightbox();
    }
  });

  /* ---------- Hero slideshow ---------- */
  const slides = $$(".hero-slide");
  const dots = $$(".hero-dots button");
  if (slides.length > 1) {
    let idx = 0;
    let timer;
    const go = (n) => {
      slides[idx].classList.remove("active");
      dots[idx] && dots[idx].classList.remove("active");
      idx = (n + slides.length) % slides.length;
      slides[idx].classList.add("active");
      dots[idx] && dots[idx].classList.add("active");
    };
    const start = () => {
      timer = setInterval(() => go(idx + 1), 6000);
    };
    dots.forEach((d, i) =>
      d.addEventListener("click", () => {
        clearInterval(timer);
        go(i);
        start();
      })
    );
    start();
  }

  /* ---------- Reveal on scroll ---------- */
  const revealEls = $$(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el, i) => {
      el.style.transitionDelay = (i % 4) * 60 + "ms";
      io.observe(el);
    });
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  /* ---------- Gallery filter ---------- */
  const filterBtns = $$(".filter-btn");
  const galleryItems = $$(".gallery-item");
  if (filterBtns.length) {
    filterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        filterBtns.forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        const cat = btn.dataset.filter;
        galleryItems.forEach((item) => {
          const show = cat === "all" || item.dataset.category === cat;
          item.classList.toggle("hide", !show);
        });
      });
    });
  }

  /* ---------- Lightbox ---------- */
  const lightbox = $(".lightbox");
  let lbIndex = 0;
  let visibleItems = [];
  function renderLightbox() {
    if (!lightbox || !visibleItems.length) return;
    const item = visibleItems[lbIndex];
    const img = $("img", lightbox);
    const caption = $(".lightbox-caption", lightbox);
    img.src = item.dataset.full || $("img", item).src;
    img.alt = $("img", item).alt;
    if (caption) caption.textContent = $("img", item).alt;
  }
  function openLightbox(item) {
    if (!lightbox) return;
    visibleItems = galleryItems.filter((i) => !i.classList.contains("hide"));
    lbIndex = visibleItems.indexOf(item);
    lightbox.classList.add("open");
    body.style.overflow = "hidden";
    renderLightbox();
    $(".lightbox-close", lightbox).focus();
  }
  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove("open");
    body.style.overflow = "";
  }
  function step(delta) {
    if (!visibleItems.length) return;
    lbIndex = (lbIndex + delta + visibleItems.length) % visibleItems.length;
    renderLightbox();
  }
  galleryItems.forEach((item) => {
    item.addEventListener("click", () => openLightbox(item));
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLightbox(item);
      }
    });
  });
  if (lightbox) {
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) closeLightbox();
    });
    $(".lightbox-close", lightbox).addEventListener("click", closeLightbox);
    $(".lightbox-prev", lightbox).addEventListener("click", (e) => {
      e.stopPropagation();
      step(-1);
    });
    $(".lightbox-next", lightbox).addEventListener("click", (e) => {
      e.stopPropagation();
      step(1);
    });
    document.addEventListener("keydown", (e) => {
      if (!lightbox.classList.contains("open")) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });
  }

  /* ---------- Enquiry delivery (WhatsApp — no backend required) ---------- */
  const WA_NUMBER = "919845691995";
  const FIELD_LABELS = {
    name: "Name", phone: "Phone", email: "Email", city: "City",
    event_type: "Event type", date: "Event date", guests: "Guests",
    time: "Preferred time", space: "Preferred space", services: "Services",
    notes: "Notes", source: "Heard about us", package: "Preferred package",
    message: "Message"
  };
  function collectFormText(form) {
    const grouped = {};
    $$("input, select, textarea", form).forEach((el) => {
      const key = el.name;
      if (!key) return;
      if (el.type === "checkbox") {
        if (el.checked) (grouped[key] = grouped[key] || []).push(el.value || "Yes");
        return;
      }
      if (el.type === "radio") {
        if (el.checked) grouped[key] = [el.value];
        return;
      }
      const val = (el.value || "").trim();
      if (val) grouped[key] = [val];
    });
    return Object.keys(grouped)
      .map((k) => (FIELD_LABELS[k] || k) + ": " + grouped[k].join(", "))
      .join("\n");
  }
  function whatsappHref(form, intro) {
    const body =
      (intro || "Hello Akshaya Milan, I would like to enquire about hosting an event.") +
      "\n\n" +
      collectFormText(form) +
      "\n\n(Sent from the Akshaya Milan website)";
    return "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(body);
  }
  function revealSuccess(form, href) {
    const success =
      (form.parentElement && form.parentElement.querySelector(".form-success")) ||
      $(".form-success");
    form.style.display = "none";
    if (success) {
      const link = $("[data-wa-link]", success);
      if (link && href) link.href = href;
      success.classList.add("show");
      success.setAttribute("tabindex", "-1");
      success.focus();
      success.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  /* ---------- Generic form validation + submit ---------- */
  function validateField(field) {
    const input = $("input, select, textarea", field);
    if (!input) return true;
    const wrap = input.closest(".field") || field;
    let ok = true;
    if (input.hasAttribute("required")) {
      if (input.type === "checkbox") ok = input.checked;
      else ok = input.value.trim() !== "";
    }
    if (ok && input.type === "email" && input.value.trim())
      ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
    if (ok && input.type === "tel" && input.value.trim())
      ok = /^[+()\-\s\d]{7,}$/.test(input.value.trim());
    wrap.classList.toggle("invalid", !ok);
    return ok;
  }

  $$(".js-form").forEach((form) => {
    const fields = $$(".field", form);
    fields.forEach((field) => {
      const input = $("input, select, textarea", field);
      if (!input) return;
      input.addEventListener("blur", () => validateField(field));
      input.addEventListener("input", () => {
        if (field.classList.contains("invalid")) validateField(field);
      });
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      let valid = true;
      fields.forEach((f) => {
        if (!validateField(f)) valid = false;
      });
      if (!valid) {
        const first = $(".field.invalid input, .field.invalid select, .field.invalid textarea", form);
        if (first) first.focus();
        return;
      }
      const href = whatsappHref(form);
      revealSuccess(form, href);
      const win = window.open(href, "_blank", "noopener");
      if (!win) window.location.href = href;
    });
  });

  /* ---------- Multi-step enquiry ---------- */
  const stepper = $(".js-stepper");
  if (stepper) {
    const panels = $$(".step-panel", stepper);
    const stepDots = $$(".step-dot", stepper);
    const prevBtn = $(".js-prev", stepper);
    const nextBtn = $(".js-next", stepper);
    const submitBtn = $(".js-submit", stepper);
    let current = 0;

    function paint() {
      panels.forEach((p, i) => p.classList.toggle("active", i === current));
      stepDots.forEach((d, i) => {
        d.classList.toggle("active", i === current);
        d.classList.toggle("done", i < current);
      });
      if (prevBtn) prevBtn.hidden = current === 0;
      if (nextBtn) nextBtn.hidden = current === panels.length - 1;
      if (submitBtn) submitBtn.hidden = current !== panels.length - 1;
      const heading = $(".stepper-card", stepper);
      if (heading) heading.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function validateStep() {
      const fields = $$(".field", panels[current]);
      let valid = true;
      fields.forEach((f) => {
        if (!validateField(f)) valid = false;
      });
      if (!valid) {
        const first = $(".field.invalid input, .field.invalid select, .field.invalid textarea", panels[current]);
        if (first) first.focus();
      }
      return valid;
    }

    if (nextBtn)
      nextBtn.addEventListener("click", () => {
        if (!validateStep()) return;
        if (current < panels.length - 1) {
          current++;
          paint();
        }
      });
    if (prevBtn)
      prevBtn.addEventListener("click", () => {
        if (current > 0) {
          current--;
          paint();
        }
      });
    if (stepper.tagName === "FORM") {
      stepper.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!validateStep()) return;
        const href = whatsappHref(
          stepper,
          "Hello Akshaya Milan, here are my event enquiry details:"
        );
        const progress = $(".stepper-progress", stepper);
        if (progress) progress.style.display = "none";
        revealSuccess(stepper, href);
        const win = window.open(href, "_blank", "noopener");
        if (!win) window.location.href = href;
      });
    }
    paint();
  }

  /* ---------- URL prefill (enquiry from venue/package CTAs) ---------- */
  (function () {
    const note = document.querySelector("[data-prefill]");
    if (!note) return;
    const params = new URLSearchParams(location.search);
    const wanted = params.get("space") || params.get("package");
    if (!wanted) return;
    note.hidden = false;
    note.textContent = "Enquiry for: " + wanted;
    const radio = document.querySelector('input[name="space"][value="' + wanted.replace(/"/g, '\\"') + '"]');
    if (radio) radio.checked = true;
  })();

  /* ---------- FAQ accordion (packages page) ---------- */
  $$(".accordion-item").forEach((item) => {
    const btn = $(".accordion-trigger", item);
    const panel = $(".accordion-panel", item);
    if (!btn || !panel) return;
    btn.addEventListener("click", () => {
      const open = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
      panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
    });
  });
})();