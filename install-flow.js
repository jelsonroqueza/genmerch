(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var installRequested = params.get('install') === '1';
  var installedKey = 'genmerch.install.flow.completed.v1';
  var shownKey = 'genmerch.install.flow.shown.v1';
  var dismissedUntilKey = 'genmerch.install.flow.dismissed.until.v1';
  var dismissedForMs = 7 * 24 * 60 * 60 * 1000;
  var deferredPrompt = null;
  var overlay = null;
  var successAlreadyShown = false;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true;
  }

  function isSocialInAppBrowser() {
    var ua = window.navigator.userAgent || '';
    return /(FBAN|FBAV|FB_IAB|FBSS|FBIOS|FB4A|FBM|Messenger|Instagram|Twitter|com\.twitter\.android|\bX\/[\d.]+|X for iPhone|X for Android)/i.test(ua);
  }

  var socialInAppBrowser = isSocialInAppBrowser();

  // Do not interrupt ordinary direct visits. The install screen is activated for
  // social-media in-app browsers or an explicit ?install=1 shared link.
  if (!installRequested && !socialInAppBrowser) return;

  function safeStorageGet(storage, key) {
    try { return storage.getItem(key); } catch (error) { return null; }
  }

  function safeStorageSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (error) {}
  }

  function cleanInstallQuery() {
    try {
      var cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('install');
      window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    } catch (error) {}
  }

  function rememberDismissal() {
    safeStorageSet(window.localStorage, dismissedUntilKey, String(Date.now() + dismissedForMs));
    cleanInstallQuery();
  }

  function isDismissed() {
    var until = Number(safeStorageGet(window.localStorage, dismissedUntilKey) || 0);
    return Number.isFinite(until) && until > Date.now();
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
  });

  window.addEventListener('appinstalled', function () {
    safeStorageSet(window.localStorage, installedKey, '1');
    showSuccess();
  });

  function removeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  function makeOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'gm-install-overlay';
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML =
      '<section class="gm-install-card" role="dialog" aria-modal="true" aria-labelledby="gmInstallTitle" aria-describedby="gmInstallDescription">' +
        '<div class="gm-install-secured"><span class="gm-install-lock" aria-hidden="true">✓</span><span>GENMERCH App</span></div>' +
        '<div class="gm-install-brand-mark" aria-hidden="true"><img src="/icons/genmerch-install-192.svg" alt=""></div>' +
        '<h2 id="gmInstallTitle">Install GENMERCH for quicker shopping</h2>' +
        '<p id="gmInstallDescription">Add GENMERCH to your Home Screen for one-tap access to the official shop. You can also continue to the website without installing.</p>' +
        '<div class="gm-install-actions">' +
          '<button type="button" class="gm-install-primary" id="gmInstallYes">Install GENMERCH</button>' +
          '<button type="button" class="gm-install-secondary" id="gmInstallContinue">Continue to Website</button>' +
        '</div>' +
        '<p class="gm-install-footer-note">Installation is optional and depends on your device and browser.</p>' +
      '</section>';
    document.body.appendChild(overlay);

    var installButton = document.getElementById('gmInstallYes');
    var continueButton = document.getElementById('gmInstallContinue');
    if (installButton) installButton.addEventListener('click', handleInstallClick);
    if (continueButton) continueButton.addEventListener('click', handleContinue);
    if (installButton) installButton.focus();
  }

  function isAppleMobile() {
    return /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  }

  function showFallback() {
    if (!overlay) return;
    var card = overlay.querySelector('.gm-install-card');
    if (!card) return;

    var apple = isAppleMobile();
    var android = /Android/i.test(window.navigator.userAgent);
    var title;
    var instructions;

    if (socialInAppBrowser && apple) {
      title = 'Open GENMERCH in Safari to install';
      instructions = 'Tap the menu in this social app and choose “Open in Browser”. In Safari, tap Share, choose “Add to Home Screen”, then tap “Add”.';
    } else if (socialInAppBrowser && android) {
      title = 'Open GENMERCH in Chrome to install';
      instructions = 'Open this page in Chrome using the social app menu. In Chrome, tap ⋮ and choose “Install app” or “Add to Home screen”.';
    } else if (apple) {
      title = 'Add GENMERCH to your Home Screen';
      instructions = 'Open this page in Safari, tap Share, choose “Add to Home Screen”, then tap “Add”.';
    } else if (android) {
      title = 'Install GENMERCH from your browser';
      instructions = 'Open this page in Chrome, tap ⋮, then choose “Install app” or “Add to Home screen”. The available option depends on your device.';
    } else {
      title = 'Install option not available in this browser';
      instructions = 'Open GENMERCH in a supported browser and look for “Install app” or “Add to Home Screen” in the browser menu.';
    }

    card.innerHTML =
      '<div class="gm-install-secured"><span class="gm-install-lock" aria-hidden="true">i</span><span>Install instructions</span></div>' +
      '<h2 id="gmInstallTitle">' + title + '</h2>' +
      '<p id="gmInstallDescription">' + instructions + '</p>' +
      '<p class="gm-install-note">This browser did not provide an automatic install prompt. Follow the steps above if you want to install GENMERCH.</p>' +
      '<div class="gm-install-actions">' +
        '<button type="button" class="gm-install-primary" id="gmInstallDone">I’ve installed it</button>' +
        '<button type="button" class="gm-install-secondary" id="gmInstallContinue">Continue to Website</button>' +
      '</div>';

    var doneButton = document.getElementById('gmInstallDone');
    var continueButton = document.getElementById('gmInstallContinue');
    if (doneButton) doneButton.addEventListener('click', function () {
      safeStorageSet(window.localStorage, installedKey, '1');
      showSuccess();
    });
    if (continueButton) continueButton.addEventListener('click', handleContinue);
    if (doneButton) doneButton.focus();
  }

  function showSuccess() {
    if (successAlreadyShown) return;
    successAlreadyShown = true;
    safeStorageSet(window.localStorage, installedKey, '1');
    removeOverlay();
    cleanInstallQuery();

    var toast = document.createElement('div');
    toast.className = 'gm-install-success-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = '<span class="gm-install-success-check" aria-hidden="true">✓</span><span></span>';
    toast.querySelector('span:last-child').textContent =
      'GENMERCH is ready to open from your Home Screen.';
    document.body.appendChild(toast);

    window.setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 5200);
  }

  function handleContinue() {
    rememberDismissal();
    removeOverlay();
  }

  async function handleInstallClick() {
    var button = document.getElementById('gmInstallYes');
    if (button) {
      button.disabled = true;
      button.textContent = 'Please wait…';
    }

    if (isStandalone()) {
      showSuccess();
      return;
    }

    if (!deferredPrompt) {
      showFallback();
      return;
    }

    var promptEvent = deferredPrompt;
    deferredPrompt = null;

    try {
      await promptEvent.prompt();
      var result = await promptEvent.userChoice;
      if (result && result.outcome === 'accepted') {
        showSuccess();
      } else {
        showFallback();
      }
    } catch (error) {
      showFallback();
    }
  }

  function start() {
    if (isStandalone() || safeStorageGet(window.localStorage, installedKey) === '1') {
      cleanInstallQuery();
      return;
    }

    if (!installRequested && isDismissed()) return;
    if (safeStorageGet(window.sessionStorage, shownKey) === '1') return;

    safeStorageSet(window.sessionStorage, shownKey, '1');
    makeOverlay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();