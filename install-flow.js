(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  if (params.get('install') !== '1') return;

  var installedKey = 'genmerch.install.flow.completed.v1';
  var shownKey = 'genmerch.install.flow.shown.v1';
  var deferredPrompt = null;
  var overlay = null;
  var successAlreadyShown = false;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true;
  }

  function safeStorageGet(storage, key) {
    try { return storage.getItem(key); } catch (error) { return null; }
  }

  function safeStorageSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (error) {}
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
        '<div class="gm-install-secured"><span class="gm-install-lock" aria-hidden="true">✓</span><span>Secured</span></div>' +
        '<div class="gm-install-brand-mark" aria-hidden="true"><img src="/icons/genmerch-install-192.svg" alt=""></div>' +
        '<h2 id="gmInstallTitle">Install app as a device shortcut</h2>' +
        '<p id="gmInstallDescription">Add GENMERCH to your home screen so you can open our official shop quickly whenever you need it.</p>' +
        '<button type="button" class="gm-install-primary" id="gmInstallYes">Yes</button>' +
      '</section>';
    document.body.appendChild(overlay);
    var button = document.getElementById('gmInstallYes');
    if (button) button.addEventListener('click', handleInstallClick);
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
    var title = apple ? 'Add GENMERCH to your Home Screen' : 'Install option not available yet';
    var instructions = apple
      ? 'Tap Share in your current browser, choose “Add to Home Screen”, then tap “Add”. This browser does not allow websites to open the install prompt automatically.'
      : /Android/i.test(window.navigator.userAgent)
        ? 'Open your browser menu (⋮) and choose “Install app” or “Add to Home screen”. The exact wording depends on your browser.'
        : 'Open your browser menu and look for “Install GENMERCH”, “Install page as app”, or “Add to Home Screen”. The option depends on your browser and device.';
    card.innerHTML =
      '<div class="gm-install-secured"><span class="gm-install-lock" aria-hidden="true">i</span><span>Install instructions</span></div>' +
      '<h2 id="gmInstallTitle">' + title + '</h2>' +
      '<p id="gmInstallDescription">' + instructions + '</p>' +
      '<p class="gm-install-note">No shortcut has been created yet. Follow the steps above to finish adding it.</p>' +
      '<button type="button" class="gm-install-primary" id="gmInstallGotIt">Got it</button>';
    var done = document.getElementById('gmInstallGotIt');
    if (done) done.addEventListener('click', removeOverlay);
    if (done) done.focus();
  }

  function showSuccess() {
    if (successAlreadyShown) return;
    successAlreadyShown = true;
    safeStorageSet(window.localStorage, installedKey, '1');
    removeOverlay();

    var toast = document.createElement('div');
    toast.className = 'gm-install-success-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = '<span class="gm-install-success-check" aria-hidden="true">✓</span><span></span>';
    toast.querySelector('span:last-child').textContent =
      'The application shortcut is now created in your home screen so you can always access it!';
    document.body.appendChild(toast);

    window.setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 5200);
    // Remove the install query from the URL so a refresh does not reopen the prompt.
    try {
      var cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('install');
      window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    } catch (error) {}
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
      try {
        var cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('install');
        window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      } catch (error) {}
      return;
    }
    if (safeStorageGet(window.sessionStorage, shownKey) === '1') return;
    safeStorageSet(window.sessionStorage, shownKey, '1');
    makeOverlay();
    var button = document.getElementById('gmInstallYes');
    if (button) button.focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();