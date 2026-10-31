/* GENMERCH V2.0 responsive-reference behavior.
   UI-only: moves the existing search control, adds mobile navigation,
   and maps mobile shortcuts to existing storefront functions. */
(function () {
  "use strict";

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function callGlobal(name) {
    var fn = window[name];
    if (typeof fn === "function") {
      return fn.apply(window, Array.prototype.slice.call(arguments, 1));
    }
    return undefined;
  }

  function scrollToElement(id) {
    var element = document.getElementById(id);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setBadgeFrom(sourceId, targetId) {
    var source = document.getElementById(sourceId);
    var target = document.getElementById(targetId);
    if (!source || !target) return;

    function update() {
      var count = (source.textContent || "").trim();
      target.textContent = count;
      target.hidden = source.hidden || !count || count === "0";
    }

    update();
    if (typeof MutationObserver === "function") {
      var observer = new MutationObserver(update);
      observer.observe(source, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true
      });
    }
  }

  ready(function () {
    var header = document.querySelector(".site-header .main-header");
    var headerNav = document.querySelector(".site-header .main-header .nav");
    var brand = headerNav && headerNav.querySelector(".brand-lockup");
    var actions = headerNav && headerNav.querySelector(".header-actions");
    var desktopLinks = document.querySelector(".site-header .desktop-links");
    var search = document.querySelector(".catalog-search");

    if (header && headerNav && brand && actions && search) {
      if (search.parentElement !== headerNav) {
        headerNav.insertBefore(search, actions.nextSibling);
      }

      var menuButton = document.getElementById("gmMobileMenuButton");
      if (!menuButton) {
        menuButton = document.createElement("button");
        menuButton.type = "button";
        menuButton.id = "gmMobileMenuButton";
        menuButton.className = "gm-mobile-menu-button";
        menuButton.setAttribute("aria-label", "Open navigation menu");
        menuButton.setAttribute("aria-controls", "gmDesktopLinks");
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
          "</svg>";
        headerNav.insertBefore(menuButton, brand);
      }

      if (desktopLinks) {
        desktopLinks.id = "gmDesktopLinks";

        if (!desktopLinks.querySelector(".gm-mobile-menu-close")) {
          var closeButton = document.createElement("button");
          closeButton.type = "button";
          closeButton.className = "gm-mobile-menu-close";
          closeButton.setAttribute("aria-label", "Close navigation menu");
          closeButton.innerHTML = '<span>GENMERCH Menu</span><span aria-hidden="true">×</span>';
          desktopLinks.insertBefore(closeButton, desktopLinks.firstChild);
          closeButton.addEventListener("click", closeMobileMenu);
        }

        var backdrop = document.querySelector(".gm-mobile-menu-backdrop");
        if (!backdrop) {
          backdrop = document.createElement("div");
          backdrop.className = "gm-mobile-menu-backdrop";
          backdrop.setAttribute("aria-hidden", "true");
          header.appendChild(backdrop);
        }

        function openMobileMenu() {
          desktopLinks.classList.add("is-open");
          backdrop.classList.add("is-visible");
          document.body.classList.add("gm-mobile-menu-open");
          menuButton.setAttribute("aria-expanded", "true");
          menuButton.setAttribute("aria-label", "Close navigation menu");
          backdrop.setAttribute("aria-hidden", "false");
        }

        function closeMobileMenu() {
          if (!desktopLinks || !menuButton) return;
          desktopLinks.classList.remove("is-open");
          if (backdrop) {
            backdrop.classList.remove("is-visible");
            backdrop.setAttribute("aria-hidden", "true");
          }
          document.body.classList.remove("gm-mobile-menu-open");
          menuButton.setAttribute("aria-expanded", "false");
          menuButton.setAttribute("aria-label", "Open navigation menu");
        }

        menuButton.addEventListener("click", function () {
          if (desktopLinks.classList.contains("is-open")) {
            closeMobileMenu();
          } else {
            openMobileMenu();
          }
        });

        backdrop.addEventListener("click", closeMobileMenu);

        desktopLinks.querySelectorAll("button").forEach(function (button) {
          if (!button.classList.contains("gm-mobile-menu-close")) {
            button.addEventListener("click", closeMobileMenu);
          }
        });

        document.addEventListener("keydown", function (event) {
          if (event.key === "Escape") closeMobileMenu();
        });

        window.addEventListener("resize", function () {
          if (window.matchMedia && window.matchMedia("(min-width: 761px)").matches) {
            closeMobileMenu();
          }
        });
      }
    }

    var bottomNav = document.querySelector(".bottom-nav");
    if (bottomNav) {
      bottomNav.setAttribute("aria-label", "Mobile navigation");
      bottomNav.innerHTML =
        '<button class="gm-bottom-item is-active" type="button" data-gm-action="home" aria-label="Home">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>' +
          '<span class="gm-bottom-label">Home</span>' +
        '</button>' +
        '<button class="gm-bottom-item" type="button" data-gm-action="categories" aria-label="Categories">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' +
          '<span class="gm-bottom-label">Categories</span>' +
        '</button>' +
        '<button class="gm-bottom-item" type="button" data-gm-action="wishlist" aria-label="Wishlist">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.8a5.3 5.3 0 0 0-7.5 0L12 6.1l-1.3-1.3a5.3 5.3 0 0 0-7.5 7.5l1.3 1.3L12 21l7.5-7.4 1.3-1.3a5.3 5.3 0 0 0 0-7.5z"/></svg>' +
          '<span class="gm-bottom-label">Wishlist</span><span class="gm-bottom-badge" id="gmMobileWishlistBadge" hidden></span>' +
        '</button>' +
        '<button class="gm-bottom-item" type="button" data-gm-action="orders" aria-label="Orders">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2z"/><path d="M9 3v4h6V3M8.5 12h7M8.5 16h7"/></svg>' +
          '<span class="gm-bottom-label">Orders</span><span class="gm-bottom-badge" id="gmMobileOrdersBadge" hidden></span>' +
        '</button>' +
        '<button class="gm-bottom-item" type="button" data-gm-action="account" aria-label="Account">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>' +
          '<span class="gm-bottom-label">Account</span>' +
        '</button>';

      bottomNav.querySelectorAll("[data-gm-action]").forEach(function (button) {
        button.addEventListener("click", function () {
          bottomNav.querySelectorAll(".gm-bottom-item").forEach(function (item) {
            item.classList.toggle("is-active", item === button);
          });

          var action = button.getAttribute("data-gm-action");
          if (action === "home") {
            callGlobal("resetCatalog");
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (action === "categories") {
            scrollToElement("categoryFilters");
          } else if (action === "wishlist") {
            callGlobal("openWishlist");
          } else if (action === "orders") {
            callGlobal("openCustomerOrders");
          } else if (action === "account") {
            if (typeof window.openGenmerchCustomerAccountEntry === "function") {
              callGlobal("openGenmerchCustomerAccountEntry");
            } else {
              callGlobal("openCustomerAuth");
            }
          }
        });
      });

      setBadgeFrom("wishlistBadge", "gmMobileWishlistBadge");
      setBadgeFrom("customerOrdersBadge", "gmMobileOrdersBadge");
    }
  });
})();