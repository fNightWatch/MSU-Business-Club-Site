/* =========================================================
   Бизнес-клуб МГУ — лендинг (шаблон)
   JS без зависимостей: меню, якоря, модалка снизу, формы
   ========================================================= */

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- year ---------- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- toast ---------- */
  const toastEl = $("#toast");
  let toastTimer = null;

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("is-visible");
    }, 3200);
  }

  /* ---------- mobile nav ---------- */
  const nav = $(".nav");
  const toggle = $(".nav__toggle");
  const panel = $("#navPanel");

  function setNavOpen(open) {
    if (!nav || !toggle) return;
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      // фокус на первую ссылку
      const firstFocusable = panel?.querySelector("a, button");
      firstFocusable?.focus?.();
    }
  }

  toggle?.addEventListener("click", () => {
    const isOpen = nav.classList.contains("is-open");
    setNavOpen(!isOpen);
  });

  // Закрываем меню при клике по ссылке/кнопке внутри панели (мобилка)
  panel?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.closest("a") || t.closest("button")) {
      setNavOpen(false);
    }
  });

  // Закрываем меню при клике вне панели
  document.addEventListener("click", (e) => {
    if (!nav || !toggle) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    const isOpen = nav.classList.contains("is-open");
    if (!isOpen) return;
    if (nav.contains(t) || toggle.contains(t)) return;
    setNavOpen(false);
  });

  // При расширении экрана сбрасываем мобильное состояние
  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 861px)").matches) {
      setNavOpen(false);
    }
  });

  /* ---------- active anchor highlight ---------- */
  const sections = ["#about", "#products", "#contacts"]
    .map((id) => $(id))
    .filter(Boolean);

  const links = $$(".nav__link").filter((a) => a instanceof HTMLAnchorElement);

  function setActiveLink(id) {
    links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === id));
  }

  if ("IntersectionObserver" in window && sections.length) {
    const io = new IntersectionObserver(
      (entries) => {
        // выбираем наиболее видимый
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActiveLink("#" + visible.target.id);
      },
      {
        root: null,
        rootMargin: "-35% 0px -55% 0px",
        threshold: [0.05, 0.1, 0.2, 0.35, 0.5],
      }
    );

    sections.forEach((s) => io.observe(s));
  }

  /* ---------- apply modal (bottom sheet) ---------- */
  const modal = $("#applyModal");
  const sheet = modal?.querySelector(".modal__sheet");
  const openBtns = $$(".js-open-apply");
  let lastFocus = null;

  function lockScroll(lock) {
    document.documentElement.classList.toggle("is-locked", lock);
    document.body.style.overflow = lock ? "hidden" : "";
  }

  function openModal() {
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    lockScroll(true);

    // фокус в форму
    const firstInput = modal.querySelector("input, select, textarea, button");
    setTimeout(() => firstInput?.focus?.(), 40);
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    lockScroll(false);

    if (lastFocus && typeof lastFocus.focus === "function") {
      setTimeout(() => lastFocus.focus(), 10);
    }
  }

  openBtns.forEach((b) => b.addEventListener("click", openModal));

  modal?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.close === "true") closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal?.classList.contains("is-open")) closeModal();
  });

  // Простой focus trap (чтобы таб не уходил на страницу под модалкой)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    if (!modal?.classList.contains("is-open")) return;

    const focusables = $$("#applyModal a, #applyModal button, #applyModal input, #applyModal select, #applyModal textarea")
      .filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);

    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  });

  /* ---------- forms: demo submission ---------- */
  const applyForm = $("#applyForm");
  const applyStatus = $("#applyStatus");

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.textContent = msg;
    el.style.color = kind === "error" ? "rgba(255, 185, 185, 0.95)" : "rgba(170, 238, 255, 0.92)";
  }

  function validateAndReport(form) {
    if (!(form instanceof HTMLFormElement)) return false;
    // встроенная проверка HTML5
    if (form.checkValidity()) return true;

    // покажем нативные подсказки
    const firstInvalid = form.querySelector(":invalid");
    if (firstInvalid && typeof firstInvalid.reportValidity === "function") {
      firstInvalid.reportValidity();
      firstInvalid.focus?.();
    }
    return false;
  }

  applyForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateAndReport(applyForm)) {
      setStatus(applyStatus, "Пожалуйста, заполните обязательные поля.", "error");
      return;
    }

    // Здесь подключите реальную отправку (fetch на API / форму).
    // Пока — демонстрация:
    const fd = new FormData(applyForm);
    console.log("[applyForm] payload:", Object.fromEntries(fd.entries()));

    applyForm.reset();
    setStatus(applyStatus, "Заявка отправлена (демо). Мы скоро свяжемся!", "ok");
    toast("Заявка отправлена ✔ (демо)");
    setTimeout(closeModal, 650);
  });

  const feedbackForm = $("#feedbackForm");
  const feedbackStatus = $("#feedbackStatus");

  feedbackForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateAndReport(feedbackForm)) {
      setStatus(feedbackStatus, "Пожалуйста, заполните обязательные поля.", "error");
      return;
    }

    const fd = new FormData(feedbackForm);
    console.log("[feedbackForm] payload:", Object.fromEntries(fd.entries()));

    feedbackForm.reset();
    setStatus(feedbackStatus, "Сообщение отправлено (демо). Спасибо!", "ok");
    toast("Сообщение отправлено ✔ (демо)");
  });

  /* ---------- little UX: if user clicks anchor, close nav ---------- */
  $$(".nav__link").forEach((a) =>
    a.addEventListener("click", () => {
      setNavOpen(false);
    })
  );
})();
