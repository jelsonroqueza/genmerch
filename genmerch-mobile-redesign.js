
/* GENMERCH V2.0 mobile navigation and responsive storefront composition. */
(function () {
  'use strict';

  const MOBILE_QUERY = '(max-width: 767px)';
  const mobileMedia = window.matchMedia(MOBILE_QUERY);
  const byId = (id) => document.getElementById(id);
  const query = (selector, root) => (root || document).querySelector(selector);
  let wishlistBadgeObserver = null;
  let overlayObserver = null;

  function clickExisting(selector) {
    const target = query(selector);
    if (target && typeof target.click === 'function') target.click();
  }

  function setActiveNav(name) {
    document.querySelectorAll('.bottom-nav [data-gm-nav]').forEach((button) => {
      const active = button.dataset.gmNav === name;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function scrollToCategories() {
    setActiveNav('categories');
    window.dispatchEvent(new CustomEvent('genmerch:open-category-picker'));
  }

  function syncMobileSearchPlacement() {
    const main = query('main.container');
    const hero = query('.hero', main);
    const search = query('.catalog-search', main);
    if (!main || !hero || !search) return;

    if (mobileMedia.matches) {
      if (!search.__gmMobileOriginalMarker && search.parentNode) {
        const marker = document.createComment('GENMERCH original desktop search position');
        search.parentNode.insertBefore(marker, search);
        search.__gmMobileOriginalMarker = marker;
      }

      if (search.parentNode === main && main.firstElementChild !== search) {
        main.insertBefore(search, hero);
      }
      return;
    }

    const marker = search.__gmMobileOriginalMarker;
    if (marker && marker.parentNode) {
      marker.parentNode.insertBefore(search, marker.nextSibling);
      marker.remove();
      delete search.__gmMobileOriginalMarker;
    }
  }

  function syncMobileBenefits() {
    const hero = query('main.container > .hero');
    if (!hero) return;

    const source = query('.hero-copy .hero-benefits', hero);
    const current = query('main.container > .gm-mobile-benefits');

    if (mobileMedia.matches) {
      if (source) {
        source.setAttribute('aria-hidden', 'true');
        source.dataset.gmMobileHidden = 'true';
      }
      if (current || !source) return;

      const clone = source.cloneNode(true);
      clone.classList.remove('hero-benefits', 'genmerch-benefit-strip');
      clone.classList.add('gm-mobile-benefits');
      clone.setAttribute('aria-label', 'GENMERCH shopping benefits');
      clone.removeAttribute('id');
      hero.insertAdjacentElement('afterend', clone);
      return;
    }

    if (current) current.remove();
    if (source && source.dataset.gmMobileHidden === 'true') {
      source.removeAttribute('aria-hidden');
      delete source.dataset.gmMobileHidden;
    }
  }

  function syncWishlistBadge() {
    const source = byId('wishlistBadge');
    const target = byId('gmMobileWishlistBadge');
    if (!source || !target) return;

    target.textContent = String(source.textContent || '').trim();
    target.hidden = Boolean(source.hidden) || !target.textContent || target.textContent === '0';
  }

  function setupWishlistBadgeMirror() {
    if (!mobileMedia.matches) {
      if (wishlistBadgeObserver) {
        wishlistBadgeObserver.disconnect();
        wishlistBadgeObserver = null;
      }
      return;
    }

    const source = byId('wishlistBadge');
    if (!source) return;

    syncWishlistBadge();
    if (wishlistBadgeObserver) return;

    wishlistBadgeObserver = new MutationObserver(syncWishlistBadge);
    wishlistBadgeObserver.observe(source, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  function syncOverlayVisibility() {
    const openOverlay = query(
      '.overlay.open, .cart-overlay.open, .wishlist-overlay.open, ' +
      '.customer-orders-overlay.open, .customer-auth-overlay.open, ' +
      '.seller-modal-overlay.open, .size-overlay.open, .genmerch-review-overlay.open, ' +
      '.checkout-account-gate-overlay.open, .business-reg-overlay.open, ' +
      '.gmca-overlay.open, .genmerch-action-overlay.active, ' +
      '.genmerch-notification-backdrop.open, .genmerch-notification-panel.open'
    );
    document.body.classList.toggle('gm-mobile-overlay-open', Boolean(openOverlay));
  }

  function setupOverlayObserver() {
    if (!mobileMedia.matches) {
      if (overlayObserver) {
        overlayObserver.disconnect();
        overlayObserver = null;
      }
      document.body.classList.remove('gm-mobile-overlay-open');
      return;
    }

    if (!overlayObserver) {
      overlayObserver = new MutationObserver(syncOverlayVisibility);
      overlayObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'aria-hidden'],
        childList: true,
        subtree: true
      });
    }
    syncOverlayVisibility();
  }


  function setupMenuDrawer() {
    const toggle = byId('gmMobileMenuToggle');
    const scrim = byId('gmMobileMenuScrim');
    const panel = byId('gmMobileMenuPanel');
    const close = byId('gmMobileMenuClose');
    if (!toggle || !scrim || !panel || !close) return;

    let previousBodyStyles = null;
    let lockedScrollY = 0;
    let touchStartY = 0;
    let closeTimer = null;
    let isClosing = false;
    let restoreFocusAfterClose = false;
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const drawerCloseDuration = 250;

    function lockStorefrontScroll() {
      lockedScrollY = window.scrollY || window.pageYOffset || 0;
      previousBodyStyles = {
        position: document.body.style.position,
        top: document.body.style.top,
        left: document.body.style.left,
        right: document.body.style.right,
        width: document.body.style.width,
        overflow: document.body.style.overflow
      };
      document.documentElement.classList.add('gm-mobile-menu-scroll-locked');
      document.body.style.position = 'fixed';
      document.body.style.top = '-' + lockedScrollY + 'px';
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    }

    function unlockStorefrontScroll() {
      if (!previousBodyStyles) return;
      document.documentElement.classList.remove('gm-mobile-menu-scroll-locked');
      document.body.style.position = previousBodyStyles.position;
      document.body.style.top = previousBodyStyles.top;
      document.body.style.left = previousBodyStyles.left;
      document.body.style.right = previousBodyStyles.right;
      document.body.style.width = previousBodyStyles.width;
      document.body.style.overflow = previousBodyStyles.overflow;
      previousBodyStyles = null;
      window.scrollTo(0, lockedScrollY);
    }

    function preventBackgroundTouchScroll(event) {
      if (scrim.hidden) return;
      if (!panel.contains(event.target)) {
        event.preventDefault();
        return;
      }
      const deltaY = event.touches && event.touches.length ? event.touches[0].clientY - touchStartY : 0;
      const canScroll = panel.scrollHeight > panel.clientHeight + 1;
      const atTop = panel.scrollTop <= 0;
      const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
      if (!canScroll || (atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        event.preventDefault();
      }
    }

    panel.addEventListener('touchstart', function (event) {
      if (event.touches && event.touches.length) touchStartY = event.touches[0].clientY;
    }, { passive: true });

    scrim.addEventListener('touchstart', function (event) {
      if (event.touches && event.touches.length) touchStartY = event.touches[0].clientY;
    }, { passive: true });

    scrim.addEventListener('touchmove', preventBackgroundTouchScroll, { passive: false });

    function finishMenuClose() {
      if (closeTimer !== null) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
      }
      scrim.classList.remove('is-closing');
      scrim.hidden = true;
      scrim.setAttribute('aria-hidden', 'true');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('gm-mobile-menu-open');
      isClosing = false;
      if (restoreFocusAfterClose) toggle.focus();
      restoreFocusAfterClose = false;
    }

    function closeMenu(restoreFocus, immediate) {
      if (scrim.hidden) return;
      if (restoreFocus !== false) restoreFocusAfterClose = true;
      if (isClosing) return;
      if (closeTimer !== null) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
      }

      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('gm-mobile-menu-open');
      unlockStorefrontScroll();

      if (immediate || reducedMotionQuery.matches) {
        finishMenuClose();
        return;
      }
      if (isClosing) return;

      isClosing = true;
      scrim.classList.add('is-closing');
      scrim.setAttribute('aria-hidden', 'true');
      closeTimer = window.setTimeout(finishMenuClose, drawerCloseDuration);
    }

    function openMenu() {
      if (!mobileMedia.matches) return;
      const reopeningDuringClose = isClosing;
      if (isClosing) {
        if (closeTimer !== null) {
          window.clearTimeout(closeTimer);
          closeTimer = null;
        }
        isClosing = false;
        restoreFocusAfterClose = false;
        scrim.classList.remove('is-closing');
      }
      if (scrim.hidden) lockStorefrontScroll();
      else if (!reopeningDuringClose) return;

      scrim.hidden = false;
      scrim.setAttribute('aria-hidden', 'false');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('gm-mobile-menu-open');

      // Ensure the entrance sequence restarts on every open, including a
      // reopen that happens while a previous close animation is finishing.
      void scrim.offsetWidth;
      void panel.offsetWidth;
      const firstAction = query('button:not([disabled])', panel);
      if (firstAction) firstAction.focus();
    }

    toggle.addEventListener('click', function () {
      if (scrim.hidden || isClosing) openMenu();
      else closeMenu(true);
    });

    close.addEventListener('click', function () {
      closeMenu(true);
    });

    scrim.addEventListener('click', function (event) {
      if (event.target === scrim) closeMenu(true);
    });

    panel.addEventListener('click', function (event) {
      const action = event.target instanceof Element
        ? event.target.closest('[data-gm-mobile-action], [data-gm-mobile-open]')
        : null;

      if (!action) return;
      event.preventDefault();

      const actionName = action.dataset.gmMobileAction || '';
      const targetSelector = action.dataset.gmMobileOpen || '';

      closeMenu(false);

      if (actionName === 'home') {
        clickExisting('.site-header .brand-lockup');
        setActiveNav('home');
      } else if (actionName === 'categories') {
        scrollToCategories();
      } else if (actionName === 'testimonials') {
        window.dispatchEvent(new CustomEvent('genmerch:open-trust-testimonials'));
      } else if (actionName === 'partner') {
        // Let the drawer finish its exit motion, then open the existing
        // storefront application modal directly (no footer scroll or new page).
        const openApplication = function () {
          if (typeof window.openPartnerApplication === 'function') {
            window.openPartnerApplication();
            return;
          }
          window.dispatchEvent(new CustomEvent('genmerch:open-partner-application'));
        };
        window.setTimeout(openApplication, reducedMotionQuery.matches ? 0 : drawerCloseDuration + 30);
      } else if (targetSelector) {
        clickExisting(targetSelector);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !scrim.hidden) {
        event.preventDefault();
        closeMenu(true);
      }
    });

    mobileMedia.addEventListener
      ? mobileMedia.addEventListener('change', function (event) {
          if (!event.matches) closeMenu(false, true);
        })
      : mobileMedia.addListener(function (event) {
          if (!event.matches) closeMenu(false, true);
        });
  }

  function setupBottomNavigation() {
    const nav = query('.bottom-nav');
    if (!nav) return;

    nav.addEventListener('click', function (event) {
      const button = event.target instanceof Element
        ? event.target.closest('[data-gm-nav]')
        : null;
      if (!button) return;

      event.preventDefault();
      const destination = button.dataset.gmNav;
      setActiveNav(destination);

      if (destination === 'home') {
        clickExisting('.site-header .brand-lockup');
      } else if (destination === 'categories') {
        scrollToCategories();
      } else if (destination === 'wishlist') {
        clickExisting('.site-header .wishlist-header-button');
      } else if (destination === 'orders') {
        clickExisting('#openCustomerOrdersButton');
      } else if (destination === 'account') {
        clickExisting('#customerAccountButton');
      }
    });
  }

  function init() {
    if (mobileMedia.matches) document.body.classList.add('gm-mobile-redesign-enabled');
    syncMobileSearchPlacement();
    syncMobileBenefits();
    setupWishlistBadgeMirror();
    setupOverlayObserver();
    setupMenuDrawer();
    setupBottomNavigation();

    const handleViewportModeChange = function () {
      if (mobileMedia.matches) {
        document.body.classList.add('gm-mobile-redesign-enabled');
      } else {
        document.body.classList.remove('gm-mobile-redesign-enabled');
        document.body.classList.remove('gm-mobile-menu-open');
        document.body.classList.remove('gm-mobile-overlay-open');
      }
      syncMobileSearchPlacement();
      syncMobileBenefits();
      setupWishlistBadgeMirror();
      setupOverlayObserver();
    };

    if (mobileMedia.addEventListener) {
      mobileMedia.addEventListener('change', handleViewportModeChange);
    } else {
      mobileMedia.addListener(handleViewportModeChange);
    }

    window.addEventListener('resize', syncMobileSearchPlacement, { passive: true });
    window.addEventListener('resize', syncMobileBenefits, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
