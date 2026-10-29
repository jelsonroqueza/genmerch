(function () {
  'use strict';

  const state = {
    session: null,
    profile: null,
    orders: [],
    orderItems: [],
    shipments: [],
    addresses: [],
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

  function ensureModal() {
    if ($('gmcaOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'gmcaOverlay';
    overlay.className = 'gmca-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<section class="gmca-modal" role="dialog" aria-modal="true" aria-labelledby="gmcaTitle">' +
        '<header class="gmca-header">' +
          '<div class="gmca-brand"><span class="gmca-brand-mark">G</span><div><span class="gmca-eyebrow">GENMERCH CUSTOMER ACCOUNT</span><h2 id="gmcaTitle">My GENMERCH Account</h2><p id="gmcaWelcome">Your profile, points and shopping activity.</p></div></div>' +
          '<button type="button" class="gmca-close" id="gmcaClose" aria-label="Close account">×</button>' +
        '</header>' +
        '<div class="gmca-tabs" role="tablist" aria-label="Account sections">' +
          '<button type="button" role="tab" aria-selected="true" data-gmca-tab="overview">Overview</button>' +
          '<button type="button" role="tab" aria-selected="false" data-gmca-tab="profile">My Profile</button>' +
          '<button type="button" role="tab" aria-selected="false" data-gmca-tab="points">Loyalty Points</button>' +
          '<button type="button" role="tab" aria-selected="false" data-gmca-tab="orders">My Orders</button>' +
          '<button type="button" role="tab" aria-selected="false" data-gmca-tab="activity">Shopping Activity</button>' +
        '</div>' +
        '<div class="gmca-content">' +
          '<div class="gmca-alert" id="gmcaAlert" role="status" aria-live="polite" hidden></div>' +
          '<div id="gmcaLoading" class="gmca-loading">Loading your account securely…</div>' +
          '<section class="gmca-pane" data-gmca-pane="overview" hidden></section>' +
          '<section class="gmca-pane" data-gmca-pane="profile" hidden></section>' +
          '<section class="gmca-pane" data-gmca-pane="points" hidden></section>' +
          '<section class="gmca-pane" data-gmca-pane="orders" hidden></section>' +
          '<section class="gmca-pane" data-gmca-pane="activity" hidden></section>' +
        '</div>' +
        '<footer class="gmca-footer"><span><span class="gmca-footer-lock">✓</span> Your account records are protected by your signed-in account permissions.</span><button type="button" id="gmcaSignOut" class="gmca-signout">Sign out</button></footer>' +
      '</section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeAccount();
      const tab = event.target.closest('[data-gmca-tab]');
      if (tab) switchTab(tab.getAttribute('data-gmca-tab'));
    });
    $('gmcaClose').addEventListener('click', closeAccount);
    $('gmcaSignOut').addEventListener('click', signOut);
    overlay.addEventListener('submit', (event) => {
      if (event.target && event.target.id === 'gmcaProfileForm') {
        event.preventDefault();
        saveProfile();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && $('gmcaOverlay') && $('gmcaOverlay').classList.contains('open')) closeAccount();
    });
  }

  function showAlert(message, kind) {
    const alert = $('gmcaAlert');
    if (!alert) return;
    alert.textContent = message || '';
    alert.className = 'gmca-alert' + (kind ? ' ' + kind : '');
    alert.hidden = !message;
  }

  function switchTab(tabName) {
    const valid = ['overview', 'profile', 'points', 'orders', 'activity'];
    state.activeTab = valid.includes(tabName) ? tabName : 'overview';
    document.querySelectorAll('[data-gmca-tab]').forEach((button) => {
      const active = button.getAttribute('data-gmca-tab') === state.activeTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-gmca-pane]').forEach((pane) => {
      pane.hidden = pane.getAttribute('data-gmca-pane') !== state.activeTab;
    });
    if (state.activeTab === 'points') renderPointsPane();
    if (state.activeTab === 'orders') renderOrdersPane();
    if (state.activeTab === 'activity') renderActivityPane();
    if (state.activeTab === 'profile') renderProfilePane();
    if (state.activeTab === 'overview') renderOverviewPane();
  }

  async function openAccount() {
    ensureModal();
    try {
      const { data, error } = await client().auth.getSession();
      if (error) throw error;
      const session = data && data.session;
      if (!session || !session.user) {
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
    } catch (error) {
      showAlert(error.message || 'Could not sign out. Please try again.', 'error');
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
    const [profileResult, orderResult, addressResult, wishlistResult, reviewResult, pointsResult] = await Promise.all([
      tryQuery(() => db.from('profiles').select('id,full_name,phone,created_at,updated_at').eq('id', userId).maybeSingle(), null),
      tryQuery(() => db.from('orders').select('id,order_number,status,payment_status,payment_method,subtotal,shipping_fee,discount_amount,total_amount,loyalty_points_redeemed,loyalty_points_discount,created_at,updated_at,receipt_email', { count: 'exact' }).eq('user_id', userId).order('created_at', { ascending: false }).limit(20), []),
      tryQuery(() => db.from('customer_addresses').select('id,recipient_name,phone,province,city_municipality,barangay,postal_code,street_address,landmark,delivery_instructions,is_default,created_at,updated_at').eq('user_id', userId).order('is_default', { ascending: false }).order('created_at', { ascending: false }), []),
      tryQuery(() => db.from('customer_wishlist').select('product_id,created_at').eq('user_id', userId).order('created_at', { ascending: false }), []),
      tryQuery(() => db.from('product_reviews').select('id,product_id,order_id,rating,feedback,nickname,moderation_status,created_at').eq('user_id', userId).order('created_at', { ascending: false }), []),
      tryQuery(() => db.rpc('get_my_genmerch_loyalty_summary'), null)
    ]);

    state.profile = profileResult.data || null;
    state.orders = asArray(orderResult);
    state.orderCount = typeof orderResult.count === 'number' ? orderResult.count : state.orders.length;
    state.addresses = asArray(addressResult);
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
    if ([profileResult, orderResult, addressResult, wishlistResult, reviewResult, pointsResult].some((result) => result && result.error)) {
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
  }

  function renderOverviewPane() {
    const pane = document.querySelector('[data-gmca-pane="overview"]');
    if (!pane || !state.session) return;
    const user = state.session.user;
    const name = currentUserName(user, state.profile);
    pane.innerHTML =
      '<div class="gmca-welcome-card"><div><span class="gmca-eyebrow">YOUR CUSTOMER SPACE</span><h3>' + (name ? 'Hi, ' + esc(name.split(/\s+/)[0]) + '!' : 'Welcome to GENMERCH!') + '</h3><p>Track your purchases, manage your profile and use points toward eligible orders.</p></div><span class="gmca-welcome-icon" aria-hidden="true">✦</span></div>' +
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
      '<div class="gmca-overview-bottom"><div class="gmca-section-card"><h3>Member details</h3><p class="gmca-detail-line"><span>Registered email</span><strong>' + esc(user.email || '—') + '</strong></p><p class="gmca-detail-line"><span>Member since</span><strong>' + dateLabel(user.created_at) + '</strong></p></div>' +
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
      '<div class="gmca-checkout-points-top"><div><strong>✦ Use GENMERCH Points</strong><p id="gmcaCheckoutPointsHelp">Sign in to view your available points.</p></div><label class="gmca-switch"><input type="checkbox" id="gmcaUsePoints" disabled><span></span><em>Apply</em></label></div>' +
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
        if (summary.error) throw summary.error;
        state.points = summary.data || { points_balance: 0, lifetime_earned: 0, lifetime_redeemed: 0, history: [] };
        state.checkoutBalance = Math.max(0, Number(state.points.points_balance) || 0);
      }
      state.selectedPoints = Math.min(state.selectedPoints, state.checkoutBalance);
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

  document.addEventListener('DOMContentLoaded', () => {
    ensureModal();
    ensureCheckoutPoints();
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
          }
        }, 0);
      });
    } catch (error) {
      console.warn('GENMERCH loyalty refresh listener could not start:', error.message || error);
    }

    window.addEventListener('genmerch:loyalty-updated', refreshPointsBalance);
    refreshPointsBalance();
  });
})();