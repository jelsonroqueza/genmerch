
/* GENMERCH V2.0 mobile navigation and responsive storefront composition. */
(function () {
  'use strict';

  const MOBILE_QUERY = '(max-width: 767px)';
  const mobileMedia = window.matchMedia(MOBILE_QUERY);
  const byId = (id) => document.getElementById(id);
  const query = (selector, root) => (root || document).querySelector(selector);

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
    const categories = byId('categoryFilters');
    if (!categories) return;
    categories.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveNav('categories');
  }

  function syncMobileBenefits() {
    const hero = query('main.container > .hero');
    if (!hero) return;

    const source = query('.hero-copy .hero-benefits', hero);
    const current = query('main.container > .gm-mobile-benefits');

    if (mobileMedia.matches) {
      if (source) source.setAttribute('aria-hidden', 'true');
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
    if (source) source.removeAttribute('aria-hidden');
  }

  function syncWishlistBadge() {
    const source = byId('wishlistBadge');
    const target = byId('gmMobileWishlistBadge');
    if (!source || !target) return;

    target.textContent = String(source.textContent || '').trim();
    target.hidden = Boolean(source.hidden) || !target.textContent || target.textContent === '0';
  }

  function setupWishlistBadgeMirror() {
    const source = byId('wishlistBadge');
    if (!source) return;

    syncWishlistBadge();
    const observer = new MutationObserver(syncWishlistBadge);
    observer.observe(source, {
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
      '.genmerch-notification-backdrop.active'
    );
    document.body.classList.toggle('gm-mobile-overlay-open', Boolean(openOverlay));
  }

  function setupOverlayObserver() {
    const observer = new MutationObserver(syncOverlayVisibility);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'aria-hidden'],
      childList: true,
      subtree: true
    });
    syncOverlayVisibility();
  }

  function setupMenuDrawer() {
    const toggle = byId('gmMobileMenuToggle');
    const scrim = byId('gmMobileMenuScrim');
    const panel = byId('gmMobileMenuPanel');
    const close = byId('gmMobileMenuClose');
    if (!toggle || !scrim || !panel || !close) return;

    let previousOverflow = '';

    function closeMenu(restoreFocus) {
      if (scrim.hidden) return;
      scrim.hidden = true;
      scrim.setAttribute('aria-hidden', 'true');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('gm-mobile-menu-open');
      document.body.style.overflow = previousOverflow;
      if (restoreFocus !== false) toggle.focus();
    }

    function openMenu() {
      if (!mobileMedia.matches) return;
      previousOverflow = document.body.style.overflow || '';
      scrim.hidden = false;
      scrim.setAttribute('aria-hidden', 'false');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('gm-mobile-menu-open');
      document.body.style.overflow = 'hidden';
      const firstAction = query('button:not([disabled])', panel);
      if (firstAction) firstAction.focus();
    }

    toggle.addEventListener('click', function () {
      if (scrim.hidden) openMenu();
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
          if (!event.matches) closeMenu(false);
        })
      : mobileMedia.addListener(function (event) {
          if (!event.matches) closeMenu(false);
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
    document.body.classList.add('gm-mobile-redesign-enabled');
    syncMobileBenefits();
    setupWishlistBadgeMirror();
    setupOverlayObserver();
    setupMenuDrawer();
    setupBottomNavigation();

    if (mobileMedia.addEventListener) {
      mobileMedia.addEventListener('change', syncMobileBenefits);
    } else {
      mobileMedia.addListener(syncMobileBenefits);
    }

    window.addEventListener('resize', syncMobileBenefits, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
