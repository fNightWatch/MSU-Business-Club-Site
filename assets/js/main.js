(function () {
  "use strict";

  /**
   * =========================
   * Конфиг (править здесь)
   * =========================
   */
  const CONFIG = {
    teamMarqueeSpeedPxPerSec: 28, // скорость автопрокрутки карточек команды (px/sec)
    teamMarqueePauseOnHover: true,
    hideGoogleTranslateBanner: true
  };

  const body = document.body;
  const isHomePage = (function detectHome() {
    const path = window.location.pathname || "";
    return path.endsWith("/") || path.endsWith("/index.html") || path.endsWith("index.html");
  })();

  /**
   * =========================
   * Системные мелочи
   * =========================
   */
  const yearNode = document.getElementById("current-year");
  if (yearNode) {
    yearNode.textContent = String(new Date().getFullYear());
  }

  /**
   * =========================
   * Навигация: scope + активный пункт
   * =========================
   */
  function applyNavScope() {
    const homeOnly = document.querySelectorAll("[data-home-only]");
    const subpageOnly = document.querySelectorAll("[data-subpage-only]");

    homeOnly.forEach(function (el) {
      el.hidden = !isHomePage;
    });

    subpageOnly.forEach(function (el) {
      el.hidden = isHomePage;
    });
  }

  function setActiveLinkByPath() {
    const currentFile = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();

    const allNavLinks = document.querySelectorAll(".desktop-nav a, .mobile-nav a");
    allNavLinks.forEach(function (link) {
      const href = (link.getAttribute("href") || "").trim();
      if (!href || href.startsWith("#")) return;
      if (/^https?:\/\//i.test(href)) return;

      const normalized = href.split("#")[0].toLowerCase();
      link.classList.toggle("is-active", normalized === currentFile);
    });
  }

  applyNavScope();

  /**
   * =========================
   * Мобильное меню
   * =========================
   */
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const mobileNav = document.getElementById("mobile-nav");
  const mobileNavLinks = mobileNav ? mobileNav.querySelectorAll("a") : [];

  function toggleMobileMenu(forceState) {
    if (!mobileMenuBtn || !mobileNav) return;
    const shouldOpen =
      typeof forceState === "boolean"
        ? forceState
        : !mobileNav.classList.contains("is-open");
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

  /**
   * =========================
   * Активные пункты меню на главной (scroll-spy)
   * =========================
   */
  if (isHomePage) {
    const navLinks = document.querySelectorAll(
      '.desktop-nav a[href^="#"], .mobile-nav a[href^="#"]'
    );

    // порядок важен — используется для определения "какой раздел активен"
    const menuSectionIds = ["about", "team", "events", "products", "contacts"];

    function setActiveMenuItem(sectionId) {
      navLinks.forEach(function (link) {
        link.classList.toggle(
          "is-active",
          link.getAttribute("href") === "#" + sectionId
        );
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
  } else {
    setActiveLinkByPath();
  }


  /**
   * =========================
   * Сквозные scroll-анимации (двусторонние)
   * =========================
   */
  (function initScrollDrivenEffects() {
    if (!isHomePage) return;

    const revealNodes = Array.from(document.querySelectorAll('[data-scroll-reveal]'));
    const hero = document.getElementById('hero');
    const heroMedia = document.querySelector('[data-hero-media] img');
    const heroFrost = document.querySelector('[data-hero-frost]');

    const prefersReducedMotion =
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;

    function clamp01(value) {
      return Math.min(1, Math.max(0, value));
    }

    function update() {
      const viewportH = window.innerHeight || 1;

      if (hero && heroMedia && heroFrost) {
        const heroRange = Math.max(260, hero.offsetHeight * 0.95);
        const heroProgress = clamp01(window.scrollY / heroRange);
        const mediaOpacity = 1 - heroProgress * 0.64;
        const frostOpacity = 0.98 - heroProgress * 0.52;
        heroMedia.style.setProperty('--hero-media-opacity', String(mediaOpacity.toFixed(4)));
        heroFrost.style.setProperty('--hero-frost-opacity', String(frostOpacity.toFixed(4)));
      }

      revealNodes.forEach(function (node) {
        const rect = node.getBoundingClientRect();
        const start = viewportH * 0.9;
        const end = viewportH * 0.22;
        const progress = clamp01((start - rect.top) / (start - end));
        node.style.setProperty('--reveal-progress', progress.toFixed(4));
      });

      rafId = 0;
    }

    function queueUpdate() {
      if (rafId) return;
      rafId = window.requestAnimationFrame(update);
    }

    if (!prefersReducedMotion) {
      window.addEventListener('scroll', queueUpdate, { passive: true });
    }

    window.addEventListener('resize', queueUpdate);
    queueUpdate();
  })();

  /**
   * =========================
   * Галереи во вкладке «О клубе»
   * =========================
   */
  (function initAboutMediaGallery() {
    if (!isHomePage) return;

    const galleries = Array.from(document.querySelectorAll('.about-media[data-gallery-images]'));
    if (!galleries.length) return;

    const prefersReducedMotion =
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ROTATE_EVERY_MS = 4000;

    function setupGallery(gallery) {
      const parsed = (gallery.getAttribute('data-gallery-images') || '')
        .split(',')
        .map(function (src) {
          return src.trim();
        })
        .filter(Boolean);

      const initial = gallery.querySelector('img');
      const initialSrc = initial ? initial.getAttribute('src') : '';
      const images = initialSrc ? [initialSrc].concat(parsed.filter(function (src) { return src !== initialSrc; })) : parsed;
      if (images.length < 2 || !initial) return null;

      const direction = (gallery.getAttribute('data-gallery-direction') || 'left').toLowerCase() === 'right' ? 'right' : 'left';
      const delay = Number(gallery.getAttribute('data-gallery-delay')) || 0;

      initial.classList.add('gallery-image', 'is-active');

      const frames = [initial];
      images.slice(1).forEach(function (src) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.className = 'gallery-image';
        gallery.appendChild(img);
        frames.push(img);
      });

      return {
        direction: direction,
        delay: delay,
        index: 0,
        isAnimating: false,
        frames: frames
      };
    }

    const prepared = galleries.map(setupGallery).filter(Boolean);
    if (!prepared.length || prefersReducedMotion) return;

    function nextFrame(item) {
      if (item.isAnimating) return;
      const nextIndex = (item.index + 1) % item.frames.length;
      const current = item.frames[item.index];
      const next = item.frames[nextIndex];

      const fromClass = item.direction === 'left' ? 'is-from-right' : 'is-from-left';
      const toClass = item.direction === 'left' ? 'is-to-left' : 'is-to-right';

      item.isAnimating = true;

      next.classList.remove('is-from-left', 'is-from-right', 'is-to-left', 'is-to-right', 'is-leaving');
      current.classList.remove('is-from-left', 'is-from-right', 'is-to-left', 'is-to-right', 'is-leaving');

      next.classList.add('is-entering', fromClass);
      current.classList.add('is-leaving', toClass);

      window.requestAnimationFrame(function () {
        next.classList.remove(fromClass);
      });

      window.setTimeout(function () {
        current.classList.remove('is-active', 'is-leaving', toClass);
        next.classList.remove('is-entering');
        next.classList.add('is-active');
        item.index = nextIndex;
        item.isAnimating = false;
      }, 210);
    }

    function rotateCycle() {
      prepared.forEach(function (item) {
        window.setTimeout(function () {
          nextFrame(item);
        }, item.delay);
      });
    }

    window.setInterval(rotateCycle, ROTATE_EVERY_MS);
    rotateCycle();
  })();

  /**
   * =========================
   * Слайдер анонсов (главная)
   * =========================
   */
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

  /**
   * =========================
   * Команда: автопрокрутка карточек
   * =========================
   */
  (function initTeamMarquee() {
    const marquee = document.getElementById("team-marquee");
    if (!marquee) return;

    // Для доступности: автодвижение выключаем, если пользователь попросил "reduced motion"
    const prefersReducedMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) return;

    let isPaused = false;
    let rafId = 0;
    let lastTs = 0;

    const speed = Math.max(0, Number(CONFIG.teamMarqueeSpeedPxPerSec) || 0);
    const pxPerMs = speed / 1000;

    function step(ts) {
      if (!lastTs) lastTs = ts;
      const dt = ts - lastTs;
      lastTs = ts;

      if (!isPaused && pxPerMs > 0) {
        marquee.scrollLeft += dt * pxPerMs;

        const maxScroll = marquee.scrollWidth - marquee.clientWidth - 1;
        if (maxScroll > 0 && marquee.scrollLeft >= maxScroll) {
          marquee.scrollLeft = 0;
        }
      }

      rafId = window.requestAnimationFrame(step);
    }

    function pause() {
      isPaused = true;
    }
    function resume() {
      isPaused = false;
    }

    if (CONFIG.teamMarqueePauseOnHover) {
      marquee.addEventListener("mouseenter", pause);
      marquee.addEventListener("mouseleave", resume);
    }

    marquee.addEventListener("focusin", pause);
    marquee.addEventListener("focusout", resume);

    marquee.addEventListener(
      "pointerdown",
      function () {
        pause();
        window.setTimeout(resume, 1200);
      },
      { passive: true }
    );

    rafId = window.requestAnimationFrame(step);

    // safety: если страница уходит в background — экономим ресурсы
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        window.cancelAnimationFrame(rafId);
      } else {
        lastTs = 0;
        rafId = window.requestAnimationFrame(step);
      }
    });
  })();

  /**
   * =========================
   * Модалки/формы (главная и подстраницы)
   * =========================
   */
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
    body.classList.toggle("modal-open", Boolean(appOpen || feedbackOpen));
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
        feedbackStatus.textContent =
          "Сообщение принято. Подключите реальный обработчик формы в JS/CRM.";
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
        applicationStatus.textContent =
          "Заявка отправлена (демо). Подключите бэкенд/CRM для реальной отправки.";
      }
      window.setTimeout(closeApplicationSheet, 1100);
    });
  }

  /**
   * =========================
   * Google Translate: переключение языков
   * + фикс верхней панели
   * =========================
   */
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
    document.cookie =
      "googtrans=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
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

  function installGoogleTranslateBannerFix() {
    if (!CONFIG.hideGoogleTranslateBanner) return;

    function applyFix() {
      // Google иногда добавляет отступ сверху через inline-style
      document.documentElement.style.top = "0px";
      document.documentElement.style.position = "static";
      document.documentElement.style.marginTop = "0px";

      if (document.body) {
        document.body.style.top = "0px";
        document.body.style.position = "static";
        document.body.style.marginTop = "0px";
      }

      const iframe = document.querySelector("iframe.goog-te-banner-frame");
      if (iframe) {
        iframe.style.display = "none";
        iframe.style.visibility = "hidden";
        iframe.style.height = "0";
      }

      const tt = document.getElementById("goog-gt-tt");
      if (tt) {
        tt.style.display = "none";
      }
    }

    let scheduled = false;
    function scheduleFix() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        applyFix();
      });
    }

    applyFix();
    window.setTimeout(applyFix, 700);

    try {
      const obs = new MutationObserver(scheduleFix);
      obs.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true
      });
    } catch (e) {
      // no-op
    }
  }

  installGoogleTranslateBannerFix();
})();