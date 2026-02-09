(function () {
  const body = document.body;
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const mobileNav = document.getElementById("mobile-nav");
  const mobileNavLinks = mobileNav ? mobileNav.querySelectorAll("a") : [];

  const yearNode = document.getElementById("current-year");
  if (yearNode) {
    yearNode.textContent = String(new Date().getFullYear());
  }

  function toggleMobileMenu(forceState) {
    if (!mobileMenuBtn || !mobileNav) return;
    const shouldOpen = typeof forceState === "boolean" ? forceState : !mobileNav.classList.contains("is-open");
    mobileNav.classList.toggle("is-open", shouldOpen);
    mobileMenuBtn.setAttribute("aria-expanded", String(shouldOpen));
    body.classList.toggle("menu-open", shouldOpen);
  }

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener("click", function () {
      toggleMobileMenu();
    });
  }

  mobileNavLinks.forEach(function (link) {
    link.addEventListener("click", function () {
      toggleMobileMenu(false);
    });
  });

  const navLinks = document.querySelectorAll('.desktop-nav a[href^="#"], .mobile-nav a[href^="#"]');
  const menuSectionIds = ["about", "events", "products", "contacts"];

  function setActiveMenuItem(sectionId) {
    navLinks.forEach(function (link) {
      link.classList.toggle("is-active", link.getAttribute("href") === "#" + sectionId);
    });
  }

  function refreshActiveMenuItem() {
    const triggerY = window.scrollY + window.innerHeight * 0.34;
    let activeId = menuSectionIds[0];

    menuSectionIds.forEach(function (id) {
      const section = document.getElementById(id);
      if (!section) return;
      if (section.offsetTop <= triggerY) {
        activeId = id;
      }
    });

    setActiveMenuItem(activeId);
  }

  navLinks.forEach(function (link) {
    link.addEventListener("click", function () {
      const href = link.getAttribute("href");
      if (href && href.startsWith("#")) {
        setActiveMenuItem(href.replace("#", ""));
      }
    });
  });

  window.addEventListener("scroll", refreshActiveMenuItem, { passive: true });
  window.addEventListener("resize", refreshActiveMenuItem);
  refreshActiveMenuItem();

  const eventsTrack = document.getElementById("events-track");
  const eventsPrev = document.getElementById("events-prev");
  const eventsNext = document.getElementById("events-next");

  function scrollEvents(direction) {
    if (!eventsTrack) return;
    const firstCard = eventsTrack.querySelector(".event-card");
    const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : 280;
    const gap = 14;
    eventsTrack.scrollBy({
      left: direction * (cardWidth + gap),
      behavior: "smooth"
    });
  }

  if (eventsPrev) {
    eventsPrev.addEventListener("click", function () {
      scrollEvents(-1);
    });
  }

  if (eventsNext) {
    eventsNext.addEventListener("click", function () {
      scrollEvents(1);
    });
  }

  const sheet = document.getElementById("application-sheet");
  const sheetOverlay = document.getElementById("sheet-overlay");
  const sheetClose = document.getElementById("sheet-close");
  const openSheetButtons = document.querySelectorAll("[data-open-application]");

  const feedbackModal = document.getElementById("feedback-modal");
  const feedbackOverlay = document.getElementById("feedback-overlay");
  const feedbackClose = document.getElementById("feedback-close");
  const openFeedbackButtons = document.querySelectorAll("[data-open-feedback]");

  function syncModalLock() {
    const appOpen = sheet && sheet.classList.contains("is-open");
    const feedbackOpen = feedbackModal && feedbackModal.classList.contains("is-open");
    body.classList.toggle("modal-open", appOpen || feedbackOpen);
  }

  function openApplicationSheet() {
    if (!sheet || !sheetOverlay) return;
    closeFeedbackModal();
    sheet.classList.add("is-open");
    sheetOverlay.hidden = false;
    requestAnimationFrame(function () {
      sheetOverlay.classList.add("is-visible");
    });
    sheet.setAttribute("aria-hidden", "false");
    syncModalLock();
  }

  function closeApplicationSheet() {
    if (!sheet || !sheetOverlay) return;
    sheet.classList.remove("is-open");
    sheetOverlay.classList.remove("is-visible");
    sheet.setAttribute("aria-hidden", "true");
    window.setTimeout(function () {
      if (!sheetOverlay.classList.contains("is-visible")) {
        sheetOverlay.hidden = true;
      }
    }, 240);
    syncModalLock();
  }

  function openFeedbackModal() {
    if (!feedbackModal || !feedbackOverlay) return;
    closeApplicationSheet();
    feedbackModal.classList.add("is-open");
    feedbackOverlay.hidden = false;
    requestAnimationFrame(function () {
      feedbackOverlay.classList.add("is-visible");
    });
    feedbackModal.setAttribute("aria-hidden", "false");
    syncModalLock();
  }

  function closeFeedbackModal() {
    if (!feedbackModal || !feedbackOverlay) return;
    feedbackModal.classList.remove("is-open");
    feedbackOverlay.classList.remove("is-visible");
    feedbackModal.setAttribute("aria-hidden", "true");
    window.setTimeout(function () {
      if (!feedbackOverlay.classList.contains("is-visible")) {
        feedbackOverlay.hidden = true;
      }
    }, 240);
    syncModalLock();
  }

  openSheetButtons.forEach(function (button) {
    button.addEventListener("click", openApplicationSheet);
  });

  if (sheetClose) {
    sheetClose.addEventListener("click", closeApplicationSheet);
  }

  if (sheetOverlay) {
    sheetOverlay.addEventListener("click", closeApplicationSheet);
  }

  openFeedbackButtons.forEach(function (button) {
    button.addEventListener("click", openFeedbackModal);
  });

  if (feedbackClose) {
    feedbackClose.addEventListener("click", closeFeedbackModal);
  }

  if (feedbackOverlay) {
    feedbackOverlay.addEventListener("click", closeFeedbackModal);
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      toggleMobileMenu(false);
      closeApplicationSheet();
      closeFeedbackModal();
    }
  });

  const feedbackForm = document.getElementById("feedback-form");
  const feedbackStatus = document.getElementById("feedback-status");
  const applicationForm = document.getElementById("application-form");
  const applicationStatus = document.getElementById("application-status");

  if (feedbackForm) {
    feedbackForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      form.reset();
      if (feedbackStatus) {
        feedbackStatus.textContent = "Сообщение принято. Подключите реальный обработчик формы в JS/CRM.";
      }
      window.setTimeout(closeFeedbackModal, 950);
    });
  }

  if (applicationForm) {
    applicationForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      form.reset();
      if (applicationStatus) {
        applicationStatus.textContent = "Заявка отправлена (демо). Подключите бэкенд/CRM для реальной отправки.";
      }
      window.setTimeout(closeApplicationSheet, 1100);
    });
  }

  const languageButtons = document.querySelectorAll(".lang-btn");

  function detectCurrentLanguage() {
    const match = document.cookie.match(/googtrans=\/ru\/([^;]+)/);
    return match && match[1] ? decodeURIComponent(match[1]) : "ru";
  }

  function setActiveLanguageButton(lang) {
    languageButtons.forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.lang === lang);
    });
  }

  function applyTranslateByCombo(lang) {
    const combo = document.querySelector(".goog-te-combo");
    if (!combo) return false;
    combo.value = lang;
    combo.dispatchEvent(new Event("change"));
    return true;
  }

  function resetToRussian() {
    document.cookie = "googtrans=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.reload();
  }

  function switchLanguage(lang) {
    if (lang === "ru") {
      resetToRussian();
      return;
    }

    const switched = applyTranslateByCombo(lang);
    if (!switched) {
      document.cookie = "googtrans=/ru/" + lang + "; path=/";
      window.location.reload();
    }
  }

  setActiveLanguageButton(detectCurrentLanguage());

  languageButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      const lang = button.dataset.lang || "ru";
      setActiveLanguageButton(lang);
      switchLanguage(lang);
    });
  });
})();
