(function () {
  'use strict';

  const state = {
    session: null,
    profile: null,
    avatarPath: null,
    avatarUrl: null,
    avatarOwnerId: null,
    avatarUrlExpiresAt: 0,
    avatarRequestToken: 0,
    avatarRefreshTimer: null,
    avatarNeedsRefresh: false,
    uploadingAvatar: false,
    orders: [],
    orderItems: [],
    shipments: [],
    addresses: [],
    landmarks: [],
    openAfterLogin: false,
    wishlist: [],
    reviews: [],
    points: { points_balance: 0, lifetime_earned: 0, lifetime_redeemed: 0, history: [] },
    activeTab: 'overview',
    navTab: 'overview',
    activityTab: 'wishlist',
    notificationBadgeObserver: null,
    checkoutBalance: 0,
    selectedPoints: 0,
    baseCheckoutTotal: '',
    loading: false,
    openingPromise: null,
    accountLoadPromise: null,
    accountLoadToken: 0,
    accountLoadedUserId: null,
    avatarSyncPending: false
  };

  const $ = (id) => document.getElementById(id);
  const ACCOUNT_PANEL_OPEN_KEY = 'genmerch.accountPanel.open';
  const ACCOUNT_PANEL_TAB_KEY = 'genmerch.accountPanel.tab';
  function accountPanelStorageGet(key) {
    try { return window.sessionStorage.getItem(key); } catch (_) { return null; }
  }
  function accountPanelStorageSet(key, value) {
    try { window.sessionStorage.setItem(key, String(value)); } catch (_) {}
  }
  function clearAccountPanelRestoreState() {
    try {
      window.sessionStorage.removeItem(ACCOUNT_PANEL_OPEN_KEY);
      window.sessionStorage.removeItem(ACCOUNT_PANEL_TAB_KEY);
    } catch (_) {}
  }
  function accountPanelRestoreRequested() {
    return accountPanelStorageGet(ACCOUNT_PANEL_OPEN_KEY) === '1';
  }
  const CUSTOMER_AVATAR_BUCKET = 'customer-avatars';
  const CUSTOMER_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
  const CUSTOMER_AVATAR_URL_TTL_SECONDS = 900;
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const php = (value) => new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: 'PHP', maximumFractionDigits: 2
  }).format(Number(value) || 0);
  const dateLabel = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const dateTimeLabel = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const displayStatus = (value) => String(value || 'pending').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const client = () => {
    if (typeof getCustomerAuthClient === 'function') return getCustomerAuthClient();
    throw new Error('The GENMERCH account service is not ready. Refresh the page and try again.');
  };
  const currentUserName = (user, profile) => {
    const metadata = user && user.user_metadata ? user.user_metadata : {};
    return String((profile && profile.full_name) || metadata.full_name || metadata.name || '').trim();
  };
  const currentPhone = (user, profile) => {
    const metadata = user && user.user_metadata ? user.user_metadata : {};
    return String((profile && profile.phone) || metadata.phone || user.phone || '').trim();
  };
  function avatarPlaceholderMarkup() {
    return '<svg class="gmca-avatar-placeholder" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c.7-4.6 3.4-7 8-7s7.3 2.4 8 7"></path></svg>';
  }

  function avatarMarkup() {
    if (state.avatarUrl) {
      return '<img class="gmca-avatar-image" src="' + esc(state.avatarUrl) + '" alt="" draggable="false" referrerpolicy="no-referrer">';
    }
    return avatarPlaceholderMarkup();
  }

  function updateAccountAvatarMarkup() {
    const markup = avatarMarkup();
    ['gmcaWelcomeAvatar', 'gmcaProfileAvatar'].forEach((id) => {
      const node = $(id);
      if (!node) return;
      node.innerHTML = markup;
      const image = node.querySelector('.gmca-avatar-image');
      if (!image) return;
      image.addEventListener('error', () => {
        const failedUrl = image.getAttribute('src') || '';
        if (state.avatarUrl && failedUrl === state.avatarUrl) {
          state.avatarUrl = null;
          state.avatarUrlExpiresAt = 0;
          state.avatarNeedsRefresh = true;
          syncStorefrontCustomerAvatar(null);
        }
      }, { once: true });
    });
  }

  function syncStorefrontCustomerAvatar(url, identity) {
    updateAccountAvatarMarkup();
    const button = $('customerAccountButton');
    const icon = button && button.querySelector('.header-icon');
    if (!button || !icon) return;

    let image = icon.querySelector('.gmca-storefront-avatar-image');
    if (!url) {
      if (image) image.remove();
      button.classList.remove('gmca-storefront-has-avatar');
      return;
    }

    if (!image) {
      image = document.createElement('img');
      image.className = 'gmca-storefront-avatar-image';
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.setAttribute('draggable', 'false');
      image.setAttribute('referrerpolicy', 'no-referrer');
      image.decoding = 'async';
      image.addEventListener('error', () => {
        button.classList.remove('gmca-storefront-has-avatar');
        image.remove();
        if (state.avatarUrl) {
          state.avatarUrl = null;
          state.avatarUrlExpiresAt = 0;
          state.avatarNeedsRefresh = true;
        }
        updateAccountAvatarMarkup();
        console.warn('GENMERCH storefront avatar image could not be displayed; it will be refreshed on the next account sync.');
      }, { once: true });
      icon.appendChild(image);
    }

    image.src = url;
    image.title = identity ? String(identity) + ' profile photo' : 'Customer profile photo';
    button.classList.add('gmca-storefront-has-avatar');
  }

  function clearStorefrontAvatarRefreshTimer() {
    if (state.avatarRefreshTimer !== null) {
      window.clearTimeout(state.avatarRefreshTimer);
      state.avatarRefreshTimer = null;
    }
  }

  function clearCustomerAvatarForSignedOut() {
    state.avatarRequestToken += 1;
    clearStorefrontAvatarRefreshTimer();
    state.avatarPath = null;
    state.avatarUrl = null;
    state.avatarOwnerId = null;
    state.avatarUrlExpiresAt = 0;
    state.avatarNeedsRefresh = false;
    state.avatarSyncPending = false;
    state.accountLoadedUserId = null;
    state.accountLoadToken += 1;
    syncStorefrontCustomerAvatar(null);
  }

  function scheduleStorefrontAvatarRefresh(userId) {
    clearStorefrontAvatarRefreshTimer();
    if (!state.avatarUrl || !userId) return;
    const refreshDelay = Math.max(60000, (CUSTOMER_AVATAR_URL_TTL_SECONDS - 120) * 1000);
    state.avatarRefreshTimer = window.setTimeout(async () => {
      state.avatarRefreshTimer = null;
      if (document.visibilityState === 'hidden') {
        state.avatarNeedsRefresh = true;
        return;
      }
      const currentUser = state.session && state.session.user;
      if (currentUser && String(currentUser.id) === String(userId)) {
        await refreshStorefrontAvatarForSession(state.session);
      }
    }, refreshDelay);
  }

  async function refreshStorefrontAvatarForSession(session) {
    const user = session && session.user ? session.user : null;
    if (!user || !user.id) {
      clearCustomerAvatarForSignedOut();
      return;
    }

    const userId = String(user.id);
    const requestToken = ++state.avatarRequestToken;
    state.avatarSyncPending = true;
    if (state.avatarOwnerId !== userId) {
      clearStorefrontAvatarRefreshTimer();
      state.avatarOwnerId = userId;
      state.avatarPath = null;
      state.avatarUrl = null;
      state.avatarUrlExpiresAt = 0;
      state.avatarNeedsRefresh = false;
      syncStorefrontCustomerAvatar(null);
    }

    try {
      const db = client();
      const profileResult = await db.from('profiles')
        .select('avatar_path')
        .eq('id', userId)
        .maybeSingle();
      if (requestToken !== state.avatarRequestToken) return;
      if (profileResult.error) throw profileResult.error;

      const path = String(profileResult.data && profileResult.data.avatar_path || '').trim();
      if (!path || !path.startsWith(userId + '/')) {
        clearStorefrontAvatarRefreshTimer();
        state.avatarPath = null;
        state.avatarUrl = null;
        state.avatarUrlExpiresAt = 0;
        state.avatarNeedsRefresh = false;
        syncStorefrontCustomerAvatar(null);
        return;
      }

      if (state.avatarPath === path && state.avatarUrl && state.avatarUrlExpiresAt > Date.now() + 120000) {
        const identity = currentUserName(user, state.profile) || user.email || 'Customer';
        syncStorefrontCustomerAvatar(state.avatarUrl, identity);
        scheduleStorefrontAvatarRefresh(userId);
        return;
      }

      const signedResult = await db.storage
        .from(CUSTOMER_AVATAR_BUCKET)
        .createSignedUrl(path, CUSTOMER_AVATAR_URL_TTL_SECONDS);
      if (requestToken !== state.avatarRequestToken) return;
      if (signedResult.error) throw signedResult.error;

      const signedUrl = signedResult.data && signedResult.data.signedUrl
        ? signedResult.data.signedUrl
        : null;
      if (!signedUrl) throw new Error('Supabase did not return a signed avatar URL.');

      state.avatarOwnerId = userId;
      state.avatarPath = path;
      state.avatarUrl = signedUrl;
      state.avatarUrlExpiresAt = Date.now() + CUSTOMER_AVATAR_URL_TTL_SECONDS * 1000;
      state.avatarNeedsRefresh = false;

      const identity = currentUserName(user, state.profile) || user.email || 'Customer';
      syncStorefrontCustomerAvatar(signedUrl, identity);
      scheduleStorefrontAvatarRefresh(userId);
    } catch (error) {
      if (requestToken === state.avatarRequestToken) {
        console.warn('GENMERCH storefront avatar sync could not refresh:', error.message || error);
      }
    } finally {
      if (requestToken === state.avatarRequestToken) state.avatarSyncPending = false;
    }
  }

  function handleStorefrontAvatarVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    const user = state.session && state.session.user;
    if (!user) return;
    if (state.avatarNeedsRefresh ||
        (state.avatarUrlExpiresAt && Date.now() >= state.avatarUrlExpiresAt - 120000)) {
      refreshStorefrontAvatarForSession(state.session);
    }
  }

  const asArray = (result) => result && Array.isArray(result.data) ? result.data : [];
  async function tryQuery(factory, fallback) {
    try {
      const result = await factory();
      if (result && result.error) {
        console.warn('GENMERCH account data request failed:', result.error.message || result.error);
        return { data: fallback, count: null, error: result.error };
      }
      return result || { data: fallback, count: null };
    } catch (error) {
      console.warn('GENMERCH account data request failed:', error);
      return { data: fallback, count: null, error };
    }
  }

  function hideAddressBookSuggestions() {
    document.querySelectorAll('.gmca-address-suggestions').forEach((box) => {
      box.classList.remove('open');
      const input = box.closest('.gmca-address-autocomplete')?.querySelector('input');
      if (input) input.setAttribute('aria-expanded', 'false');
    });
  }

  function syncAccountNotificationBadge() {
    const source = $('genmerchNotificationBadge');
    const badge = $('gmcaNotificationBadge');
    const button = $('gmcaNotificationButton');
    if (!badge || !button) return;
    const unread = source && !source.hidden ? Math.max(0, Number(source.textContent) || 0) : 0;
    badge.textContent = String(unread > 99 ? 99 : unread);
    badge.hidden = unread <= 0;
    button.setAttribute('aria-label', unread ? 'Order notifications, ' + unread + ' unread updates' : 'Order notifications');
  }

  function ensureModal() {
    if ($('gmcaOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'gmcaOverlay';
    overlay.className = 'gmca-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<section class="gmca-modal" role="dialog" aria-modal="true" aria-labelledby="gmcaTitle">' +
        '<header class="gmca-header">' +
          '<div class="gmca-header-top">' +
            '<div class="gmca-brand">' +
              '<span class="gmca-brand-mark"><img src="/assets/genmerch-cart-actual.webp?v=20261031-account" alt="" width="72" height="56"></span>' +
              '<div class="gmca-brand-copy">' +
                '<div class="gmca-brand-line"><span class="gmca-word-gen">GEN</span><span class="gmca-word-merch">MERCH</span><span class="gmca-brand-divider" aria-hidden="true"></span><strong id="gmcaTitle">My Account</strong></div>' +
                '<p id="gmcaWelcome">Your shopping activity, rewards and personal information.</p>' +
              '</div>' +
            '</div>' +
            '<div class="gmca-header-actions">' +
              '<button type="button" class="gmca-notification-button" id="gmcaNotificationButton" aria-label="Order notifications" title="Order notifications"><span class="gmca-notification-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="gmca-notification-badge" id="gmcaNotificationBadge" hidden>0</span></span></button>' +
              '<button type="button" class="gmca-close" id="gmcaClose" aria-label="Close account">×</button>' +
            '</div>' +
          '</div>' +
        '</header>' +
        '<nav class="gmca-tabs" id="gmcaTabs" role="tablist" aria-label="Customer account navigation">' +
          '<button type="button" class="active" role="tab" aria-selected="true" aria-controls="gmcaPaneOverview" data-gmca-section="overview"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg><span>Overview</span></button>' +
          '<button type="button" role="tab" aria-selected="false" aria-controls="gmcaPaneOrders" data-gmca-section="orders"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21"/></svg><span>My Orders</span></button>' +
          '<button type="button" role="tab" aria-selected="false" aria-controls="gmcaPaneActivity" data-gmca-section="wishlist"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.7c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11a4.7 4.7 0 0 1 8.8-2.3 4.7 4.7 0 0 1 8.8 2.3z"/></svg><span>Wishlist</span></button>' +
          '<button type="button" role="tab" aria-selected="false" aria-controls="gmcaPaneActivity" data-gmca-section="reviews"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></svg><span>My Reviews</span></button>' +
          '<button type="button" role="tab" aria-selected="false" aria-controls="gmcaPanePoints" data-gmca-section="points"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M17 7.2c-.7-1.1-2.1-1.7-4.1-1.7-2.5 0-4.1 1.1-4.1 2.8 0 4.4 8.4 1.6 8.4 6.1 0 1.9-1.7 3.2-4.4 3.2-2.1 0-3.8-.7-4.8-2"/></svg><span>Rewards &amp; Points</span></button>' +
          '<button type="button" role="tab" aria-selected="false" aria-controls="gmcaPaneProfile" data-gmca-section="profile"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c.7-4.1 3.4-6.3 8-6.3s7.3 2.2 8 6.3"/></svg><span>My Profile</span></button>' +
          '<button type="button" role="tab" aria-selected="false" aria-controls="gmcaPaneAddresses" data-gmca-section="settings"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.7 3-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-3.4l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.7-3 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.7-3 1.7.7a8 8 0 0 1 1.7-1l.3-1.8h3.4l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.7 3-1.4 1.1a7 7 0 0 1 0 2z"/></svg><span>Account Settings</span></button>' +
        '</nav>' +
        '<div class="gmca-content">' +
          '<div class="gmca-alert" id="gmcaAlert" role="status" aria-live="polite" hidden></div>' +
          '<div id="gmcaLoading" class="gmca-loading" role="status" aria-live="polite"><span class="gmca-loading-spinner" aria-hidden="true"></span><span>Loading your account…</span></div>' +
          '<section class="gmca-pane" id="gmcaPaneOverview" data-gmca-pane="overview" role="tabpanel" hidden></section>' +
          '<section class="gmca-pane" id="gmcaPaneProfile" data-gmca-pane="profile" role="tabpanel" hidden></section>' +
          '<section class="gmca-pane" id="gmcaPanePoints" data-gmca-pane="points" role="tabpanel" hidden></section>' +
          '<section class="gmca-pane" id="gmcaPaneOrders" data-gmca-pane="orders" role="tabpanel" hidden></section>' +
          '<section class="gmca-pane" id="gmcaPaneActivity" data-gmca-pane="activity" role="tabpanel" hidden></section>' +
          '<section class="gmca-pane" id="gmcaPaneAddresses" data-gmca-pane="addresses" role="tabpanel" hidden></section>' +
          '<section class="gmca-pane" id="gmcaPaneLandmarks" data-gmca-pane="landmarks" role="tabpanel" hidden></section>' +
        '</div>' +
        '<footer class="gmca-footer"><span><span class="gmca-footer-lock">✓</span> Your account records are protected by your signed-in account permissions.</span><button type="button" id="gmcaSignOut" class="gmca-signout">Sign out</button></footer>' +
        '<input type="file" id="gmcaAvatarFileInput" accept="image/jpeg,image/png,image/webp" aria-label="Choose a profile photo" hidden>' +
      '</section>';
    document.body.appendChild(overlay);
    ensureSignOutConfirmation();
    overlay.addEventListener('click', (event) => {
      // Backdrop taps do not dismiss the account panel; use the explicit close control.
      const avatarTrigger = event.target.closest('[data-gmca-avatar-upload]');
      if (avatarTrigger) {
        event.preventDefault();
        const input = $('gmcaAvatarFileInput');
        if (input && !state.uploadingAvatar) input.click();
        return;
      }
      const avatarRemoveTrigger = event.target.closest('[data-gmca-avatar-remove]');
      if (avatarRemoveTrigger) {
        event.preventDefault();
        removeCustomerAvatar();
        return;
      }
      const tab = event.target.closest('[data-gmca-section]');
      if (tab) {
        switchTab(tab.getAttribute('data-gmca-section'));
        tab.focus({ preventScroll: true });
      }
      if (!event.target.closest('.gmca-address-autocomplete')) hideAddressBookSuggestions();
    });
    $('gmcaClose').addEventListener('click', closeAccount);
    $('gmcaNotificationButton').addEventListener('click', () => {
      if (typeof window.toggleGenmerchNotifications === 'function') window.toggleGenmerchNotifications();
      else showAlert('Order notifications are temporarily unavailable. Please refresh and try again.', 'warning');
    });
    syncAccountNotificationBadge();
    if (typeof MutationObserver === 'function') {
      const sourceBadge = $('genmerchNotificationBadge');
      if (sourceBadge && !state.notificationBadgeObserver) {
        state.notificationBadgeObserver = new MutationObserver(syncAccountNotificationBadge);
        state.notificationBadgeObserver.observe(sourceBadge, { attributes: true, childList: true, characterData: true, subtree: true });
      }
    }
    $('gmcaSignOut').addEventListener('click', openSignOutConfirmation);
    $('gmcaAvatarFileInput').addEventListener('change', handleCustomerAvatarSelection);
    overlay.addEventListener('submit', (event) => {
      if (event.target && event.target.id === 'gmcaProfileForm') {
        event.preventDefault();
        saveProfile();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if ($('gmcaSignOutConfirm') && !$('gmcaSignOutConfirm').hidden) {
        closeSignOutConfirmation();
        return;
      }
      if ($('gmcaOverlay') && $('gmcaOverlay').classList.contains('open')) closeAccount();
    });
  }


  function toggleSectionMenu() {
    const menu = $('gmcaSectionMenu');
    const trigger = $('gmcaSectionTrigger');
    if (!menu || !trigger) return;
    const opening = menu.hidden;
    menu.hidden = !opening;
    trigger.setAttribute('aria-expanded', String(opening));
    trigger.classList.toggle('is-open', opening);
    if (opening) {
      const active = menu.querySelector('[aria-selected="true"]') || menu.querySelector('[data-gmca-section]');
      if (active) active.focus({ preventScroll: true });
    }
  }

  function closeSectionMenu() {
    const menu = $('gmcaSectionMenu');
    const trigger = $('gmcaSectionTrigger');
    if (menu) menu.hidden = true;
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.classList.remove('is-open');
    }
  }

  function ensureSignOutConfirmation() {
    if ($('gmcaSignOutConfirm')) return;
    const prompt = document.createElement('div');
    prompt.id = 'gmcaSignOutConfirm';
    prompt.className = 'gmca-signout-overlay';
    prompt.hidden = true;
    prompt.setAttribute('aria-hidden', 'true');
    prompt.innerHTML =
      '<section class="gmca-signout-dialog" role="alertdialog" aria-modal="true" aria-labelledby="gmcaSignOutTitle" aria-describedby="gmcaSignOutDescription">' +
        '<div class="gmca-signout-emblem" aria-hidden="true">!</div>' +
        '<h2 id="gmcaSignOutTitle">Confirm sign out</h2>' +
        '<p id="gmcaSignOutDescription">For your account security, re-enter your registered email address before signing out.</p>' +
        '<p class="gmca-signout-email-hint">Registered email: <strong id="gmcaSignOutExpectedEmail"></strong></p>' +
        '<form id="gmcaSignOutConfirmForm" novalidate>' +
          '<label for="gmcaSignOutEmailInput">Re-enter registered email</label>' +
          '<input id="gmcaSignOutEmailInput" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254" placeholder="you@example.com" required>' +
          '<p id="gmcaSignOutFeedback" class="gmca-signout-feedback" role="status" aria-live="polite"></p>' +
          '<div class="gmca-signout-actions"><button type="button" class="gmca-secondary" id="gmcaSignOutCancel">Cancel</button><button type="submit" class="gmca-danger" id="gmcaSignOutConfirmButton">Confirm sign out</button></div>' +
        '</form>' +
      '</section>';
    document.body.appendChild(prompt);
    prompt.addEventListener('click', (event) => {
      if (event.target === prompt) closeSignOutConfirmation();
    });
    $('gmcaSignOutCancel').addEventListener('click', closeSignOutConfirmation);
    $('gmcaSignOutConfirmForm').addEventListener('submit', confirmSignOutWithEmail);
  }

  function openSignOutConfirmation() {
    ensureSignOutConfirmation();
    const email = String(state.session && state.session.user && state.session.user.email || '').trim();
    if (!email) {
      showAlert('Your registered email could not be verified. Refresh your account session before signing out.', 'error');
      return;
    }
    $('gmcaSignOutExpectedEmail').textContent = email;
    $('gmcaSignOutEmailInput').value = '';
    $('gmcaSignOutFeedback').textContent = '';
    $('gmcaSignOutFeedback').className = 'gmca-signout-feedback';
    $('gmcaSignOutConfirm').hidden = false;
    $('gmcaSignOutConfirm').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => $('gmcaSignOutEmailInput')?.focus(), 0);
  }

  function closeSignOutConfirmation() {
    const prompt = $('gmcaSignOutConfirm');
    if (!prompt) return;
    prompt.hidden = true;
    prompt.setAttribute('aria-hidden', 'true');
    if ($('gmcaOverlay') && $('gmcaOverlay').classList.contains('open')) {
      document.body.style.overflow = 'hidden';
      $('gmcaSignOut')?.focus();
    } else if (!$('customerAuthOverlay')?.classList.contains('open') &&
               !$('customerOrdersOverlay')?.classList.contains('open') &&
               !$('cartModal')?.classList.contains('open') &&
               !$('productOverlay')?.classList.contains('open')) {
      document.body.style.overflow = '';
    }
  }

  async function confirmSignOutWithEmail(event) {
    event.preventDefault();
    const expected = String(state.session && state.session.user && state.session.user.email || '').trim();
    const entered = String($('gmcaSignOutEmailInput').value || '').trim();
    const feedback = $('gmcaSignOutFeedback');
    const button = $('gmcaSignOutConfirmButton');
    if (!expected) {
      feedback.textContent = 'We could not verify the registered email. Refresh the page and try again.';
      feedback.className = 'gmca-signout-feedback error';
      return;
    }
    if (!entered || entered.toLocaleLowerCase() !== expected.toLocaleLowerCase()) {
      feedback.textContent = 'The email does not match this account. Please enter the registered email exactly.';
      feedback.className = 'gmca-signout-feedback error';
      $('gmcaSignOutEmailInput').focus();
      $('gmcaSignOutEmailInput').select();
      return;
    }
    if (button) { button.disabled = true; button.textContent = 'Signing out…'; }
    try {
      const completed = await signOut();
      if (completed) {
        closeSignOutConfirmation();
      } else {
        feedback.textContent = 'Sign-out failed. Your account is still signed in; please try again.';
        feedback.className = 'gmca-signout-feedback error';
      }
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Confirm sign out'; }
    }
  }

  function showAlert(message, kind) {
    const alert = $('gmcaAlert');
    if (!alert) return;
    alert.textContent = message || '';
    alert.className = 'gmca-alert' + (kind ? ' ' + kind : '');
    alert.hidden = !message;
  }

  function switchTab(tabName) {
    let paneTab = String(tabName || 'overview');
    let navTab = paneTab;
    if (paneTab === 'wishlist' || paneTab === 'reviews') {
      state.activityTab = paneTab;
      paneTab = 'activity';
    } else if (paneTab === 'activity') {
      state.activityTab = 'wishlist';
      navTab = 'wishlist';
    } else if (paneTab === 'settings' || paneTab === 'addresses') {
      paneTab = 'addresses';
      navTab = 'settings';
    } else if (paneTab === 'landmarks') {
      navTab = 'settings';
    }
    const valid = ['overview', 'profile', 'points', 'orders', 'activity', 'addresses', 'landmarks'];
    if (!valid.includes(paneTab)) {
      paneTab = 'overview';
      navTab = 'overview';
    }
    state.activeTab = paneTab;
    state.navTab = navTab;
    if (accountPanelRestoreRequested()) {
      const savedTab = state.activeTab === 'activity'
        ? state.activityTab
        : (state.activeTab === 'addresses' || state.activeTab === 'landmarks' ? 'settings' : state.activeTab);
      accountPanelStorageSet(ACCOUNT_PANEL_TAB_KEY, savedTab);
    }
    document.querySelectorAll('#gmcaTabs [data-gmca-section]').forEach((button) => {
      const active = button.getAttribute('data-gmca-section') === state.navTab;
      button.setAttribute('aria-selected', String(active));
      button.classList.toggle('active', active);
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('[data-gmca-pane]').forEach((pane) => {
      pane.hidden = pane.getAttribute('data-gmca-pane') !== state.activeTab;
    });
    if (state.activeTab === 'points') renderPointsPane();
    if (state.activeTab === 'orders') renderOrdersPane();
    if (state.activeTab === 'activity') renderActivityPane();
    if (state.activeTab === 'profile') renderProfilePane();
    if (state.activeTab === 'overview') renderOverviewPane();
    if (state.activeTab === 'addresses') renderAddressesPane();
    if (state.activeTab === 'landmarks') renderLandmarksPane();
  }


  async function openAccount(restoreSavedTab) {
    ensureModal();
    if (state.openingPromise) return state.openingPromise;

    const openingPromise = (async () => {
      const overlay = $('gmcaOverlay');
      const cachedSession = state.session && state.session.user ? state.session : null;
      const cachedUserId = cachedSession ? String(cachedSession.user.id) : '';
      const warmAccount = Boolean(cachedUserId && state.accountLoadedUserId === cachedUserId);
      const savedTab = restoreSavedTab === true
        ? (accountPanelStorageGet(ACCOUNT_PANEL_TAB_KEY) || 'overview')
        : 'overview';

      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      if (warmAccount) {
        $('gmcaLoading').hidden = true;
      } else {
        $('gmcaLoading').hidden = false;
        document.querySelectorAll('[data-gmca-pane]').forEach((pane) => { pane.hidden = true; });
      }

      try {
        let session = cachedSession;
        if (!session) {
          const { data, error } = await client().auth.getSession();
          if (error) throw error;
          session = data && data.session ? data.session : null;
        }

        if (!overlay.classList.contains('open')) return;
        if (!session || !session.user) {
          state.openAfterLogin = true;
          closeAccount();
          if (typeof window.openCustomerAuth === 'function') window.openCustomerAuth();
          return;
        }

        state.session = session;
        accountPanelStorageSet(ACCOUNT_PANEL_OPEN_KEY, '1');
        const userId = String(session.user.id);
        const hasWarmAccount = state.accountLoadedUserId === userId;
        if (hasWarmAccount) {
          $('gmcaLoading').hidden = true;
          switchTab(savedTab);
          return;
        }

        $('gmcaLoading').hidden = false;
        document.querySelectorAll('[data-gmca-pane]').forEach((pane) => { pane.hidden = true; });
        await loadAccountData();
        if (overlay.classList.contains('open')) switchTab(savedTab);
      } catch (error) {
        if (overlay.classList.contains('open')) {
          overlay.classList.add('open');
          overlay.setAttribute('aria-hidden', 'false');
          document.body.style.overflow = 'hidden';
          showAlert(error.message || 'Unable to load your GENMERCH account. Please refresh and try again.', 'error');
          $('gmcaLoading').hidden = true;
        }
      }
    })();

    state.openingPromise = openingPromise;
    try {
      await openingPromise;
    } finally {
      if (state.openingPromise === openingPromise) state.openingPromise = null;
    }
  }

  function closeAccount() {
    const overlay = $('gmcaOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    clearAccountPanelRestoreState();
    if (!$('customerAuthOverlay')?.classList.contains('open') &&
        !$('customerOrdersOverlay')?.classList.contains('open') &&
        !$('cartModal')?.classList.contains('open') &&
        !$('productOverlay')?.classList.contains('open')) {
      document.body.style.overflow = '';
    }
  }

  async function signOut() {
    const button = $('gmcaSignOut');
    if (button) { button.disabled = true; button.textContent = 'Signing out…'; }
    try {
      const { error } = await client().auth.signOut();
      if (error) throw error;
      state.session = null;
      state.profile = null;
      clearCustomerAvatarForSignedOut();
      state.checkoutBalance = 0;
      state.selectedPoints = 0;
      window.genmerchSelectedLoyaltyPoints = 0;
      closeAccount();
      renderCheckoutPoints();
      if (typeof window.updateCustomerAuthScreen === 'function') window.updateCustomerAuthScreen(null);
      return true;
    } catch (error) {
      showAlert(error.message || 'Could not sign out. Please try again.', 'error');
      return false;
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Sign out'; }
    }
  }

  function syncCustomerAvatarFromProfile(user, userId, rawPath, db) {
    const path = String(rawPath || '').trim();
    const validPath = path && path.startsWith(String(userId) + '/') ? path : null;
    const identity = currentUserName(user, state.profile) || user.email || 'Customer';

    if (!validPath) {
      state.avatarRequestToken += 1;
      clearStorefrontAvatarRefreshTimer();
      state.avatarPath = null;
      state.avatarUrl = null;
      state.avatarUrlExpiresAt = 0;
      state.avatarNeedsRefresh = false;
      state.avatarSyncPending = false;
      state.avatarOwnerId = String(userId);
      syncStorefrontCustomerAvatar(null, identity);
      return;
    }

    const sameAvatar = state.avatarOwnerId === String(userId) && state.avatarPath === validPath;
    state.avatarPath = validPath;
    state.avatarOwnerId = String(userId);
    if (sameAvatar && state.avatarUrl && state.avatarUrlExpiresAt > Date.now() + 120000) {
      syncStorefrontCustomerAvatar(state.avatarUrl, identity);
      scheduleStorefrontAvatarRefresh(userId);
      return;
    }
    if (state.avatarSyncPending && sameAvatar) return;

    const requestToken = ++state.avatarRequestToken;
    clearStorefrontAvatarRefreshTimer();
    state.avatarSyncPending = true;
    state.avatarUrl = null;
    state.avatarUrlExpiresAt = 0;
    state.avatarNeedsRefresh = false;
    syncStorefrontCustomerAvatar(null, identity);

    db.storage.from(CUSTOMER_AVATAR_BUCKET)
      .createSignedUrl(validPath, CUSTOMER_AVATAR_URL_TTL_SECONDS)
      .then((result) => {
        if (requestToken !== state.avatarRequestToken) return;
        if (result.error) throw result.error;
        const signedUrl = result.data && result.data.signedUrl ? result.data.signedUrl : null;
        if (!signedUrl) throw new Error('Supabase did not return a signed avatar URL.');
        state.avatarUrl = signedUrl;
        state.avatarUrlExpiresAt = Date.now() + CUSTOMER_AVATAR_URL_TTL_SECONDS * 1000;
        state.avatarNeedsRefresh = false;
        syncStorefrontCustomerAvatar(signedUrl, identity);
        scheduleStorefrontAvatarRefresh(userId);
      })
      .catch((error) => {
        if (requestToken === state.avatarRequestToken) {
          state.avatarUrl = null;
          state.avatarUrlExpiresAt = 0;
          state.avatarNeedsRefresh = true;
          syncStorefrontCustomerAvatar(null, identity);
          console.warn('GENMERCH account profile photo could not be loaded:', error.message || error);
        }
      })
      .finally(() => {
        if (requestToken === state.avatarRequestToken) state.avatarSyncPending = false;
      });
  }

  async function loadAccountData() {
    if (!state.session || !state.session.user) return;
    if (state.accountLoadPromise) return state.accountLoadPromise;

    const user = state.session.user;
    const userId = String(user.id);
    const requestToken = ++state.accountLoadToken;
    const showBlockingLoader = state.accountLoadedUserId !== userId;
    const db = client();

    const loadPromise = (async () => {
      if (showBlockingLoader) $('gmcaLoading').hidden = false;
      showAlert('');

      const [profileResult, orderResult, addressResult, wishlistResult, reviewResult, pointsResult, landmarksResult] = await Promise.all([
        tryQuery(() => db.from('profiles').select('id,full_name,phone,avatar_path,created_at,updated_at').eq('id', userId).maybeSingle(), null),
        tryQuery(() => db.from('orders').select('id,order_number,status,payment_status,payment_method,subtotal,shipping_fee,discount_amount,total_amount,loyalty_points_redeemed,loyalty_points_discount,created_at,updated_at,receipt_email', { count: 'exact' }).eq('user_id', userId).order('created_at', { ascending: false }).limit(20), []),
        tryQuery(() => db.from('customer_addresses').select('id,address_label,recipient_name,phone,province,city_municipality,barangay,postal_code,street_address,landmark,delivery_instructions,is_default,created_at,updated_at').eq('user_id', userId).order('is_default', { ascending: false }).order('created_at', { ascending: false }), []),
        tryQuery(() => db.from('customer_wishlist').select('product_id,created_at').eq('user_id', userId).order('created_at', { ascending: false }), []),
        tryQuery(() => db.from('product_reviews').select('id,product_id,order_id,rating,feedback,nickname,moderation_status,created_at').eq('user_id', userId).order('created_at', { ascending: false }), []),
        tryQuery(() => db.rpc('get_my_genmerch_loyalty_summary'), null),
        tryQuery(() => db.from('customer_default_landmarks').select('id,label,landmark,delivery_instructions,is_default,created_at,updated_at').eq('user_id', userId).order('is_default', { ascending: false }).order('created_at', { ascending: false }), [])
      ]);

      if (requestToken !== state.accountLoadToken ||
          !state.session || !state.session.user ||
          String(state.session.user.id) !== userId) return;

      state.profile = profileResult.data || null;
      if (!profileResult.error) {
        syncCustomerAvatarFromProfile(user, userId, state.profile && state.profile.avatar_path, db);
      }

      state.orders = asArray(orderResult);
      state.orderCount = typeof orderResult.count === 'number' ? orderResult.count : state.orders.length;
      state.addresses = asArray(addressResult);
      const cachedWishlistProducts = new Map(
        (state.wishlist || []).filter((wish) => wish.product).map((wish) => [String(wish.product_id), wish.product])
      );
      state.wishlist = asArray(wishlistResult).map((wish) => ({
        ...wish,
        product: cachedWishlistProducts.get(String(wish.product_id)) || null
      }));
      state.landmarks = asArray(landmarksResult);
      state.reviews = asArray(reviewResult);
      state.points = pointsResult.data && typeof pointsResult.data === 'object'
        ? pointsResult.data
        : { points_balance: 0, lifetime_earned: 0, lifetime_redeemed: 0, history: [] };
      state.checkoutBalance = Math.max(0, Number(state.points.points_balance) || 0);
      state.selectedPoints = Math.min(state.selectedPoints, state.checkoutBalance);
      window.genmerchSelectedLoyaltyPoints = state.selectedPoints;

      if (showBlockingLoader) {
        state.orderItems = [];
        state.shipments = [];
      }
      const orderIds = state.orders.map((order) => order.id);
      const wishlistProductIds = [...new Set(state.wishlist.map((row) => String(row.product_id)))];

      state.accountLoadedUserId = userId;
      state.loading = false;
      $('gmcaWelcome').textContent = 'Your shopping activity, rewards and personal information.';
      $('gmcaLoading').hidden = true;
      renderAllPanes();
      renderCheckoutPoints();
      renderCheckoutAddressPicker();

      if ([profileResult, orderResult, addressResult, wishlistResult, reviewResult, pointsResult, landmarksResult].some((result) => result && result.error)) {
        showAlert('Some account information could not be loaded. Check your connection and tap Refresh account.', 'warning');
      }

      // Supporting lookups no longer hold the account screen behind the loading indicator.
      loadAccountSupplementalData(db, userId, requestToken, orderIds, wishlistProductIds)
        .catch((error) => console.warn('GENMERCH account detail enrichment could not finish:', error.message || error));
    })();

    state.accountLoadPromise = loadPromise;
    try {
      await loadPromise;
    } finally {
      if (state.accountLoadPromise === loadPromise) state.accountLoadPromise = null;
    }
  }

  async function loadAccountSupplementalData(db, userId, requestToken, orderIds, wishlistProductIds) {
    const orderDetailsPromise = orderIds.length
      ? Promise.all([
          tryQuery(() => db.from('order_items').select('order_id,product_name,size_label,color_label,quantity,unit_price,line_total').in('order_id', orderIds), []),
          tryQuery(() => db.from('shipments').select('order_id,courier_name,tracking_number,tracking_url,status,shipped_at,delivered_at').in('order_id', orderIds), [])
        ])
      : Promise.resolve(null);

    const wishlistProductsPromise = wishlistProductIds.length
      ? tryQuery(() => db.from('products').select('id,name,base_price,slug,is_active,is_deleted').in('id', wishlistProductIds), [])
      : Promise.resolve(null);

    const [orderDetails, productResult] = await Promise.all([orderDetailsPromise, wishlistProductsPromise]);
    if (requestToken !== state.accountLoadToken ||
        !state.session || !state.session.user ||
        String(state.session.user.id) !== String(userId)) return;

    let ordersUpdated = false;
    if (orderDetails) {
      state.orderItems = asArray(orderDetails[0]);
      state.shipments = asArray(orderDetails[1]);
      ordersUpdated = true;
    }

    let wishlistUpdated = false;
    if (productResult) {
      const products = asArray(productResult);
      state.wishlist = state.wishlist.map((wish) => ({
        ...wish,
        product: products.find((product) => String(product.id) === String(wish.product_id)) || null
      }));
      wishlistUpdated = true;
    }

    if (!$('gmcaOverlay') || !$('gmcaOverlay').classList.contains('open')) return;
    if (ordersUpdated) {
      renderOrdersPane();
      renderOverviewPane();
    }
    if (wishlistUpdated) renderActivityPane();
  }

  

  function renderAllPanes() {
    renderOverviewPane();
    renderProfilePane();
    renderPointsPane();
    renderOrdersPane();
    renderActivityPane();
    renderAddressesPane();
    renderLandmarksPane();
  }

  function renderOverviewPane() {
    const pane = document.querySelector('[data-gmca-pane="overview"]');
    if (!pane || !state.session) return;
    const user = state.session.user;
    const name = currentUserName(user, state.profile);
    const firstName = name ? name.split(/\s+/)[0] : 'there';
    const points = Math.max(0, Number(state.points.points_balance) || 0);
    const progress = Math.min(100, points);
    pane.innerHTML =
      '<section class="gmca-welcome-card">' +
        '<div class="gmca-welcome-profile"><span class="gmca-welcome-avatar-wrap"><span class="gmca-welcome-avatar" id="gmcaWelcomeAvatar" aria-hidden="true">' + avatarMarkup(name || user.email || 'GM') + '</span><button type="button" class="gmca-avatar-camera gmca-welcome-avatar-camera" data-gmca-avatar-upload aria-label="Change profile photo" title="Change profile photo">✎</button></span><div><span class="gmca-eyebrow">YOUR GENMERCH ACCOUNT</span><h3>Hi, ' + esc(firstName) + '!</h3><p>Welcome back. Track your purchases, manage your profile, and enjoy your member rewards.</p></div></div>' +
        '<div class="gmca-welcome-art" aria-hidden="true"><span class="gmca-art-orb gmca-art-orb-one"></span><span class="gmca-art-orb gmca-art-orb-two"></span><span class="gmca-art-bag"><b>GEN</b><strong>MERCH</strong></span><span class="gmca-art-shirt">✦</span></div>' +
      '</section>' +
      '<div class="gmca-metric-grid">' +
        metricCard('TOTAL ORDERS', String(Number(state.orderCount) || 0), 'Lifetime orders', 'orders', '▣') +
        metricCard('WISHLIST ITEMS', String(state.wishlist.length), 'Saved products', 'wishlist', '♥') +
        metricCard('LOYALTY POINTS', String(points), 'Available points', 'points', '✦') +
        metricCard('YOUR REVIEWS', String(state.reviews.length), 'Ratings & feedback', 'reviews', '★') +
      '</div>' +
      '<section class="gmca-section-card gmca-recent-orders"><div class="gmca-section-heading"><div><h3>Recent orders</h3><p>Latest orders linked to your signed-in account.</p></div><button type="button" class="gmca-text-action" data-gmca-jump="orders">View all orders <span aria-hidden="true">›</span></button></div>' +
        (state.orders.length ? '<div class="gmca-list">' + state.orders.slice(0, 3).map((order) => orderCard(order, true)).join('') + '</div>' :
          '<div class="gmca-empty gmca-orders-empty"><span class="gmca-empty-package" aria-hidden="true">▣</span><strong>No orders yet.</strong><p>Your orders will appear here after you place your first order.</p><button type="button" class="gmca-primary gmca-browse-products" id="gmcaBrowseProducts">Browse Products</button></div>') +
      '</section>' +
      '<div class="gmca-overview-bottom">' +
        '<section class="gmca-section-card gmca-member-card"><div class="gmca-card-title"><span class="gmca-card-icon gmca-member-icon" aria-hidden="true">●</span><div><h3>Member details</h3><p>Your personal information and account details.</p></div></div>' +
          '<div class="gmca-member-details">' +
            '<div class="gmca-detail-line"><span>✉ <span>Registered email</span></span><strong>' + esc(user.email || '—') + '</strong></div>' +
            '<div class="gmca-detail-line"><span>⌕ <span>Phone number</span></span><strong>' + esc(currentPhone(user, state.profile) || 'Not added yet') + '</strong></div>' +
            '<div class="gmca-detail-line"><span>▦ <span>Member since</span></span><strong>' + dateLabel(user.created_at) + '</strong></div>' +
          '</div>' +
          '<div class="gmca-member-actions"><button type="button" class="gmca-secondary" id="gmcaRefreshOverview">↻ Refresh account</button><button type="button" class="gmca-secondary" data-gmca-jump="profile">✎ Edit profile</button></div>' +
        '</section>' +
        '<section class="gmca-section-card gmca-rewards-card"><div class="gmca-section-heading"><div class="gmca-card-title"><span class="gmca-card-icon gmca-reward-icon" aria-hidden="true">♛</span><div><h3>Your GENMERCH Rewards</h3><p>Earn points and redeem them for discounts on eligible purchases.</p></div></div><button type="button" class="gmca-text-action" data-gmca-jump="points">View points history <span aria-hidden="true">›</span></button></div>' +
          '<div class="gmca-rewards-summary"><div class="gmca-points-mark" aria-hidden="true">P</div><div class="gmca-rewards-balance"><span>Available points</span><strong>' + esc(points.toLocaleString('en-PH')) + '</strong><small>points</small></div>' +
            '<ul class="gmca-rewards-facts"><li>Earn 1 point for every ₱100 of eligible merchandise spending.</li><li>Each point is worth ₱1 when redeemed at checkout.</li><li>Redeem at least 20 points, subject to checkout limits.</li></ul>' +
          '</div>' +
          '<div class="gmca-reward-progress"><div class="gmca-progress-heading"><strong>Progress to 100 points</strong><b>' + esc(Math.min(points, 100).toLocaleString('en-PH')) + ' / 100 points</b></div><div class="gmca-progress-track" role="progressbar" aria-label="Progress to 100 loyalty points" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + esc(progress) + '"><span style="width:' + progress + '%"></span></div><small>100 points represent up to ₱100 in eligible checkout value. Redemption limits apply.</small></div>' +
        '</section>' +
      '</div>';
    pane.querySelectorAll('[data-gmca-jump]').forEach((button) => button.addEventListener('click', () => switchTab(button.getAttribute('data-gmca-jump'))));
    $('gmcaRefreshOverview')?.addEventListener('click', loadAccountData);
    $('gmcaBrowseProducts')?.addEventListener('click', () => {
      closeAccount();
      if (typeof window.resetCatalog === 'function') window.resetCatalog();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function metricCard(label, value, caption, tab, icon) {
    return '<button type="button" class="gmca-metric" data-gmca-jump="' + esc(tab) + '"><span class="gmca-metric-icon" aria-hidden="true">' + esc(icon || '✦') + '</span><span class="gmca-metric-label">' + esc(label) + '</span><strong class="gmca-metric-value">' + esc(value) + '</strong><small class="gmca-metric-caption">' + esc(caption) + '</small></button>';
  }


  function renderProfilePane() {
    const pane = document.querySelector('[data-gmca-pane="profile"]');
    if (!pane || !state.session) return;
    const user = state.session.user;
    const fullName = currentUserName(user, state.profile);
    const phone = currentPhone(user, state.profile);
    pane.innerHTML =
      '<div class="gmca-pane-title"><div><h3>My Profile</h3><p>Update the information saved to your GENMERCH customer profile.</p></div></div>' +
      '<section class="gmca-profile-photo-card">' +
        '<span class="gmca-profile-photo-preview" id="gmcaProfileAvatar" aria-hidden="true">' + avatarMarkup(fullName || user.email || 'GM') + '</span>' +
        '<div class="gmca-profile-photo-copy"><strong>Profile photo</strong><small>JPG, PNG or WebP · Maximum 2 MB</small><small>Your photo is stored privately in your GENMERCH account.</small></div>' +
        '<div class="gmca-profile-photo-actions"><button type="button" class="gmca-secondary" data-gmca-avatar-upload>Change photo</button>' +
          (state.avatarPath ? '<button type="button" class="gmca-secondary gmca-avatar-remove-button" data-gmca-avatar-remove>Remove photo</button>' : '') +
        '</div>' +
      '</section>' +
      '<form id="gmcaProfileForm" class="gmca-form">' +
        '<label>Full name<input type="text" id="gmcaFullName" name="full_name" maxlength="100" value="' + esc(fullName) + '" autocomplete="name" required></label>' +
        '<label>Registered email<input type="email" value="' + esc(user.email || '') + '" readonly aria-readonly="true"><small>Your login email is shown here and is not changed by this form.</small></label>' +
        '<label>Mobile number<input type="tel" id="gmcaPhone" name="phone" maxlength="20" value="' + esc(phone) + '" autocomplete="tel" placeholder="09XXXXXXXXX"></label>' +
        '<label>Registration date<input type="text" value="' + esc(dateLabel(user.created_at)) + '" readonly aria-readonly="true"></label>' +
        '<div class="gmca-form-actions"><button type="submit" class="gmca-primary" id="gmcaSaveProfile">Save profile</button><span id="gmcaProfileFeedback" role="status" aria-live="polite"></span></div>' +
      '</form>' +
      '<div class="gmca-note"><strong>Privacy note</strong><p>Your profile is saved under your signed-in customer ID. Order and address records are loaded through their own access policies.</p></div>';
  }

  function detectCustomerAvatarFileType(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { mime: 'image/jpeg', extension: 'jpg' };
    }
    if (bytes.length >= 8 &&
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
        bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
      return { mime: 'image/png', extension: 'png' };
    }
    if (bytes.length >= 12 &&
        String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
        String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
      return { mime: 'image/webp', extension: 'webp' };
    }
    return null;
  }

  function setCustomerAvatarControlsBusy(busy) {
    document.querySelectorAll('[data-gmca-avatar-upload], [data-gmca-avatar-remove]').forEach((button) => {
      button.disabled = Boolean(busy);
      button.setAttribute('aria-busy', String(Boolean(busy)));
    });
  }

  async function handleCustomerAvatarSelection(event) {
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    if (input) input.value = '';
    if (!file) return;
    if (state.uploadingAvatar) return;
    const user = state.session && state.session.user;
    if (!user) {
      showAlert('Please sign in again before changing your profile photo.', 'error');
      return;
    }
    if (!file.size || file.size > CUSTOMER_AVATAR_MAX_BYTES) {
      showAlert('Choose an image smaller than or equal to 2 MB.', 'error');
      return;
    }

    state.uploadingAvatar = true;
    setCustomerAvatarControlsBusy(true);
    showAlert('Checking and uploading your profile photo…', 'warning');
    let uploadedPath = null;
    try {
      const signatureBytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const detectedType = detectCustomerAvatarFileType(signatureBytes);
      if (!detectedType) {
        throw new Error('Unsupported image. Please choose a valid JPG, PNG or WebP photo.');
      }
      if (file.type && file.type !== detectedType.mime && !(file.type === 'image/jpg' && detectedType.mime === 'image/jpeg')) {
        throw new Error('The selected file type does not match the image. Please choose a JPG, PNG or WebP photo.');
      }

      const db = client();
      const randomId = window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      uploadedPath = String(user.id) + '/' + randomId + '.' + detectedType.extension;
      const uploadResult = await db.storage
        .from(CUSTOMER_AVATAR_BUCKET)
        .upload(uploadedPath, file, {
          cacheControl: '900',
          contentType: detectedType.mime,
          upsert: false
        });
      if (uploadResult.error) throw uploadResult.error;

      const previousPath = state.avatarPath;
      const profileResult = await db.from('profiles').upsert({
        id: user.id,
        avatar_path: uploadedPath,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

      if (profileResult.error) {
        try {
          await db.storage.from(CUSTOMER_AVATAR_BUCKET).remove([uploadedPath]);
        } catch (cleanupError) {
          console.warn('GENMERCH could not clean up an unlinked avatar upload:', cleanupError.message || cleanupError);
        }
        uploadedPath = null;
        throw profileResult.error;
      }

      const savedPath = uploadedPath;
      uploadedPath = null;
      state.avatarRequestToken += 1;
      state.avatarSyncPending = false;
      state.avatarPath = savedPath;
      state.avatarOwnerId = String(user.id);
      state.profile = { ...(state.profile || {}), id: user.id, avatar_path: savedPath };
      try {
        const signedResult = await db.storage
          .from(CUSTOMER_AVATAR_BUCKET)
          .createSignedUrl(savedPath, CUSTOMER_AVATAR_URL_TTL_SECONDS);
        if (signedResult.error) throw signedResult.error;
        state.avatarUrl = signedResult.data && signedResult.data.signedUrl
          ? signedResult.data.signedUrl
          : null;
      } catch (signedUrlError) {
        state.avatarUrl = null;
        console.warn('GENMERCH saved the customer avatar, but could not create its preview URL:', signedUrlError.message || signedUrlError);
      }

      state.avatarUrlExpiresAt = state.avatarUrl
        ? Date.now() + CUSTOMER_AVATAR_URL_TTL_SECONDS * 1000
        : 0;
      syncStorefrontCustomerAvatar(
        state.avatarUrl,
        currentUserName(user, state.profile) || user.email || 'Customer'
      );
      if (state.avatarUrl) scheduleStorefrontAvatarRefresh(user.id);
      else {
        clearStorefrontAvatarRefreshTimer();
        refreshStorefrontAvatarForSession(state.session);
      }

      if (previousPath && previousPath !== savedPath && previousPath.startsWith(String(user.id) + '/')) {
        const cleanup = await db.storage.from(CUSTOMER_AVATAR_BUCKET).remove([previousPath]);
        if (cleanup.error) console.warn('GENMERCH could not remove the previous customer avatar:', cleanup.error.message || cleanup.error);
      }

      const name = currentUserName(user, state.profile);
      renderAllPanes();
      showAlert(state.avatarUrl
        ? 'Your profile photo has been updated.'
        : 'Your profile photo was saved. Refresh your account if the preview does not appear yet.',
      state.avatarUrl ? 'success' : 'warning');
    } catch (error) {
      if (uploadedPath) {
        try {
          await client().storage.from(CUSTOMER_AVATAR_BUCKET).remove([uploadedPath]);
        } catch (_) {}
      }
      showAlert(error.message || 'We could not upload your profile photo. Please try again.', 'error');
    } finally {
      state.uploadingAvatar = false;
      setCustomerAvatarControlsBusy(false);
    }
  }

  async function removeCustomerAvatar() {
    const user = state.session && state.session.user;
    const oldPath = state.avatarPath;
    if (!user || !oldPath || state.uploadingAvatar) return;
    if (!window.confirm('Remove your profile photo and use the default Account icon instead?')) return;

    state.uploadingAvatar = true;
    setCustomerAvatarControlsBusy(true);
    showAlert('Removing your profile photo…', 'warning');
    try {
      const db = client();
      const profileResult = await db.from('profiles').upsert({
        id: user.id,
        avatar_path: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      if (profileResult.error) throw profileResult.error;

      state.avatarRequestToken += 1;
      state.avatarSyncPending = false;
      state.avatarPath = null;
      state.avatarUrl = null;
      state.avatarOwnerId = String(user.id);
      state.avatarUrlExpiresAt = 0;
      state.avatarNeedsRefresh = false;
      clearStorefrontAvatarRefreshTimer();
      syncStorefrontCustomerAvatar(null);
      state.profile = { ...(state.profile || {}), id: user.id, avatar_path: null };
      renderAllPanes();

      if (oldPath.startsWith(String(user.id) + '/')) {
        const removeResult = await db.storage.from(CUSTOMER_AVATAR_BUCKET).remove([oldPath]);
        if (removeResult.error) console.warn('GENMERCH could not remove the old avatar object:', removeResult.error.message || removeResult.error);
      }
      showAlert('Your profile photo has been removed.');
    } catch (error) {
      showAlert(error.message || 'We could not remove your profile photo. Please try again.', 'error');
    } finally {
      state.uploadingAvatar = false;
      setCustomerAvatarControlsBusy(false);
    }
  }

  async function saveProfile() {
    if (!state.session || !state.session.user) return;
    const name = String($('gmcaFullName').value || '').trim().replace(/\s+/g, ' ');
    const phone = String($('gmcaPhone').value || '').trim();
    const feedback = $('gmcaProfileFeedback');
    const button = $('gmcaSaveProfile');
    if (name.length < 2 || name.length > 100) {
      feedback.textContent = 'Enter a name between 2 and 100 characters.';
      feedback.className = 'error';
      $('gmcaFullName').focus();
      return;
    }
    if (phone && !/^[0-9+() -]{7,20}$/.test(phone)) {
      feedback.textContent = 'Check the mobile number format.';
      feedback.className = 'error';
      $('gmcaPhone').focus();
      return;
    }
    button.disabled = true;
    button.textContent = 'Saving…';
    feedback.textContent = '';
    try {
      const db = client();
      const result = await db.from('profiles').upsert({
        id: state.session.user.id,
        full_name: name,
        phone: phone || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      if (result.error) throw result.error;
      try {
        const authResult = await db.auth.updateUser({ data: { full_name: name } });
        if (authResult.error) console.warn('Profile saved, but auth display metadata did not update:', authResult.error.message);
      } catch (metadataError) {
        console.warn('Profile saved, but auth display metadata did not update:', metadataError);
      }
      feedback.textContent = 'Profile saved successfully.';
      feedback.className = 'success';
      await loadAccountData();
      const refreshedFeedback = $('gmcaProfileFeedback');
      if (refreshedFeedback) { refreshedFeedback.textContent = 'Profile saved successfully.'; refreshedFeedback.className = 'success'; }
      if (typeof window.updateCustomerAuthScreen === 'function') {
        const fresh = await db.auth.getSession();
        if (fresh && fresh.data) window.updateCustomerAuthScreen(fresh.data.session);
      }
    } catch (error) {
      feedback.textContent = error.message || 'Could not save your profile. Please try again.';
      feedback.className = 'error';
    } finally {
      button.disabled = false;
      button.textContent = 'Save profile';
    }
  }

  function renderPointsPane() {
    const pane = document.querySelector('[data-gmca-pane="points"]');
    if (!pane) return;
    const points = state.points || {};
    const history = Array.isArray(points.history) ? points.history : [];
    pane.innerHTML =
      '<div class="gmca-pane-title"><div><h3>GENMERCH Loyalty Points</h3><p>Points are recorded in a server-controlled ledger and tied to your signed-in customer account.</p></div><button type="button" class="gmca-secondary gmca-small-button" id="gmcaPointsRefresh">↻ Refresh</button></div>' +
      '<div class="gmca-points-hero"><span>AVAILABLE POINTS</span><strong>' + esc(Math.max(0, Number(points.points_balance) || 0).toLocaleString('en-PH')) + '</strong><p>1 point = ₱1 discount when redeemed on an eligible order.</p></div>' +
      '<div class="gmca-metric-grid gmca-points-metrics">' +
        metricCard('LIFETIME EARNED', String(Number(points.lifetime_earned) || 0), 'earned & restored', 'points') +
        metricCard('LIFETIME REDEEMED', String(Number(points.lifetime_redeemed) || 0), 'used at checkout', 'points') +
      '</div>' +
      '<div class="gmca-rules"><h4>How points work</h4><ul>' +
        '<li>Earn 1 point for every ₱100 of eligible merchandise spending.</li>' +
        '<li>Points are awarded only after an order is delivered and payment is marked paid.</li>' +
        '<li>Redeem at least 20 points, up to 20% of the eligible merchandise subtotal.</li>' +
        '<li>Shipping fees cannot be paid using points. Unused points expire 12 months after earning.</li>' +
        '<li>Cancelled or refunded orders reverse unexpired earned points and restore points used on that order.</li>' +
      '</ul></div>' +
      '<div class="gmca-section-card"><div class="gmca-section-heading"><div><h3>Points history</h3><p>Latest 50 transactions.</p></div></div>' +
        (history.length ? '<div class="gmca-ledger">' + history.map(ledgerRow).join('') + '</div>' :
          '<div class="gmca-empty"><span>✦</span><strong>No points transactions yet</strong><p>Eligible completed and paid orders will generate points automatically.</p></div>') +
      '</div>';
    $('gmcaPointsRefresh').addEventListener('click', loadAccountData);
    pane.querySelectorAll('[data-gmca-jump]').forEach((button) => button.addEventListener('click', () => switchTab(button.getAttribute('data-gmca-jump'))));
  }

  function ledgerRow(entry) {
    const delta = Number(entry.points_delta) || 0;
    const positive = delta > 0;
    const label = displayStatus(entry.entry_type || 'adjustment');
    return '<div class="gmca-ledger-row"><div><strong>' + esc(label) + '</strong><p>' + esc(entry.reason || 'GENMERCH points activity') + '</p><small>' + esc(dateTimeLabel(entry.created_at)) + (entry.expires_at && positive ? ' · Expires ' + esc(dateLabel(entry.expires_at)) : '') + '</small></div><b class="' + (positive ? 'positive' : 'negative') + '">' + (positive ? '+' : '') + esc(delta.toLocaleString('en-PH')) + '</b></div>';
  }

  function orderCard(order, compact) {
    const items = state.orderItems.filter((item) => String(item.order_id) === String(order.id));
    const shipment = state.shipments.find((entry) => String(entry.order_id) === String(order.id));
    const itemLine = items.slice(0, compact ? 3 : 12).map((item) =>
      '<span>' + esc(item.product_name) + (item.size_label ? ' · ' + esc(item.size_label) : '') + ' × ' + esc(item.quantity) + '</span>'
    ).join('');
    const redeemed = Number(order.loyalty_points_redeemed) || 0;
    const tracking = shipment && shipment.tracking_number
      ? '<p class="gmca-order-tracking">' + esc(shipment.courier_name || 'Courier') + ' tracking: <strong>' + esc(shipment.tracking_number) + '</strong>' +
        (shipment.tracking_url ? ' <a href="' + esc(shipment.tracking_url) + '" target="_blank" rel="noopener noreferrer">Track package ↗</a>' : '') + '</p>'
      : '';
    return '<article class="gmca-order-card">' +
      '<div class="gmca-order-head"><div><span class="gmca-order-number">ORDER ' + esc(order.order_number || '—') + '</span><small>' + esc(dateLabel(order.created_at)) + '</small></div><span class="gmca-status gmca-status-' + esc(String(order.status || 'pending').toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '">' + esc(displayStatus(order.status)) + '</span></div>' +
      (itemLine ? '<div class="gmca-order-items">' + itemLine + (items.length > (compact ? 3 : 12) ? '<span>+' + (items.length - (compact ? 3 : 12)) + ' more item(s)</span>' : '') + '</div>' : '') +
      '<div class="gmca-order-bottom"><div><span>Payment</span><strong>' + esc(displayStatus(order.payment_status)) + '</strong></div><div><span>Total</span><strong>' + esc(php(order.total_amount)) + '</strong></div>' + (redeemed ? '<div><span>Points used</span><strong>' + esc(redeemed) + ' (−' + esc(php(order.loyalty_points_discount || redeemed)) + ')</strong></div>' : '') + '</div>' +
      tracking +
      (compact ? '' : '<button type="button" class="gmca-text-action gmca-order-track-action" data-gmca-open-tracker>Open detailed tracking</button>') +
    '</article>';
  }

  function renderOrdersPane() {
    const pane = document.querySelector('[data-gmca-pane="orders"]');
    if (!pane) return;
    pane.innerHTML =
      '<div class="gmca-pane-title"><div><h3>My Orders</h3><p>' + esc(Number(state.orderCount) || 0) + ' total order(s) linked to this account. Latest 20 shown below.</p></div><button type="button" class="gmca-secondary gmca-small-button" id="gmcaOrdersRefresh">↻ Refresh</button></div>' +
      '<div class="gmca-order-summary-strip"><div><span>All orders</span><strong>' + esc(Number(state.orderCount) || 0) + '</strong></div><div><span>Delivered</span><strong>' + esc(state.orders.filter((order) => String(order.status).toLowerCase() === 'delivered').length) + '</strong></div><div><span>In progress</span><strong>' + esc(state.orders.filter((order) => ['pending','confirmed','processing','shipped','out_for_delivery'].includes(String(order.status).toLowerCase())).length) + '</strong></div><div><span>Cancelled</span><strong>' + esc(state.orders.filter((order) => ['cancelled','refunded'].includes(String(order.status).toLowerCase())).length) + '</strong></div></div>' +
      (state.orders.length ? '<div class="gmca-list">' + state.orders.map((order) => orderCard(order, false)).join('') + '</div>' :
        '<div class="gmca-empty"><span>▣</span><strong>No account orders yet</strong><p>Sign in before placing an order to keep your purchase history together here.</p></div>') +
      '<div class="gmca-pane-actions"><button type="button" class="gmca-primary" id="gmcaOpenFullTracker">Open full order tracker</button></div>';
    $('gmcaOrdersRefresh').addEventListener('click', loadAccountData);
    $('gmcaOpenFullTracker').addEventListener('click', () => {
      closeAccount();
      if (typeof window.openCustomerOrders === 'function') window.openCustomerOrders();
    });
    pane.querySelectorAll('[data-gmca-open-tracker]').forEach((button) => button.addEventListener('click', () => {
      closeAccount();
      if (typeof window.openCustomerOrders === 'function') window.openCustomerOrders();
    }));
  }

  function renderActivityPane() {
    const pane = document.querySelector('[data-gmca-pane="activity"]');
    if (!pane) return;
    const showingReviews = state.activityTab === 'reviews';
    const wishlistMarkup = state.wishlist.length
      ? '<div class="gmca-activity-list">' + state.wishlist.map((wish) => {
        const product = wish.product;
        return '<article class="gmca-activity-row"><div><strong>' + esc(product ? product.name : 'Saved product') + '</strong><small>Saved ' + esc(dateLabel(wish.created_at)) + (product && product.is_active && !product.is_deleted ? ' · Available in the catalog' : ' · May no longer be available') + '</small></div><b>' + (product && product.base_price != null ? esc(php(product.base_price)) : '') + '</b></article>';
      }).join('') + '</div>'
      : '<div class="gmca-empty gmca-empty-small"><span>♡</span><strong>No saved products yet</strong><p>Products you add to your wishlist will appear here.</p></div>';
    const reviewMarkup = state.reviews.length
      ? '<div class="gmca-activity-list">' + state.reviews.map((review) =>
        '<article class="gmca-activity-row gmca-review-row"><div><strong>' + esc('★'.repeat(Math.max(0, Math.min(5, Number(review.rating) || 0))) + ' ' + (Number(review.rating) || 0) + '/5') + '</strong><p>' + esc(review.feedback || 'No written feedback added.') + '</p><small>' + esc(dateLabel(review.created_at)) + ' · ' + esc(displayStatus(review.moderation_status)) + '</small></div></article>'
      ).join('') + '</div>'
      : '<div class="gmca-empty gmca-empty-small"><span>★</span><strong>No reviews yet</strong><p>Your product ratings and feedback will appear here after you review a purchase.</p></div>';
    pane.innerHTML =
      '<div class="gmca-pane-title"><div><h3>' + (showingReviews ? 'My Reviews' : 'My Wishlist') + '</h3><p>' + (showingReviews ? state.reviews.length + ' rating(s) and feedback linked to your account.' : state.wishlist.length + ' saved product(s) in your wishlist.') + '</p></div><button type="button" class="gmca-secondary gmca-small-button" id="gmcaActivityRefresh">↻ Refresh</button></div>' +
      '<section class="gmca-section-card gmca-activity-panel">' + (showingReviews ? reviewMarkup : wishlistMarkup) + '</section>';
    $('gmcaActivityRefresh').addEventListener('click', loadAccountData);
  }


  function renderAddressesPane() {
    const pane = document.querySelector('[data-gmca-pane="addresses"]');
    if (!pane) return;
    const rows = state.addresses || [];
    pane.innerHTML =
      '<div class="gmca-pane-title"><div><h3>Account Settings</h3><p>Manage saved delivery addresses and default delivery landmarks.</p></div><div class="gmca-settings-actions"><button type="button" class="gmca-secondary gmca-small-button" id="gmcaManageLandmarks">Manage landmarks</button><button type="button" class="gmca-secondary gmca-small-button" id="gmcaAddressesRefresh">↻ Refresh</button></div></div>' +
      '<details class="gmca-editor" id="gmcaAddressEditor"><summary id="gmcaAddressEditorSummary">＋ Add a saved address</summary>' +
        '<form id="gmcaAddressForm" class="gmca-form gmca-address-form">' +
          '<input id="gmcaAddressId" type="hidden">' +
          '<label>Address label<input id="gmcaAddressLabel" maxlength="80" placeholder="Home, Work, Family" required></label>' +
          '<label>Recipient full name<input id="gmcaAddressName" maxlength="160" autocomplete="name" required></label>' +
          '<label>Mobile number<input id="gmcaAddressPhone" maxlength="20" inputmode="tel" autocomplete="tel" placeholder="09XXXXXXXXX" required></label>' +
          '<label>House / unit and street<input id="gmcaAddressStreet" maxlength="250" required></label>' +
          '<label>Province<input id="gmcaAddressProvince" maxlength="150" placeholder="Type to search province" autocomplete="address-level1" role="combobox" aria-autocomplete="list" aria-expanded="false" required></label>' +
          '<label>City / municipality<input id="gmcaAddressCity" maxlength="150" placeholder="Choose province, then search city" autocomplete="address-level2" role="combobox" aria-autocomplete="list" aria-expanded="false" required></label>' +
          '<label>Barangay<input id="gmcaAddressBarangay" maxlength="150" placeholder="Choose city, then search barangay" autocomplete="address-level3" role="combobox" aria-autocomplete="list" aria-expanded="false" required></label>' +
          '<label>Postal code<input id="gmcaAddressPostal" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" placeholder="Suggested from chosen barangay" autocomplete="postal-code" role="combobox" aria-autocomplete="list" aria-expanded="false" required></label>' +
          '<label>Landmark / directions<input id="gmcaAddressLandmark" maxlength="250" placeholder="Nearby store, school, gate, etc."></label>' +
          '<label>Delivery instructions<input id="gmcaAddressInstructions" maxlength="500" placeholder="Gate details or delivery notes"></label>' +
          '<label class="gmca-check-label"><input type="checkbox" id="gmcaAddressDefault"> Set as my default delivery address</label>' +
          '<div class="gmca-form-actions"><button type="submit" class="gmca-primary" id="gmcaAddressSave">Save address</button><button type="button" class="gmca-secondary" id="gmcaAddressCancel">Cancel</button><span id="gmcaAddressFeedback" role="status" aria-live="polite"></span></div>' +
        '</form>' +
      '</details>' +
      (rows.length ? '<div class="gmca-address-grid">' + rows.map((address) =>
        '<article class="gmca-address-book-card">' +
          '<div class="gmca-address-card-top"><span class="gmca-address-icon" aria-hidden="true">⌂</span><div><h4>' + esc(address.address_label || 'Saved address') + '</h4>' +
          (address.is_default ? '<span class="gmca-default-tag">DEFAULT ADDRESS</span>' : '') + '</div></div>' +
          '<strong>' + esc(address.recipient_name) + '</strong><p>' + esc(address.phone) + '</p>' +
          '<p>' + esc([address.street_address, address.barangay, address.city_municipality, address.province, address.postal_code].filter(Boolean).join(', ')) + '</p>' +
          (address.landmark ? '<p class="gmca-address-extra"><span>Landmark</span>' + esc(address.landmark) + '</p>' : '') +
          (address.delivery_instructions ? '<p class="gmca-address-extra"><span>Delivery notes</span>' + esc(address.delivery_instructions) + '</p>' : '') +
          '<div class="gmca-address-actions"><button type="button" class="gmca-secondary" data-gmca-edit-address="' + esc(address.id) + '">Edit</button>' +
          '<button type="button" class="gmca-secondary" data-gmca-use-address="' + esc(address.id) + '">Use at checkout</button>' +
          (address.is_default ? '' : '<button type="button" class="gmca-secondary" data-gmca-default-address="' + esc(address.id) + '">Set default</button>') +
          '<button type="button" class="gmca-danger" data-gmca-delete-address="' + esc(address.id) + '">Delete</button></div>' +
        '</article>'
      ).join('') + '</div>' :
        '<div class="gmca-empty gmca-address-empty"><span>⌂</span><strong>No saved addresses yet</strong><p>After your first successful order, GENMERCH will save that delivery address to your address book automatically.</p></div>');
    $('gmcaAddressesRefresh').addEventListener('click', loadAccountData);
    $('gmcaManageLandmarks').addEventListener('click', () => switchTab('landmarks'));
    $('gmcaAddressCancel').addEventListener('click', resetAddressEditor);
    $('gmcaAddressForm').addEventListener('submit', (event) => { event.preventDefault(); saveAddress(); });
    pane.querySelectorAll('[data-gmca-edit-address]').forEach((button) => button.addEventListener('click', () => editAddress(button.getAttribute('data-gmca-edit-address'))));
    pane.querySelectorAll('[data-gmca-default-address]').forEach((button) => button.addEventListener('click', () => setDefaultAddress(button.getAttribute('data-gmca-default-address'))));
    pane.querySelectorAll('[data-gmca-delete-address]').forEach((button) => button.addEventListener('click', () => deleteAddress(button.getAttribute('data-gmca-delete-address'))));
    pane.querySelectorAll('[data-gmca-use-address]').forEach((button) => button.addEventListener('click', () => {
      const address = rows.find((row) => String(row.id) === String(button.getAttribute('data-gmca-use-address')));
      if (!address) return;
      applyCheckoutAddress(address, true);
      closeAccount();
      if (typeof window.updateCart === 'function') window.updateCart();
      const credit = $('gmcaCheckoutAddressFeedback');
      if (credit) { credit.textContent = 'Saved address loaded into checkout.'; credit.className = 'gmca-checkout-feedback success'; }
    }));
    bindAddressAutocomplete();
  }

  function bindAddressAutocomplete() {
    const bridge = window.genmerchAddressReference;
    const fieldIds = {
      province: 'gmcaAddressProvince',
      city: 'gmcaAddressCity',
      barangay: 'gmcaAddressBarangay',
      postal: 'gmcaAddressPostal'
    };
    const lookupState = {
      province: null, city: null, barangay: null, cityBarangays: [],
      requestId: { province: 0, city: 0, barangay: 0, postal: 0 }
    };

    Object.values(fieldIds).forEach((id) => {
      const input = $(id);
      if (!input) return;
      input.autocomplete = 'off';
      input.setAttribute('aria-controls', id + 'Suggestions');
      if (input.closest('.gmca-address-autocomplete')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'gmca-address-autocomplete';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      const box = document.createElement('div');
      box.id = id + 'Suggestions';
      box.className = 'gmca-address-suggestions';
      box.setAttribute('role', 'listbox');
      box.setAttribute('aria-label', input.id.replace('gmcaAddress', '') + ' suggestions');
      wrapper.appendChild(box);
    });

    const norm = (value) => bridge && bridge.normalize
      ? bridge.normalize(value)
      : String(value || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
    const placeName = (record) => bridge && bridge.getName ? bridge.getName(record) : (record && (record.name_en || record.name_local || record.name) || '');
    const parentName = (record) => bridge && bridge.getParentName ? bridge.getParentName(record) : (record && (record.parent_name_en || record.parent_name_local) || '');
    const postalCodes = (record) => bridge && bridge.getPostalCodes ? bridge.getPostalCodes(record) : [];
    const matches = (record, query, extra) => {
      const haystack = norm([placeName(record), parentName(record), record && record.postal_code,
        ...(record && Array.isArray(record.zip_codes) ? record.zip_codes : []), extra || ''].join(' '));
      return !norm(query) || haystack.includes(norm(query));
    };
    const inputFor = (level) => $(fieldIds[level]);
    const boxFor = (level) => $(fieldIds[level] + 'Suggestions');

    function hide(level) {
      const box = boxFor(level), input = inputFor(level);
      if (box) box.classList.remove('open');
      if (input) input.setAttribute('aria-expanded', 'false');
    }
    function hideAccountAddressSuggestions() {
      ['province', 'city', 'barangay', 'postal'].forEach(hide);
    }
    function showMessage(level, message) {
      const input = inputFor(level), box = boxFor(level);
      if (!input || !box) return;
      box.replaceChildren();
      const note = document.createElement('div');
      note.className = 'gmca-address-suggestion-message';
      note.textContent = message;
      box.appendChild(note);
      box.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
    }
    function render(level, records, onSelect, emptyMessage) {
      const input = inputFor(level), box = boxFor(level);
      if (!input || !box) return;
      box.replaceChildren();
      const items = (records || []).slice(0, 9);
      if (!items.length) {
        showMessage(level, emptyMessage || 'No match found. You can still enter the address manually.');
        return;
      }
      items.forEach((record) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gmca-address-suggestion';
        button.setAttribute('role', 'option');
        const title = document.createElement('span');
        title.textContent = record.label || placeName(record) || String(record.value || '');
        button.appendChild(title);
        const detailText = record.detail || '';
        if (detailText) {
          const detail = document.createElement('small');
          detail.textContent = detailText;
          button.appendChild(detail);
        }
        button.addEventListener('mousedown', (event) => event.preventDefault());
        button.addEventListener('keydown', (event) => {
          const options = [...box.querySelectorAll('button.gmca-address-suggestion')];
          const index = options.indexOf(button);
          if (event.key === 'ArrowDown') { event.preventDefault(); (options[index + 1] || options[0])?.focus(); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); if (index <= 0) input.focus(); else options[index - 1]?.focus(); }
          else if (event.key === 'Escape') { event.preventDefault(); hide(level); input.focus(); }
        });
        button.addEventListener('click', () => onSelect(record));
        box.appendChild(button);
      });
      box.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
    }
    function clearBelow(level) {
      if (level === 'province') {
        lookupState.city = null; lookupState.barangay = null; lookupState.cityBarangays = [];
        ['city', 'barangay', 'postal'].forEach((key) => {
          inputFor(key).value = '';
          hide(key);
        });
      } else if (level === 'city') {
        lookupState.barangay = null; lookupState.cityBarangays = [];
        ['barangay', 'postal'].forEach((key) => {
          inputFor(key).value = '';
          hide(key);
        });
      } else if (level === 'barangay') {
        lookupState.barangay = null;
        inputFor('postal').value = '';
        hide('postal');
      }
    }

    async function updateProvince() {
      const request = ++lookupState.requestId.province;
      const query = inputFor('province').value.trim();
      if (!bridge || !bridge.loadProvinces) { showMessage('province', 'Address suggestions are unavailable right now.'); return; }
      try {
        const records = await bridge.loadProvinces();
        if (request !== lookupState.requestId.province || query !== inputFor('province').value.trim()) return;
        const list = [...records].filter((record) => matches(record, query))
          .sort((a, b) => placeName(a).localeCompare(placeName(b)))
          .map((record) => ({ ...record, label: placeName(record) }));
        render('province', list, (record) => {
          lookupState.province = record;
          inputFor('province').value = placeName(record);
          hide('province');
          clearBelow('province');
          inputFor('city').focus();
          updateCity();
        }, 'No province match found. Check the spelling or enter the address manually.');
      } catch (error) {
        showMessage('province', 'Province suggestions are temporarily unavailable. You can still type the province manually.');
      }
    }

    async function resolveProvince() {
      if (lookupState.province && norm(placeName(lookupState.province)) === norm(inputFor('province').value)) return lookupState.province;
      if (!bridge || !bridge.loadProvinces) return null;
      const records = await bridge.loadProvinces();
      lookupState.province = records.find((record) => norm(placeName(record)) === norm(inputFor('province').value)) || null;
      return lookupState.province;
    }
    async function updateCity() {
      const request = ++lookupState.requestId.city;
      const query = inputFor('city').value.trim();
      if (!bridge || !bridge.loadMunicipalities) { showMessage('city', 'Address suggestions are unavailable right now.'); return; }
      try {
        const [records, province] = await Promise.all([bridge.loadMunicipalities(), resolveProvince()]);
        if (request !== lookupState.requestId.city || query !== inputFor('city').value.trim()) return;
        const narrowed = province ? records.filter((record) =>
          String(record.parent_id || '') === String(province.id || '') ||
          norm(parentName(record)) === norm(placeName(province))) : records;
        const list = narrowed.filter((record) => matches(record, query))
          .sort((a, b) => {
            const needle = norm(query), aName = norm(placeName(a)), bName = norm(placeName(b));
            return (aName.startsWith(needle) ? 0 : 1) - (bName.startsWith(needle) ? 0 : 1) || aName.localeCompare(bName);
          })
          .map((record) => ({ ...record, label: placeName(record), detail: parentName(record) || (province ? placeName(province) : 'Philippines') }));
        render('city', list, async (record) => {
          lookupState.city = record;
          inputFor('city').value = placeName(record);
          try {
            const provinces = await bridge.loadProvinces();
            const parentProvince = provinces.find((item) => String(item.id || '') === String(record.parent_id || '')) ||
              provinces.find((item) => norm(placeName(item)) === norm(parentName(record)));
            if (parentProvince) {
              lookupState.province = parentProvince;
              inputFor('province').value = placeName(parentProvince);
              hide('province');
            }
          } catch (_) {}
          hide('city');
          clearBelow('city');
          inputFor('barangay').focus();
          updateBarangay();
        }, province ? 'No city or municipality matches this province.' : 'No city or municipality match found.');
      } catch (error) {
        showMessage('city', 'City and municipality suggestions are temporarily unavailable. You can still type the city manually.');
      }
    }

    async function resolveCity() {
      if (lookupState.city && norm(placeName(lookupState.city)) === norm(inputFor('city').value)) return lookupState.city;
      if (!bridge || !bridge.loadMunicipalities) return null;
      const [records, province] = await Promise.all([bridge.loadMunicipalities(), resolveProvince()]);
      const sameName = records.filter((record) => norm(placeName(record)) === norm(inputFor('city').value));
      lookupState.city = province
        ? sameName.find((record) => String(record.parent_id || '') === String(province.id || '') || norm(parentName(record)) === norm(placeName(province))) || null
        : (sameName.length === 1 ? sameName[0] : null);
      if (!lookupState.city && sameName.length === 1) lookupState.city = sameName[0];
      return lookupState.city;
    }
    async function loadCityBarangays() {
      const city = await resolveCity();
      if (!city) return [];
      const key = String(city.slug || city.id || '');
      if (lookupState.city && lookupState.cityBarangays.length && String(lookupState.city.slug || lookupState.city.id || '') === key) {
        return lookupState.cityBarangays;
      }
      if (!bridge || !bridge.loadBarangays) return [];
      const records = await bridge.loadBarangays(city);
      lookupState.cityBarangays = records;
      lookupState.city = city;
      return records;
    }
    async function updateBarangay() {
      const request = ++lookupState.requestId.barangay;
      const query = inputFor('barangay').value.trim();
      try {
        const cityRecords = await loadCityBarangays();
        if (request !== lookupState.requestId.barangay || query !== inputFor('barangay').value.trim()) return;
        if (!lookupState.city) {
          showMessage('barangay', 'Choose a city or municipality first to see matching barangays.');
          return;
        }
        const list = cityRecords.filter((record) => matches(record, query))
          .sort((a, b) => {
            const needle = norm(query), aName = norm(placeName(a)), bName = norm(placeName(b));
            return (aName.startsWith(needle) ? 0 : 1) - (bName.startsWith(needle) ? 0 : 1) || aName.localeCompare(bName);
          })
          .map((record) => ({ ...record, label: placeName(record), detail: postalCodes(record).length ? 'Postal code: ' + postalCodes(record).join(', ') : 'Postal code not listed for this barangay' }));
        render('barangay', list, (record) => {
          lookupState.barangay = record;
          inputFor('barangay').value = placeName(record);
          hide('barangay');
          const codes = postalCodes(record);
          inputFor('postal').value = codes.length ? codes[0] : '';
          hide('postal');
          if (!codes.length) updatePostal();
        }, 'No barangay match found in this city. Check spelling or enter it manually.');
      } catch (error) {
        showMessage('barangay', 'Barangay suggestions are temporarily unavailable. You can still type it manually.');
      }
    }

    async function updatePostal() {
      const request = ++lookupState.requestId.postal;
      const query = inputFor('postal').value.trim();
      try {
        const cityRecords = await loadCityBarangays();
        if (request !== lookupState.requestId.postal || query !== inputFor('postal').value.trim()) return;
        if (!lookupState.city) { showMessage('postal', 'Choose a city or municipality first to get postal-code suggestions.'); return; }
        const codes = new Map();
        cityRecords.forEach((record) => postalCodes(record).forEach((code) => {
          if (!codes.has(code)) codes.set(code, new Set());
          codes.get(code).add(placeName(record));
        }));
        const list = [...codes.entries()].filter(([code]) => !query || code.includes(query))
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([code, barangays]) => ({ value: code, label: code, detail: 'Listed for: ' + [...barangays].slice(0, 3).join(', ') + (barangays.size > 3 ? '…' : '') }));
        render('postal', list, (record) => {
          inputFor('postal').value = record.value;
          hide('postal');
        }, 'No postal code is listed for this city and query. You can type it manually.');
      } catch (error) {
        showMessage('postal', 'Postal-code suggestions are temporarily unavailable. You can still enter the code manually.');
      }
    }

    function bindKeyboard(level) {
      const input = inputFor(level);
      if (!input || input.dataset.gmcaAutocompleteBound === '1') return;
      input.dataset.gmcaAutocompleteBound = '1';
      input.addEventListener('keydown', (event) => {
        const box = boxFor(level);
        const options = [...box.querySelectorAll('button.gmca-address-suggestion')];
        if (event.key === 'ArrowDown' && box.classList.contains('open') && options.length) {
          event.preventDefault(); options[0].focus();
        } else if (event.key === 'Enter' && box.classList.contains('open') && options.length) {
          event.preventDefault(); options[0].click();
        } else if (event.key === 'Escape' && box.classList.contains('open')) {
          event.preventDefault(); hide(level);
        }
      });
    }
    [['province', updateProvince], ['city', updateCity], ['barangay', updateBarangay], ['postal', updatePostal]].forEach(([level, updater]) => {
      const input = inputFor(level);
      if (!input || input.dataset.gmcaAutocompleteBound === '1') return;
      input.dataset.gmcaAutocompleteBound = '1';
      input.addEventListener('input', () => {
        if (level === 'province') { lookupState.province = null; clearBelow('province'); }
        else if (level === 'city') { lookupState.city = null; clearBelow('city'); }
        else if (level === 'barangay') clearBelow('barangay');
        updater();
      });
      input.addEventListener('focus', updater);
      input.addEventListener('keydown', (event) => {
        const box = boxFor(level), options = [...box.querySelectorAll('button.gmca-address-suggestion')];
        if (event.key === 'ArrowDown' && box.classList.contains('open') && options.length) {
          event.preventDefault(); options[0].focus();
        } else if (event.key === 'Enter' && box.classList.contains('open') && options.length) {
          event.preventDefault(); options[0].click();
        } else if (event.key === 'Escape' && box.classList.contains('open')) {
          event.preventDefault(); hide(level);
        }
      });
    });
  }

  function resetAddressEditor() {
    const form = $('gmcaAddressForm');
    if (form) form.reset();
    if ($('gmcaAddressId')) $('gmcaAddressId').value = '';
    if ($('gmcaAddressLabel')) $('gmcaAddressLabel').value = '';
    if ($('gmcaAddressEditorSummary')) $('gmcaAddressEditorSummary').textContent = '＋ Add a saved address';
    if ($('gmcaAddressEditor')) $('gmcaAddressEditor').open = false;
    if ($('gmcaAddressSave')) $('gmcaAddressSave').textContent = 'Save address';
    if ($('gmcaAddressFeedback')) $('gmcaAddressFeedback').textContent = '';
  }

  function editAddress(id) {
    const address = state.addresses.find((row) => String(row.id) === String(id));
    if (!address) return;
    const values = {
      gmcaAddressId: address.id, gmcaAddressLabel: address.address_label || 'Saved address',
      gmcaAddressName: address.recipient_name, gmcaAddressPhone: address.phone,
      gmcaAddressStreet: address.street_address, gmcaAddressProvince: address.province,
      gmcaAddressCity: address.city_municipality, gmcaAddressBarangay: address.barangay,
      gmcaAddressPostal: address.postal_code, gmcaAddressLandmark: address.landmark,
      gmcaAddressInstructions: address.delivery_instructions
    };
    Object.entries(values).forEach(([id, value]) => { if ($(id)) $(id).value = value == null ? '' : String(value); });
    $('gmcaAddressDefault').checked = Boolean(address.is_default);
    $('gmcaAddressEditor').open = true;
    $('gmcaAddressEditorSummary').textContent = 'Edit saved address';
    $('gmcaAddressSave').textContent = 'Update address';
    $('gmcaAddressFeedback').textContent = '';
    $('gmcaAddressEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveAddress() {
    if (!state.session || !state.session.user) return;
    const userId = state.session.user.id;
    const id = String($('gmcaAddressId').value || '').trim();
    const label = String($('gmcaAddressLabel').value || '').trim() || 'Saved address';
    const recipient = String($('gmcaAddressName').value || '').trim();
    const phone = String($('gmcaAddressPhone').value || '').trim();
    const street = String($('gmcaAddressStreet').value || '').trim();
    const province = String($('gmcaAddressProvince').value || '').trim();
    const city = String($('gmcaAddressCity').value || '').trim();
    const barangay = String($('gmcaAddressBarangay').value || '').trim();
    const postal = String($('gmcaAddressPostal').value || '').trim();
    const landmark = String($('gmcaAddressLandmark').value || '').trim();
    const instructions = String($('gmcaAddressInstructions').value || '').trim();
    const wantsDefault = $('gmcaAddressDefault').checked;
    const feedback = $('gmcaAddressFeedback');
    const save = $('gmcaAddressSave');
    if (!recipient || !phone || !street || !province || !city || !barangay) {
      feedback.textContent = 'Complete the recipient, phone and delivery address fields.';
      feedback.className = 'error';
      return;
    }
    if (postal && !/^\d{4}$/.test(postal)) {
      feedback.textContent = 'Postal code must be 4 digits.';
      feedback.className = 'error';
      return;
    }
    if (!/^[0-9+() -]{7,20}$/.test(phone)) {
      feedback.textContent = 'Check the mobile number format.';
      feedback.className = 'error';
      return;
    }
    const payload = {
      user_id: userId, address_label: label, recipient_name: recipient, phone,
      street_address: street, province, city_municipality: city, barangay,
      postal_code: postal || null, landmark: landmark || null,
      delivery_instructions: instructions || null, is_default: false
    };
    save.disabled = true;
    save.textContent = 'Saving…';
    feedback.textContent = '';
    try {
      const db = client();
      let savedId = id;
      if (id) {
        const result = await db.from('customer_addresses').update(payload).eq('id', id).eq('user_id', userId).select('id').single();
        if (result.error) throw result.error;
        savedId = result.data.id;
      } else {
        const result = await db.from('customer_addresses').insert(payload).select('id').single();
        if (result.error) throw result.error;
        savedId = result.data.id;
      }
      if (wantsDefault) {
        const clear = await db.from('customer_addresses').update({ is_default: false }).eq('user_id', userId);
        if (clear.error) throw clear.error;
        const set = await db.from('customer_addresses').update({ is_default: true }).eq('id', savedId).eq('user_id', userId);
        if (set.error) throw set.error;
      }
      resetAddressEditor();
      await loadAccountData();
      switchTab('addresses');
      showAlert('Saved address updated successfully.', 'success');
    } catch (error) {
      feedback.textContent = error.message || 'Could not save this address.';
      feedback.className = 'error';
    } finally {
      save.disabled = false;
      save.textContent = id ? 'Update address' : 'Save address';
    }
  }

  async function setDefaultAddress(id) {
    if (!state.session || !state.session.user) return;
    try {
      const db = client(), userId = state.session.user.id;
      const clear = await db.from('customer_addresses').update({ is_default: false }).eq('user_id', userId);
      if (clear.error) throw clear.error;
      const set = await db.from('customer_addresses').update({ is_default: true }).eq('id', id).eq('user_id', userId);
      if (set.error) throw set.error;
      await loadAccountData();
      switchTab('addresses');
      showAlert('Default delivery address updated.', 'success');
    } catch (error) {
      showAlert(error.message || 'Could not set the default address.', 'error');
    }
  }

  async function deleteAddress(id) {
    if (!state.session || !state.session.user) return;
    const address = state.addresses.find((row) => String(row.id) === String(id));
    if (!address || !window.confirm('Delete "' + (address.address_label || 'this saved address') + '" from your address book?')) return;
    try {
      const result = await client().from('customer_addresses').delete().eq('id', id).eq('user_id', state.session.user.id);
      if (result.error) throw result.error;
      await loadAccountData();
      switchTab('addresses');
      showAlert('Saved address deleted.', 'success');
    } catch (error) {
      showAlert(error.message || 'Could not delete this address.', 'error');
    }
  }

  function renderLandmarksPane() {
    const pane = document.querySelector('[data-gmca-pane="landmarks"]');
    if (!pane) return;
    const rows = state.landmarks || [];
    pane.innerHTML =
      '<div class="gmca-pane-title"><div><h3>Saved Delivery Landmarks</h3><p>Save frequently used directions and special delivery instructions for faster checkout.</p></div><div class="gmca-settings-actions"><button type="button" class="gmca-secondary gmca-small-button" id="gmcaLandmarksBack">← Account settings</button><button type="button" class="gmca-secondary gmca-small-button" id="gmcaLandmarksRefresh">↻ Refresh</button></div></div>' +
      '<details class="gmca-editor" id="gmcaLandmarkEditor"><summary id="gmcaLandmarkEditorSummary">＋ Add a default landmark</summary>' +
        '<form id="gmcaLandmarkForm" class="gmca-form gmca-landmark-form">' +
          '<input id="gmcaLandmarkId" type="hidden">' +
          '<label>Label<input id="gmcaLandmarkLabel" maxlength="80" placeholder="Home gate, Office, Subdivision" required></label>' +
          '<label>Landmark / directions<input id="gmcaLandmarkValue" maxlength="250" placeholder="Near a known place or entrance" required></label>' +
          '<label class="gmca-form-full">Special delivery instructions<textarea id="gmcaLandmarkInstructions" maxlength="500" required placeholder="Gate number, call on arrival, etc."></textarea></label>' +
          '<label class="gmca-check-label"><input type="checkbox" id="gmcaLandmarkDefault"> Use as my default checkout landmark</label>' +
          '<div class="gmca-form-actions"><button type="submit" class="gmca-primary" id="gmcaLandmarkSave">Save landmark</button><button type="button" class="gmca-secondary" id="gmcaLandmarkCancel">Cancel</button><span id="gmcaLandmarkFeedback" role="status" aria-live="polite"></span></div>' +
        '</form>' +
      '</details>' +
      (rows.length ? '<div class="gmca-address-grid">' + rows.map((landmark) =>
        '<article class="gmca-address-book-card gmca-landmark-card"><div class="gmca-address-card-top"><span class="gmca-address-icon" aria-hidden="true">⌖</span><div><h4>' + esc(landmark.label || 'Saved landmark') + '</h4>' +
        (landmark.is_default ? '<span class="gmca-default-tag">DEFAULT LANDMARK</span>' : '') + '</div></div>' +
        '<p>' + esc(landmark.landmark) + '</p><p class="gmca-address-extra"><span>Delivery notes</span>' + esc(landmark.delivery_instructions || 'N/A') + '</p>' +
        '<div class="gmca-address-actions"><button type="button" class="gmca-secondary" data-gmca-edit-landmark="' + esc(landmark.id) + '">Edit</button>' +
        (landmark.is_default ? '' : '<button type="button" class="gmca-secondary" data-gmca-default-landmark="' + esc(landmark.id) + '">Set default</button>') +
        '<button type="button" class="gmca-danger" data-gmca-delete-landmark="' + esc(landmark.id) + '">Delete</button></div></article>'
      ).join('') + '</div>' :
        '<div class="gmca-empty gmca-address-empty"><span>⌖</span><strong>No saved landmarks yet</strong><p>GENMERCH can save your landmark and delivery instructions after you place an order.</p></div>');
    $('gmcaLandmarksRefresh').addEventListener('click', loadAccountData);
    $('gmcaLandmarksBack').addEventListener('click', () => switchTab('settings'));
    $('gmcaLandmarkCancel').addEventListener('click', resetLandmarkEditor);
    $('gmcaLandmarkForm').addEventListener('submit', (event) => { event.preventDefault(); saveLandmark(); });
    pane.querySelectorAll('[data-gmca-edit-landmark]').forEach((button) => button.addEventListener('click', () => editLandmark(button.getAttribute('data-gmca-edit-landmark'))));
    pane.querySelectorAll('[data-gmca-default-landmark]').forEach((button) => button.addEventListener('click', () => setDefaultLandmark(button.getAttribute('data-gmca-default-landmark'))));
    pane.querySelectorAll('[data-gmca-delete-landmark]').forEach((button) => button.addEventListener('click', () => deleteLandmark(button.getAttribute('data-gmca-delete-landmark'))));
  }

  function resetLandmarkEditor() {
    const form = $('gmcaLandmarkForm');
    if (form) form.reset();
    if ($('gmcaLandmarkId')) $('gmcaLandmarkId').value = '';
    if ($('gmcaLandmarkEditorSummary')) $('gmcaLandmarkEditorSummary').textContent = '＋ Add a default landmark';
    if ($('gmcaLandmarkEditor')) $('gmcaLandmarkEditor').open = false;
    if ($('gmcaLandmarkSave')) $('gmcaLandmarkSave').textContent = 'Save landmark';
    if ($('gmcaLandmarkFeedback')) $('gmcaLandmarkFeedback').textContent = '';
  }

  function editLandmark(id) {
    const item = state.landmarks.find((row) => String(row.id) === String(id));
    if (!item) return;
    $('gmcaLandmarkId').value = item.id;
    $('gmcaLandmarkLabel').value = item.label || '';
    $('gmcaLandmarkValue').value = item.landmark || '';
    $('gmcaLandmarkInstructions').value = item.delivery_instructions || 'N/A';
    $('gmcaLandmarkDefault').checked = Boolean(item.is_default);
    $('gmcaLandmarkEditor').open = true;
    $('gmcaLandmarkEditorSummary').textContent = 'Edit saved landmark';
    $('gmcaLandmarkSave').textContent = 'Update landmark';
    $('gmcaLandmarkEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveLandmark() {
    if (!state.session || !state.session.user) return;
    const userId = state.session.user.id;
    const id = String($('gmcaLandmarkId').value || '').trim();
    const label = String($('gmcaLandmarkLabel').value || '').trim();
    const landmark = String($('gmcaLandmarkValue').value || '').trim();
    const instructions = String($('gmcaLandmarkInstructions').value || '').trim() || 'N/A';
    const wantsDefault = $('gmcaLandmarkDefault').checked;
    const feedback = $('gmcaLandmarkFeedback');
    const button = $('gmcaLandmarkSave');
    if (!label || !landmark || !instructions) {
      feedback.textContent = 'Complete the landmark label, directions and delivery instructions.';
      feedback.className = 'error';
      return;
    }
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const db = client();
      const payload = { user_id: userId, label, landmark, delivery_instructions: instructions, is_default: false };
      let savedId = id;
      if (id) {
        const result = await db.from('customer_default_landmarks').update(payload).eq('id', id).eq('user_id', userId).select('id').single();
        if (result.error) throw result.error;
        savedId = result.data.id;
      } else {
        const result = await db.from('customer_default_landmarks').insert(payload).select('id').single();
        if (result.error) throw result.error;
        savedId = result.data.id;
      }
      if (wantsDefault) {
        const clear = await db.from('customer_default_landmarks').update({ is_default: false }).eq('user_id', userId);
        if (clear.error) throw clear.error;
        const set = await db.from('customer_default_landmarks').update({ is_default: true }).eq('id', savedId).eq('user_id', userId);
        if (set.error) throw set.error;
      }
      resetLandmarkEditor();
      await loadAccountData();
      switchTab('landmarks');
      showAlert('Default landmark saved successfully.', 'success');
    } catch (error) {
      feedback.textContent = error.message || 'Could not save this landmark.';
      feedback.className = 'error';
    } finally {
      button.disabled = false;
      button.textContent = id ? 'Update landmark' : 'Save landmark';
    }
  }

  async function setDefaultLandmark(id) {
    if (!state.session || !state.session.user) return;
    try {
      const db = client(), userId = state.session.user.id;
      const clear = await db.from('customer_default_landmarks').update({ is_default: false }).eq('user_id', userId);
      if (clear.error) throw clear.error;
      const set = await db.from('customer_default_landmarks').update({ is_default: true }).eq('id', id).eq('user_id', userId);
      if (set.error) throw set.error;
      await loadAccountData();
      switchTab('landmarks');
      showAlert('Default landmark updated.', 'success');
    } catch (error) {
      showAlert(error.message || 'Could not set the default landmark.', 'error');
    }
  }

  async function deleteLandmark(id) {
    if (!state.session || !state.session.user) return;
    const item = state.landmarks.find((row) => String(row.id) === String(id));
    if (!item || !window.confirm('Delete "' + (item.label || 'this saved landmark') + '"?')) return;
    try {
      const result = await client().from('customer_default_landmarks').delete().eq('id', id).eq('user_id', state.session.user.id);
      if (result.error) throw result.error;
      await loadAccountData();
      switchTab('landmarks');
      showAlert('Saved landmark deleted.', 'success');
    } catch (error) {
      showAlert(error.message || 'Could not delete this landmark.', 'error');
    }
  }

  function setCheckoutField(id, value, force) {
    const field = $(id);
    if (!field || value == null || String(value).trim() === '') return;
    if (!force && String(field.value || '').trim()) return;
    field.value = String(value);
  }

  function notifyCheckoutField(id) {
    const field = $(id);
    if (field) field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function applyCheckoutAddress(address, force) {
    if (!address) return;
    const user = state.session && state.session.user;
    const values = {
      firstName: String(address.recipient_name || '').trim().split(/\s+/)[0] || '',
      lastName: String(address.recipient_name || '').trim().split(/\s+/).slice(1).join(' '),
      custPhone: address.phone,
      streetAddress: address.street_address,
      province: address.province,
      city: address.city_municipality,
      barangay: address.barangay,
      postalCode: address.postal_code,
      landmark: address.landmark,
      specialInstructions: address.delivery_instructions
    };
    Object.entries(values).forEach(([id, value]) => setCheckoutField(id, value, Boolean(force)));
    if (typeof window.syncCheckoutFullName === 'function') {
      try { window.syncCheckoutFullName(); } catch (_) {}
    } else if (typeof syncCheckoutFullName === 'function') {
      try { syncCheckoutFullName(); } catch (_) {}
    }
    ['firstName','lastName','custPhone','streetAddress','province','city','barangay','postalCode','landmark','specialInstructions'].forEach(notifyCheckoutField);
    const sharedAddress = window.genmerchAddressReference;
    if (sharedAddress && typeof sharedAddress.restoreContext === 'function') {
      sharedAddress.restoreContext().catch((error) => console.warn('Could not rebuild checkout address suggestions:', error));
    }
    if (typeof window.updateCart === 'function') window.updateCart();
    const picker = $('gmcaCheckoutAddressFeedback');
    if (picker) {
      picker.textContent = 'Saved address loaded. Please confirm the delivery details before placing your order.';
      picker.className = 'gmca-checkout-feedback success';
    }
  }

  function ensureCheckoutAddressPicker() {
    if ($('gmcaCheckoutAddressPicker')) return;
    const form = $('checkoutForm');
    const grid = form && form.querySelector('.checkout-grid');
    if (!grid) return;
    const section = document.createElement('section');
    section.id = 'gmcaCheckoutAddressPicker';
    section.className = 'gmca-checkout-address-picker';
    section.innerHTML =
      '<div class="gmca-checkout-address-heading"><div><strong><span class="gmca-checkout-title-icon" aria-hidden="true">⌖</span> Saved delivery details</strong><p id="gmcaCheckoutAddressHelp">Sign in to load your saved phone number and address.</p></div><button type="button" class="gmca-checkout-manage" id="gmcaCheckoutManageAddresses">Manage</button></div>' +
      '<div class="gmca-checkout-address-controls"><select id="gmcaCheckoutAddressSelect" aria-label="Choose saved delivery address"><option value="">Use my default address</option></select><button type="button" class="gmca-primary gmca-checkout-use" id="gmcaCheckoutUseAddress">Use selected address</button></div>' +
      '<p id="gmcaCheckoutAddressFeedback" class="gmca-checkout-feedback" role="status" aria-live="polite"></p>';
    grid.insertAdjacentElement('afterend', section);
    $('gmcaCheckoutUseAddress').addEventListener('click', () => {
      const selectedId = $('gmcaCheckoutAddressSelect').value;
      const address = state.addresses.find((row) => String(row.id) === String(selectedId)) ||
        state.addresses.find((row) => row.is_default);
      if (!address) {
        const feedback = $('gmcaCheckoutAddressFeedback');
        if (feedback) {
          feedback.textContent = 'No saved address yet. Complete your first checkout while signed in and GENMERCH will save the details automatically.';
          feedback.className = 'gmca-checkout-feedback';
        }
        return;
      }
      applyCheckoutAddress(address, true);
    });
    $('gmcaCheckoutManageAddresses').addEventListener('click', () => {
      const session = state.session && state.session.user;
      if (!session) {
        if (typeof window.openCustomerAuth === 'function') window.openCustomerAuth();
        return;
      }
      openAccount().then(() => switchTab('addresses'));
    });
    renderCheckoutAddressPicker();
  }

  function renderCheckoutAddressPicker() {
    const select = $('gmcaCheckoutAddressSelect');
    if (!select) return;
    const rows = state.addresses || [];
    const current = select.value;
    select.innerHTML = '<option value="">Use my default address</option>' + rows.map((row) =>
      '<option value="' + esc(row.id) + '">' + esc((row.is_default ? '★ Default · ' : '') + (row.address_label || 'Saved address') + ' — ' + [row.city_municipality, row.province].filter(Boolean).join(', ')) + '</option>'
    ).join('');
    if (rows.some((row) => String(row.id) === String(current))) select.value = current;
    else {
      const defaultAddress = rows.find((row) => row.is_default);
      if (defaultAddress) select.value = String(defaultAddress.id);
    }
    const help = $('gmcaCheckoutAddressHelp');
    if (help) help.textContent = rows.length
      ? 'Your saved phone number and delivery details can be loaded here. Please review before ordering.'
      : 'Your successful order will be saved to your address book automatically.';
  }

  async function loadCheckoutDetails() {
    const session = state.session;
    if (!session || !session.user) {
      state.addresses = [];
      state.landmarks = [];
      renderCheckoutAddressPicker();
      return;
    }
    const db = client();
    const userId = session.user.id;
    const [profileResult, addressesResult, landmarksResult] = await Promise.all([
      tryQuery(() => db.from('profiles').select('id,full_name,phone').eq('id', userId).maybeSingle(), null),
      tryQuery(() => db.from('customer_addresses').select('id,address_label,recipient_name,phone,province,city_municipality,barangay,postal_code,street_address,landmark,delivery_instructions,is_default,created_at,updated_at').eq('user_id', userId).order('is_default', { ascending: false }).order('created_at', { ascending: false }), []),
      tryQuery(() => db.from('customer_default_landmarks').select('id,label,landmark,delivery_instructions,is_default,created_at,updated_at').eq('user_id', userId).order('is_default', { ascending: false }).order('created_at', { ascending: false }), [])
    ]);
    const profile = profileResult.data || null;
    state.addresses = asArray(addressesResult);
    state.landmarks = asArray(landmarksResult);
    // Address-specific recipient and phone data take precedence when the customer
    // has not typed checkout details yet; account profile data fills any remaining blanks.
    const defaultAddress = state.addresses.find((address) => address.is_default);
    if (defaultAddress) applyCheckoutAddress(defaultAddress, false);
    const name = currentUserName(session.user, profile);
    if (name) {
      setCheckoutField('firstName', name.split(/\s+/)[0], false);
      setCheckoutField('lastName', name.split(/\s+/).slice(1).join(' '), false);
      if (typeof window.syncCheckoutFullName === 'function') {
        try { window.syncCheckoutFullName(); } catch (_) {}
      } else if (typeof syncCheckoutFullName === 'function') {
        try { syncCheckoutFullName(); } catch (_) {}
      }
    }
    const accountPhone = profile && profile.phone ? profile.phone : (session.user.phone || '');
    setCheckoutField('custPhone', accountPhone, Boolean(String(accountPhone || '').trim()));
    const defaultLandmark = state.landmarks.find((item) => item.is_default);
    if (defaultLandmark) {
      setCheckoutField('landmark', defaultLandmark.landmark, false);
      setCheckoutField('specialInstructions', defaultLandmark.delivery_instructions, false);
      notifyCheckoutField('landmark');
      notifyCheckoutField('specialInstructions');
    }
    renderCheckoutAddressPicker();
  }

  async function saveUsedCheckoutAddress(requestPayload) {
    try {
      const auth = await client().auth.getSession();
      if (auth.error) throw auth.error;
      const session = auth.data && auth.data.session;
      if (!session || !session.user || !requestPayload) return false;
      const db = client();
      const userId = session.user.id;
      const address = {
        user_id: userId,
        address_label: 'Saved address',
        recipient_name: String(requestPayload.customer_name || '').trim(),
        phone: String(requestPayload.customer_phone || '').trim(),
        province: String(requestPayload.shipping_province || '').trim(),
        city_municipality: String(requestPayload.shipping_city_municipality || '').trim(),
        barangay: String(requestPayload.shipping_barangay || '').trim(),
        postal_code: String(requestPayload.shipping_postal_code || '').trim() || null,
        street_address: String(requestPayload.shipping_street_address || '').trim(),
        landmark: String(requestPayload.shipping_landmark || '').trim() || null,
        delivery_instructions: String(requestPayload.delivery_instructions || '').trim() || null,
        is_default: false
      };
      if (!address.recipient_name || !address.phone || !address.province || !address.city_municipality || !address.barangay || !address.street_address) return false;

      const [matchedResult, defaultResult, profileResult] = await Promise.all([
        tryQuery(() => db.from('customer_addresses').select('id,address_label,is_default').eq('user_id', userId).eq('street_address', address.street_address).eq('barangay', address.barangay).eq('city_municipality', address.city_municipality).eq('province', address.province).eq('postal_code', address.postal_code).limit(1).maybeSingle(), null),
        tryQuery(() => db.from('customer_addresses').select('id').eq('user_id', userId).eq('is_default', true).limit(1).maybeSingle(), null),
        tryQuery(() => db.from('profiles').select('id,full_name,phone').eq('id', userId).maybeSingle(), null)
      ]);
      if (matchedResult.error || defaultResult.error) throw matchedResult.error || defaultResult.error;
      const matched = matchedResult.data || null;
      if (matched) {
        const update = await db.from('customer_addresses').update({
          recipient_name: address.recipient_name, phone: address.phone,
          landmark: address.landmark, delivery_instructions: address.delivery_instructions,
          updated_at: new Date().toISOString()
        }).eq('id', matched.id).eq('user_id', userId);
        if (update.error) throw update.error;
        if (!defaultResult.data && !matched.is_default) {
          const promote = await db.from('customer_addresses').update({ is_default: true }).eq('id', matched.id).eq('user_id', userId);
          if (promote.error) throw promote.error;
        }
      } else {
        address.address_label = defaultResult.data ? 'Saved address' : 'Home';
        address.is_default = !defaultResult.data;
        const insert = await db.from('customer_addresses').insert(address);
        if (insert.error) throw insert.error;
      }

      const profile = profileResult.data || null;
      const profilePatch = { id: userId };
      if (!profile || !String(profile.full_name || '').trim()) profilePatch.full_name = address.recipient_name;
      if (!profile || !String(profile.phone || '').trim()) profilePatch.phone = address.phone;
      if (Object.keys(profilePatch).length > 1) {
        const profileSave = await db.from('profiles').upsert(profilePatch, { onConflict: 'id' });
        if (profileSave.error) console.warn('GENMERCH saved the address but could not update the profile phone/name:', profileSave.error.message);
      }

      const landmarkText = String(address.landmark || '').trim();
      const instructionsText = String(address.delivery_instructions || '').trim() || 'N/A';
      if (landmarkText && !/^n\/?a$/i.test(landmarkText)) {
        const [savedLandmarkResult, defaultLandmarkResult] = await Promise.all([
          tryQuery(() => db.from('customer_default_landmarks').select('id,is_default').eq('user_id', userId).eq('landmark', landmarkText).eq('delivery_instructions', instructionsText).limit(1).maybeSingle(), null),
          tryQuery(() => db.from('customer_default_landmarks').select('id').eq('user_id', userId).eq('is_default', true).limit(1).maybeSingle(), null)
        ]);
        if (savedLandmarkResult.error || defaultLandmarkResult.error) throw savedLandmarkResult.error || defaultLandmarkResult.error;
        if (savedLandmarkResult.data) {
          if (!defaultLandmarkResult.data && !savedLandmarkResult.data.is_default) {
            const promoteLandmark = await db.from('customer_default_landmarks').update({ is_default: true }).eq('id', savedLandmarkResult.data.id).eq('user_id', userId);
            if (promoteLandmark.error) throw promoteLandmark.error;
          }
        } else {
          const insertLandmark = await db.from('customer_default_landmarks').insert({
            user_id: userId,
            label: defaultLandmarkResult.data ? 'Saved landmark' : 'Default landmark',
            landmark: landmarkText,
            delivery_instructions: instructionsText,
            is_default: !defaultLandmarkResult.data
          });
          if (insertLandmark.error) throw insertLandmark.error;
        }
      }
      state.session = session;
      await loadCheckoutDetails();
      if ($('gmcaOverlay') && $('gmcaOverlay').classList.contains('open')) await loadAccountData();
      return true;
    } catch (error) {
      console.warn('GENMERCH could not auto-save this completed order address:', error && error.message ? error.message : error);
      return false;
    }
  }

  function getCartSubtotal() {
    try {
      if (typeof cart !== 'undefined' && Array.isArray(cart)) {
        return cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
      }
    } catch (_) {}
    const node = $('checkoutReviewSubtotal');
    if (!node) return 0;
    const digits = String(node.textContent || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '');
    const value = Number(digits);
    return Number.isFinite(value) ? value : 0;
  }

  function parseMoney(text) {
    const normalized = String(text || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return normalized ? Number(normalized[0]) : null;
  }

  function ensureCheckoutPoints() {
    const summary = $('checkoutReviewSummary');
    if (!summary || $('gmcaCheckoutPoints')) return;
    const totals = summary.querySelector('.checkout-review-totals');
    if (!totals) return;
    const box = document.createElement('section');
    box.id = 'gmcaCheckoutPoints';
    box.className = 'gmca-checkout-points';
    box.innerHTML =
      '<div class="gmca-checkout-points-top"><div><strong><span class="gmca-checkout-points-icon" aria-hidden="true">₱</span> Use GENMERCH Points</strong><p id="gmcaCheckoutPointsHelp">Sign in to view your available points.</p></div><label class="gmca-switch"><input type="checkbox" id="gmcaUsePoints" disabled><span></span><em>Apply</em></label></div>' +
      '<div class="gmca-checkout-points-foot"><span id="gmcaCheckoutPointsBalance">Available: 0 points</span><span id="gmcaCheckoutPointsMax">Maximum discount: ₱0</span></div>';
    const deliveryRow = totals.querySelector('#checkoutReviewShipping')?.closest('.checkout-review-total-row');
    if (deliveryRow && deliveryRow.parentNode === totals) {
      totals.insertBefore(box, deliveryRow.nextSibling);
    } else {
      totals.parentNode.insertBefore(box, totals);
    }
    const row = document.createElement('div');
    row.id = 'gmcaCheckoutPointsRow';
    row.className = 'checkout-review-total-row gmca-checkout-points-row';
    row.hidden = true;
    row.innerHTML = '<span>Loyalty points discount</span><strong id="gmcaCheckoutPointsDiscount">−₱0</strong>';
    const grand = totals.querySelector('.grand-total');
    totals.insertBefore(row, grand || null);
    $('gmcaUsePoints').addEventListener('change', () => {
      state.selectedPoints = $('gmcaUsePoints').checked ? calcSelectedPoints() : 0;
      window.genmerchSelectedLoyaltyPoints = state.selectedPoints;
      applyCheckoutDiscount();
    });
  }

  function calcSelectedPoints() {
    const subtotal = getCartSubtotal();
    const maxRedeem = Math.floor(subtotal * 0.20);
    const balance = Math.max(0, Number(state.checkoutBalance) || 0);
    if (balance < 20 || maxRedeem < 20) return 0;
    return Math.min(balance, maxRedeem);
  }

  function renderCheckoutPoints() {
    ensureCheckoutPoints();
    if (!$('gmcaUsePoints')) return;
    const subtotal = getCartSubtotal();
    const maxRedeem = Math.floor(subtotal * 0.20);
    const balance = Math.max(0, Number(state.checkoutBalance) || 0);
    const sessionUser = state.session && state.session.user;
    const checked = $('gmcaUsePoints').checked;
    $('gmcaCheckoutPointsBalance').textContent = 'Available: ' + balance.toLocaleString('en-PH') + ' points';
    $('gmcaCheckoutPointsMax').textContent = 'Maximum discount: ' + php(Math.max(0, maxRedeem));
    $('gmcaCheckoutPointsHelp').textContent = !sessionUser
      ? 'Sign in to use points at checkout.'
      : balance < 20
        ? 'Earn at least 20 points to redeem a discount.'
        : maxRedeem < 20
          ? 'Your merchandise subtotal must allow at least 20 points to be redeemed.'
          : 'Apply up to 20% of the eligible merchandise subtotal. 1 point = ₱1.';
    $('gmcaUsePoints').disabled = !sessionUser || balance < 20 || maxRedeem < 20;
    if ($('gmcaUsePoints').disabled && checked) $('gmcaUsePoints').checked = false;
    state.selectedPoints = $('gmcaUsePoints').checked ? calcSelectedPoints() : 0;
    window.genmerchSelectedLoyaltyPoints = state.selectedPoints;
    applyCheckoutDiscount();
  }

  function applyCheckoutDiscount() {
    const row = $('gmcaCheckoutPointsRow');
    const discountNode = $('gmcaCheckoutPointsDiscount');
    if (!row || !discountNode) return;
    const discount = Math.max(0, Number(state.selectedPoints) || 0);
    discountNode.textContent = '−' + php(discount);
    row.hidden = discount <= 0;
    if (state.baseCheckoutTotal !== '') {
      const base = parseMoney(state.baseCheckoutTotal);
      if (base !== null) {
        const total = Math.max(0, base - discount);
        if ($('finalTotalText')) $('finalTotalText').textContent = php(total);
        if ($('checkoutMiniTotal')) $('checkoutMiniTotal').textContent = php(total);
      } else {
        if ($('finalTotalText')) $('finalTotalText').textContent = state.baseCheckoutTotal;
        if ($('checkoutMiniTotal')) $('checkoutMiniTotal').textContent = state.baseCheckoutTotal;
      }
    }
  }

  async function refreshPointsBalance() {
    try {
      const result = await client().auth.getSession();
      if (result.error) throw result.error;
      state.session = result.data && result.data.session ? result.data.session : null;
      if (!state.session || !state.session.user) {
        state.checkoutBalance = 0;
        state.points = { points_balance: 0, lifetime_earned: 0, lifetime_redeemed: 0, history: [] };
      } else {
        const summary = await client().rpc('get_my_genmerch_loyalty_summary');
        if (summary.error) {
          console.warn('GENMERCH points summary could not be refreshed:', summary.error.message || summary.error);
          state.points = { points_balance: 0, lifetime_earned: 0, lifetime_redeemed: 0, history: [] };
          state.checkoutBalance = 0;
        } else {
          state.points = summary.data || { points_balance: 0, lifetime_earned: 0, lifetime_redeemed: 0, history: [] };
          state.checkoutBalance = Math.max(0, Number(state.points.points_balance) || 0);
        }
      }
      state.selectedPoints = Math.min(state.selectedPoints, state.checkoutBalance);
      if (state.session && state.session.user) await loadCheckoutDetails();
      else { state.addresses = []; state.landmarks = []; renderCheckoutAddressPicker(); }
      renderCheckoutPoints();
      if ($('gmcaOverlay') && $('gmcaOverlay').classList.contains('open')) await loadAccountData();
    } catch (error) {
      console.warn('GENMERCH loyalty balance could not be refreshed:', error.message || error);
      renderCheckoutPoints();
    }
  }

  function installUpdateCartHook() {
    let original = null;
    try {
      if (typeof window.updateCart === 'function') original = window.updateCart;
      else if (typeof updateCart === 'function') original = updateCart;
    } catch (_) {}
    if (!original || original.__gmcaWrapped) return;
    const wrapped = function () {
      const result = original.apply(this, arguments);
      const text = $('finalTotalText') ? $('finalTotalText').textContent.trim() : '';
      state.baseCheckoutTotal = text;
      renderCheckoutPoints();
      return result;
    };
    wrapped.__gmcaWrapped = true;
    window.updateCart = wrapped;
  }

  window.openGenmerchCustomerAccountEntry = function () {
    openAccount();
  };
  window.openGenmerchCustomerAccount = openAccount;
  window.closeGenmerchCustomerAccount = closeAccount;
  window.genmerchSelectedLoyaltyPoints = 0;
  window.genmerchRefreshLoyaltyPoints = refreshPointsBalance;
  window.genmerchSaveUsedCheckoutAddress = saveUsedCheckoutAddress;

  document.addEventListener('DOMContentLoaded', () => {
    ensureModal();
    ensureCheckoutPoints();
    ensureCheckoutAddressPicker();
    state.baseCheckoutTotal = $('finalTotalText') ? $('finalTotalText').textContent.trim() : '';
    installUpdateCartHook();
    renderCheckoutPoints();

    window.addEventListener('genmerch:customer-auth-changed', (event) => {
      const session = event && event.detail && event.detail.user ? event.detail : null;
      state.session = session;
      if (session) {
        refreshStorefrontAvatarForSession(session);
      } else {
        clearCustomerAvatarForSignedOut();
      }
    });
    document.addEventListener('visibilitychange', handleStorefrontAvatarVisibilityChange);
    window.addEventListener('focus', handleStorefrontAvatarVisibilityChange, { passive: true });

    try {
      const auth = client().auth;
      auth.getSession().then(async (result) => {
        if (result && result.error) throw result.error;
        const initialSession = result && result.data ? result.data.session : null;
        if (!initialSession || !initialSession.user) {
          if (!state.session || !state.session.user) clearCustomerAvatarForSignedOut();
          if (accountPanelRestoreRequested()) clearAccountPanelRestoreState();
          return;
        }
        state.session = initialSession;
        refreshStorefrontAvatarForSession(initialSession);
        if (accountPanelRestoreRequested()) await openAccount(true);
      }).catch((error) => {
        console.warn('GENMERCH initial storefront avatar session check failed:', error.message || error);
      });
      auth.onAuthStateChange((event, session) => {
        window.setTimeout(async () => {
          state.session = session && session.user ? session : null;
          if (event === 'SIGNED_OUT') {
            state.profile = null;
            clearCustomerAvatarForSignedOut();
            state.checkoutBalance = 0;
            state.selectedPoints = 0;
            window.genmerchSelectedLoyaltyPoints = 0;
            if ($('gmcaOverlay') && $('gmcaOverlay').classList.contains('open')) closeAccount();
            renderCheckoutPoints();
          } else if (session && session.user) {
            refreshStorefrontAvatarForSession(session);
            await refreshPointsBalance();
            if (state.openAfterLogin) { state.openAfterLogin = false; await openAccount(); }
          }
        }, 0);
      });
    } catch (error) {
      console.warn('GENMERCH loyalty refresh listener could not start:', error.message || error);
    }

    window.addEventListener('genmerch:loyalty-updated', refreshPointsBalance);
    window.addEventListener('genmerch:customer-address-saved', loadCheckoutDetails);
    refreshPointsBalance();
  });
})();
