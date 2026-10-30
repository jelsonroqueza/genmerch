(function () {
  'use strict';

  const state = {
    session: null,
    profile: null,
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
    checkoutBalance: 0,
    selectedPoints: 0,
    baseCheckoutTotal: '',
    loading: false
  };

  const $ = (id) => document.getElementById(id);
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

  function ensureModal() {
    if ($('gmcaOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'gmcaOverlay';
    overlay.className = 'gmca-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<section class="gmca-modal" role="dialog" aria-modal="true" aria-labelledby="gmcaTitle">' +
        '<header class="gmca-header">' +
          '<div class="gmca-brand"><span class="gmca-brand-mark"><img src="/assets/genmerch-cart-actual.webp?v=20261030-account" alt="GENMERCH official logo" width="72" height="56"></span><div><span class="gmca-eyebrow">GENMERCH CUSTOMER ACCOUNT</span><h2 id="gmcaTitle">My GENMERCH Account</h2><p id="gmcaWelcome">Your profile, points and shopping activity.</p></div></div>' +
          '<button type="button" class="gmca-close" id="gmcaClose" aria-label="Close account">×</button>' +
          '<div class="gmca-section-switcher" id="gmcaSectionSwitcher">' +
            '<label for="gmcaSectionTrigger">ACCOUNT SECTION</label>' +
            '<button type="button" class="gmca-section-trigger" id="gmcaSectionTrigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="gmcaSectionMenu">' +
              '<span id="gmcaSectionCurrent">Overview</span><span class="gmca-section-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6.5 9 5.5 5.5L17.5 9"/></svg></span>' +
            '</button>' +
            '<div class="gmca-section-menu" id="gmcaSectionMenu" role="listbox" aria-label="Account sections" hidden>' +
              '<button type="button" role="option" aria-selected="true" data-gmca-section="overview">Overview</button>' +
              '<button type="button" role="option" aria-selected="false" data-gmca-section="profile">My Profile</button>' +
              '<button type="button" role="option" aria-selected="false" data-gmca-section="points">Loyalty Points</button>' +
              '<button type="button" role="option" aria-selected="false" data-gmca-section="orders">My Orders</button>' +
              '<button type="button" role="option" aria-selected="false" data-gmca-section="activity">Shopping Activity</button>' +
              '<button type="button" role="option" aria-selected="false" data-gmca-section="addresses">Saved Addresses</button>' +
              '<button type="button" role="option" aria-selected="false" data-gmca-section="landmarks">Default Landmarks</button>' +
            '</div>' +
          '</div>' +
        '</header>' +
        '<div class="gmca-content">' +
          '<div class="gmca-alert" id="gmcaAlert" role="status" aria-live="polite" hidden></div>' +
          '<div id="gmcaLoading" class="gmca-loading">Loading your account securely…</div>' +
          '<section class="gmca-pane" data-gmca-pane="overview" hidden></section>' +
          '<section class="gmca-pane" data-gmca-pane="profile" hidden></section>' +
          '<section class="gmca-pane" data-gmca-pane="points" hidden></section>' +
          '<section class="gmca-pane" data-gmca-pane="orders" hidden></section>' +
          '<section class="gmca-pane" data-gmca-pane="activity" hidden></section>' +
          '<section class="gmca-pane" data-gmca-pane="addresses" hidden></section>' +
          '<section class="gmca-pane" data-gmca-pane="landmarks" hidden></section>' +
        '</div>' +
        '<footer class="gmca-footer"><span><span class="gmca-footer-lock">✓</span> Your account records are protected by your signed-in account permissions.</span><button type="button" id="gmcaSignOut" class="gmca-signout">Sign out</button></footer>' +
      '</section>';
    document.body.appendChild(overlay);
    ensureSignOutConfirmation();
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeAccount();
      if (!event.target.closest('.gmca-section-switcher')) closeSectionMenu();
      const option = event.target.closest('[data-gmca-section]');
      if (option) {
        switchTab(option.getAttribute('data-gmca-section'));
        closeSectionMenu();
        $('gmcaSectionTrigger')?.focus({ preventScroll: true });
      }
      if (!event.target.closest('.gmca-address-autocomplete')) hideAddressBookSuggestions();
    });
    $('gmcaSectionTrigger').addEventListener('click', toggleSectionMenu);
    $('gmcaSectionMenu').addEventListener('keydown', (event) => {
      const options = [...$('gmcaSectionMenu').querySelectorAll('[data-gmca-section]')];
      if (!options.length) return;
      const current = options.indexOf(document.activeElement);
      let target = current;
      if (event.key === 'ArrowDown') target = (current + 1 + options.length) % options.length;
      else if (event.key === 'ArrowUp') target = (current - 1 + options.length) % options.length;
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = options.length - 1;
      else return;
      event.preventDefault();
      options[target].focus();
    });
    $('gmcaClose').addEventListener('click', closeAccount);
    $('gmcaSignOut').addEventListener('click', openSignOutConfirmation);
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
      if ($('gmcaSectionMenu') && !$('gmcaSectionMenu').hidden) {
        closeSectionMenu();
        $('gmcaSectionTrigger')?.focus();
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
    const valid = ['overview', 'profile', 'points', 'orders', 'activity', 'addresses', 'landmarks'];
    state.activeTab = valid.includes(tabName) ? tabName : 'overview';
    if ($('gmcaSectionCurrent')) {
      const activeOption = $('gmcaSectionMenu')?.querySelector('[data-gmca-section="' + state.activeTab + '"]');
      $('gmcaSectionCurrent').textContent = activeOption ? activeOption.textContent.trim() : 'Overview';
    }
    $('gmcaSectionMenu')?.querySelectorAll('[data-gmca-section]').forEach((button) => {
      const active = button.getAttribute('data-gmca-section') === state.activeTab;
      button.setAttribute('aria-selected', String(active));
      button.classList.toggle('active', active);
    });
    closeSectionMenu();
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

  async function openAccount() {
    ensureModal();
    try {
      const { data, error } = await client().auth.getSession();
      if (error) throw error;
      const session = data && data.session;
      if (!session || !session.user) {
        state.openAfterLogin = true;
        if (typeof window.openCustomerAuth === 'function') window.openCustomerAuth();
        return;
      }
      state.session = session;
      state.loading = true;
      $('gmcaOverlay').classList.add('open');
      $('gmcaOverlay').setAttribute('aria-hidden', 'false');
      $('gmcaLoading').hidden = false;
      document.querySelectorAll('[data-gmca-pane]').forEach((pane) => { pane.hidden = true; });
      document.body.style.overflow = 'hidden';
      switchTab('overview');
      await loadAccountData();
    } catch (error) {
      if ($('gmcaOverlay')) {
        $('gmcaOverlay').classList.add('open');
        $('gmcaOverlay').setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        showAlert(error.message || 'Unable to load your GENMERCH account. Please refresh and try again.', 'error');
        $('gmcaLoading').hidden = true;
      }
    }
  }

  function closeAccount() {
    const overlay = $('gmcaOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
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

  async function loadAccountData() {
    if (!state.session || !state.session.user) return;
    const user = state.session.user;
    $('gmcaLoading').hidden = false;
    showAlert('');
    const db = client();
    const userId = user.id;
    const [profileResult, orderResult, addressResult, wishlistResult, reviewResult, pointsResult, landmarksResult] = await Promise.all([
      tryQuery(() => db.from('profiles').select('id,full_name,phone,created_at,updated_at').eq('id', userId).maybeSingle(), null),
      tryQuery(() => db.from('orders').select('id,order_number,status,payment_status,payment_method,subtotal,shipping_fee,discount_amount,total_amount,loyalty_points_redeemed,loyalty_points_discount,created_at,updated_at,receipt_email', { count: 'exact' }).eq('user_id', userId).order('created_at', { ascending: false }).limit(20), []),
      tryQuery(() => db.from('customer_addresses').select('id,address_label,recipient_name,phone,province,city_municipality,barangay,postal_code,street_address,landmark,delivery_instructions,is_default,created_at,updated_at').eq('user_id', userId).order('is_default', { ascending: false }).order('created_at', { ascending: false }), []),
      tryQuery(() => db.from('customer_wishlist').select('product_id,created_at').eq('user_id', userId).order('created_at', { ascending: false }), []),
      tryQuery(() => db.from('product_reviews').select('id,product_id,order_id,rating,feedback,nickname,moderation_status,created_at').eq('user_id', userId).order('created_at', { ascending: false }), []),
      tryQuery(() => db.rpc('get_my_genmerch_loyalty_summary'), null),
      tryQuery(() => db.from('customer_default_landmarks').select('id,label,landmark,delivery_instructions,is_default,created_at,updated_at').eq('user_id', userId).order('is_default', { ascending: false }).order('created_at', { ascending: false }), [])
    ]);

    state.profile = profileResult.data || null;
    state.orders = asArray(orderResult);
    state.orderCount = typeof orderResult.count === 'number' ? orderResult.count : state.orders.length;
    state.addresses = asArray(addressResult);
    state.wishlist = asArray(wishlistResult);
    state.landmarks = asArray(landmarksResult);
    state.reviews = asArray(reviewResult);
    state.points = pointsResult.data && typeof pointsResult.data === 'object'
      ? pointsResult.data
      : { points_balance: 0, lifetime_earned: 0, lifetime_redeemed: 0, history: [] };
    state.checkoutBalance = Math.max(0, Number(state.points.points_balance) || 0);
    state.selectedPoints = Math.min(state.selectedPoints, state.checkoutBalance);
    window.genmerchSelectedLoyaltyPoints = state.selectedPoints;

    const orderIds = state.orders.map((order) => order.id);
    if (orderIds.length) {
      const [itemsResult, shipmentResult] = await Promise.all([
        tryQuery(() => db.from('order_items').select('order_id,product_name,size_label,color_label,quantity,unit_price,line_total').in('order_id', orderIds), []),
        tryQuery(() => db.from('shipments').select('order_id,courier_name,tracking_number,tracking_url,status,shipped_at,delivered_at').in('order_id', orderIds), [])
      ]);
      state.orderItems = asArray(itemsResult);
      state.shipments = asArray(shipmentResult);
    } else {
      state.orderItems = [];
      state.shipments = [];
    }

    const wantedProductIds = [...new Set(state.wishlist.map((row) => String(row.product_id)))];
    if (wantedProductIds.length) {
      const productResult = await tryQuery(
        () => db.from('products').select('id,name,base_price,slug,is_active,is_deleted').in('id', wantedProductIds),
        []
      );
      state.wishlist = state.wishlist.map((wish) => ({
        ...wish,
        product: asArray(productResult).find((product) => String(product.id) === String(wish.product_id)) || null
      }));
    } else {
      state.wishlist = [];
    }

    const name = currentUserName(user, state.profile);
    $('gmcaWelcome').textContent = name ? 'Welcome back, ' + name + '. Your GENMERCH activity in one place.' : 'Your profile, points and shopping activity in one place.';
    $('gmcaLoading').hidden = true;
    renderAllPanes();
    renderCheckoutPoints();
    renderCheckoutAddressPicker();
    if ([profileResult, orderResult, addressResult, wishlistResult, reviewResult, pointsResult, landmarksResult].some((result) => result && result.error)) {
      showAlert('Some account information could not be loaded. Check your connection and tap Refresh account.', 'warning');
    }
    state.loading = false;
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
    pane.innerHTML =
      '<div class="gmca-welcome-card"><div><span class="gmca-eyebrow">YOUR CUSTOMER SPACE</span><h3>' + (name ? 'Hi, ' + esc(name.split(/\s+/)[0]) + '!' : 'Welcome to GENMERCH!') + '</h3><p>Track your purchases, manage your profile and use points toward eligible orders.</p></div><span class="gmca-welcome-icon" aria-hidden="true"><svg viewBox="0 0 48 48" focusable="false"><rect x="8" y="6.5" width="32" height="35" rx="7" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="18.5" r="5.2" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M14.5 33c1.9-4.6 5.1-6.8 9.5-6.8s7.6 2.2 9.5 6.8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M12 12h2M34 12h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></div>' +
      '<div class="gmca-metric-grid">' +
        metricCard('LOYALTY BALANCE', String(Math.max(0, Number(state.points.points_balance) || 0)), 'points', 'points') +
        metricCard('TOTAL ORDERS', String(Number(state.orderCount) || 0), 'orders', 'orders') +
        metricCard('WISHLIST ITEMS', String(state.wishlist.length), 'saved products', 'activity') +
        metricCard('YOUR REVIEWS', String(state.reviews.length), 'ratings & feedback', 'activity') +
      '</div>' +
      '<div class="gmca-section-card"><div class="gmca-section-heading"><div><h3>Recent orders</h3><p>Latest orders linked to your signed-in account.</p></div><button type="button" class="gmca-text-action" data-gmca-jump="orders">View all</button></div>' +
        (state.orders.length ? '<div class="gmca-list">' + state.orders.slice(0, 3).map((order) => orderCard(order, true)).join('') + '</div>' :
          '<div class="gmca-empty"><span>▣</span><strong>No account orders yet</strong><p>Your orders will appear here after you check out while signed in.</p></div>') +
      '</div>' +
      '<div class="gmca-overview-bottom"><div class="gmca-section-card"><h3>Member details</h3><p class="gmca-detail-line"><span>Registered email</span><strong>' + esc(user.email || '—') + '</strong></p><p class="gmca-detail-line"><span>Phone number</span><strong>' + esc(currentPhone(user, state.profile) || 'Not added yet') + '</strong></p><p class="gmca-detail-line"><span>Member since</span><strong>' + dateLabel(user.created_at) + '</strong></p><button type="button" class="gmca-text-action" data-gmca-jump="profile">Manage profile →</button></div>' +
      '<div class="gmca-section-card gmca-points-teaser"><h3>Make your next order go further</h3><p>Earn 1 point per ₱100 of eligible merchandise spending. Each point is worth ₱1 when redeemed at checkout.</p><button type="button" class="gmca-primary" data-gmca-jump="points">View points</button></div></div>' +
      '<div class="gmca-pane-actions"><button type="button" class="gmca-secondary" id="gmcaRefreshOverview">↻ Refresh account</button><button type="button" class="gmca-secondary" data-gmca-jump="profile">Edit profile</button></div>';
    pane.querySelectorAll('[data-gmca-jump]').forEach((button) => button.addEventListener('click', () => switchTab(button.getAttribute('data-gmca-jump'))));
    $('gmcaRefreshOverview').addEventListener('click', loadAccountData);
  }

  function metricCard(label, value, caption, tab) {
    return '<button type="button" class="gmca-metric" data-gmca-jump="' + esc(tab) + '"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(caption) + '</small></button>';
  }

  function renderProfilePane() {
    const pane = document.querySelector('[data-gmca-pane="profile"]');
    if (!pane || !state.session) return;
    const user = state.session.user;
    const fullName = currentUserName(user, state.profile);
    const phone = currentPhone(user, state.profile);
    pane.innerHTML =
      '<div class="gmca-pane-title"><div><h3>My Profile</h3><p>Update the information saved to your GENMERCH customer profile.</p></div></div>' +
      '<form id="gmcaProfileForm" class="gmca-form">' +
        '<label>Full name<input type="text" id="gmcaFullName" name="full_name" maxlength="100" value="' + esc(fullName) + '" autocomplete="name" required></label>' +
        '<label>Registered email<input type="email" value="' + esc(user.email || '') + '" readonly aria-readonly="true"><small>Your login email is shown here and is not changed by this form.</small></label>' +
        '<label>Mobile number<input type="tel" id="gmcaPhone" name="phone" maxlength="20" value="' + esc(phone) + '" autocomplete="tel" placeholder="09XXXXXXXXX"></label>' +
        '<label>Registration date<input type="text" value="' + esc(dateLabel(user.created_at)) + '" readonly aria-readonly="true"></label>' +
        '<div class="gmca-form-actions"><button type="submit" class="gmca-primary" id="gmcaSaveProfile">Save profile</button><span id="gmcaProfileFeedback" role="status" aria-live="polite"></span></div>' +
      '</form>' +
      '<div class="gmca-note"><strong>Privacy note</strong><p>Your profile is saved under your signed-in customer ID. Order and address records are loaded through their own access policies.</p></div>';
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
    const wishlistMarkup = state.wishlist.length
      ? '<div class="gmca-activity-list">' + state.wishlist.map((wish) => {
        const product = wish.product;
        return '<div class="gmca-activity-row"><div><strong>' + esc(product ? product.name : 'Saved product') + '</strong><small>Saved ' + esc(dateLabel(wish.created_at)) + (product && product.is_active && !product.is_deleted ? ' · Available in the catalog' : ' · May no longer be available') + '</small></div><b>' + (product && product.base_price != null ? esc(php(product.base_price)) : '') + '</b></div>';
      }).join('') + '</div>'
      : '<div class="gmca-empty gmca-empty-small"><strong>No saved products</strong><p>Items you add to your wishlist appear here.</p></div>';

    const addressMarkup = state.addresses.length
      ? '<div class="gmca-activity-list">' + state.addresses.map((address) =>
        '<div class="gmca-address-card">' +
          (address.is_default ? '<span class="gmca-default-tag">DEFAULT ADDRESS</span>' : '') +
          '<strong>' + esc(address.recipient_name) + '</strong><p>' + esc(address.phone) + '</p>' +
          '<p>' + esc([address.street_address, address.barangay, address.city_municipality, address.province, address.postal_code].filter(Boolean).join(', ')) + '</p>' +
          (address.landmark ? '<small>Landmark: ' + esc(address.landmark) + '</small>' : '') +
        '</div>'
      ).join('') + '</div>'
      : '<div class="gmca-empty gmca-empty-small"><strong>No saved delivery addresses</strong><p>Saved addresses will appear here when available in your account.</p></div>';

    const reviewMarkup = state.reviews.length
      ? '<div class="gmca-activity-list">' + state.reviews.map((review) =>
        '<div class="gmca-activity-row gmca-review-row"><div><strong>' + esc('★'.repeat(Math.max(0, Math.min(5, Number(review.rating) || 0))) + ' ' + (Number(review.rating) || 0) + '/5') + '</strong><p>' + esc(review.feedback) + '</p><small>' + esc(dateLabel(review.created_at)) + ' · ' + esc(displayStatus(review.moderation_status)) + '</small></div></div>'
      ).join('') + '</div>'
      : '<div class="gmca-empty gmca-empty-small"><strong>No reviews yet</strong><p>Your product ratings and feedback will appear here.</p></div>';

    pane.innerHTML =
      '<div class="gmca-pane-title"><div><h3>Shopping Activity</h3><p>Your saved products, delivery addresses and product feedback.</p></div><button type="button" class="gmca-secondary gmca-small-button" id="gmcaActivityRefresh">↻ Refresh</button></div>' +
      '<div class="gmca-section-card"><div class="gmca-section-heading"><div><h3>Wishlist</h3><p>' + esc(state.wishlist.length) + ' saved product(s).</p></div></div>' + wishlistMarkup + '</div>' +
      '<div class="gmca-section-card"><div class="gmca-section-heading"><div><h3>Saved delivery addresses</h3><p>Private address records saved to your account.</p></div></div>' + addressMarkup + '</div>' +
      '<div class="gmca-section-card"><div class="gmca-section-heading"><div><h3>Product ratings & reviews</h3><p>' + esc(state.reviews.length) + ' review(s) linked to your account.</p></div></div>' + reviewMarkup + '</div>';
    $('gmcaActivityRefresh').addEventListener('click', loadAccountData);
  }

  function renderAddressesPane() {
    const pane = document.querySelector('[data-gmca-pane="addresses"]');
    if (!pane) return;
    const rows = state.addresses || [];
    pane.innerHTML =
      '<div class="gmca-pane-title"><div><h3>Saved Address Book</h3><p>Save delivery details once, then load them into checkout with one tap.</p></div><button type="button" class="gmca-secondary gmca-small-button" id="gmcaAddressesRefresh">↻ Refresh</button></div>' +
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
      '<div class="gmca-pane-title"><div><h3>Default Landmarks</h3><p>Save frequently used directions and special delivery instructions for faster checkout.</p></div><button type="button" class="gmca-secondary gmca-small-button" id="gmcaLandmarksRefresh">↻ Refresh</button></div>' +
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
    totals.parentNode.insertBefore(box, totals);
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

    try {
      const auth = client().auth;
      auth.onAuthStateChange((event, session) => {
        window.setTimeout(async () => {
          state.session = session && session.user ? session : null;
          if (event === 'SIGNED_OUT') {
            state.checkoutBalance = 0;
            state.selectedPoints = 0;
            window.genmerchSelectedLoyaltyPoints = 0;
            if ($('gmcaOverlay') && $('gmcaOverlay').classList.contains('open')) closeAccount();
            renderCheckoutPoints();
          } else if (session && session.user) {
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

/* Keep the signed-in account badge as initials on desktop, tablet, and mobile. */
(function installGenmerchResponsiveAccountInitials(){
  'use strict';
  function makeInitials(identity){
    const value=String(identity||'').trim();
    if(!value)return 'GM';
    if(value.includes('@')){
      const local=value.split('@')[0].replace(/[^a-zA-Z0-9]/g,'');
      return (local.slice(0,2)||'GM').toUpperCase();
    }
    const parts=value.split(/\s+/).filter(Boolean);
    if(parts.length>1)return (parts[0].charAt(0)+parts[parts.length-1].charAt(0)).toUpperCase();
    return (parts[0].replace(/[^a-zA-Z0-9]/g,'').slice(0,2)||'GM').toUpperCase();
  }
  function start(){
    const button=document.getElementById('customerAccountButton');
    const label=document.getElementById('customerAccountLabel');
    if(!button||!label)return;
    function apply(){
      if(!button.classList.contains('customer-account-signed-in'))return;
      const identity=String(label.dataset.fullName||button.getAttribute('title')||'').trim();
      if(!identity)return;
      const initials=makeInitials(identity);
      const icon=button.querySelector('.header-icon');
      if(icon&&icon.dataset.initials!==initials)icon.dataset.initials=initials;
      if(label.textContent.trim()!=='Account')label.textContent='Account';
      label.setAttribute('aria-label','Account');
    }
    apply();
    if(typeof MutationObserver==='function'){
      const labelObserver=new MutationObserver(apply);
      labelObserver.observe(label,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-full-name']});
      const buttonObserver=new MutationObserver(apply);
      buttonObserver.observe(button,{attributes:true,attributeFilter:['class','title']});
    }
    window.addEventListener('resize',apply,{passive:true});
    window.addEventListener('orientationchange',apply,{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
