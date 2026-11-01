
/* GENMERCH Trust & Testimonials: public submission, shared cards and Seller Centre tab. */
(function () {
  'use strict';

  if (window.__GENMERCH_TRUST_TESTIMONIALS_READY__) return;
  window.__GENMERCH_TRUST_TESTIMONIALS_READY__ = true;

  var TABLE = 'store_testimonials';
  var PRIVATE_AVATAR_BUCKET = 'customer-avatars';
  var PUBLIC_AVATAR_BUCKET = 'testimonial-avatars';
  var REFRESH_MS = 60000;
  var rows = [];
  var realtimeChannel = null;
  var refreshInterval = null;
  var refreshDebounce = null;
  var adminPanelActive = false;

  function byId(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function initials(value) {
    var words = String(value || 'Customer').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return 'GM';
    return words.length === 1
      ? words[0].slice(0, 2).toUpperCase()
      : (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  }

  function dateLabel(value) {
    var date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return 'Date unavailable';
    return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function getClient() {
    if (typeof window.getCustomerAuthClient === 'function') return window.getCustomerAuthClient();
    if (typeof getCustomerAuthClient === 'function') return getCustomerAuthClient();
    throw new Error('GENMERCH account services are still loading. Please refresh and try again.');
  }

  function avatarUrl(path) {
    if (!path) return '';
    try {
      var db = getClient();
      var result = db.storage.from(PUBLIC_AVATAR_BUCKET).getPublicUrl(path);
      return result && result.data && result.data.publicUrl ? result.data.publicUrl : '';
    } catch (_) {
      return '';
    }
  }

  function avatarMarkup(row) {
    var name = String(row.display_name || 'Customer');
    var url = avatarUrl(row.avatar_path);
    return '<span class="gmtt-avatar" aria-label="' + escapeHtml(name) + ' avatar">' +
      '<span aria-hidden="true">' + escapeHtml(initials(name)) + '</span>' +
      (url ? '<img src="' + escapeHtml(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') +
      '</span>';
  }

  function bindAvatarFallbacks(root) {
    (root || document).querySelectorAll('.gmtt-avatar img').forEach(function (image) {
      image.addEventListener('error', function () { image.classList.add('is-broken'); }, { once: true });
    });
  }

  function cardMarkup(row, admin) {
    var name = String(row.display_name || 'Customer');
    var feedback = String(row.feedback || '');
    var region = String(row.region || '');
    var cardClass = admin ? 'gmtt-admin-item' : 'gmtt-card';
    return '<article class="' + cardClass + '">' +
      avatarMarkup(row) +
      '<div class="' + (admin ? 'gmtt-admin-copy' : 'gmtt-card-content') + '">' +
        '<div class="gmtt-card-head">' +
          '<div class="gmtt-customer-meta">' +
            '<strong class="gmtt-customer-name">' + escapeHtml(name) + '</strong>' +
            '<span class="gmtt-region">' + escapeHtml(region) + '</span>' +
          '</div>' +
        '</div>' +
        '<p class="gmtt-feedback">' + escapeHtml(feedback) + '</p>' +
        '<time class="gmtt-card-date" datetime="' + escapeHtml(row.created_at || '') + '">' + escapeHtml(dateLabel(row.created_at)) + '</time>' +
      '</div>' +
    '</article>';
  }

  function setStatus(node, message, kind) {
    if (!node) return;
    node.textContent = message || '';
    node.className = 'gmtt-status' + (kind ? ' is-' + kind : '');
  }

  function emptyMarkup(message) {
    return '<div class="gmtt-empty">' + escapeHtml(message) + '</div>';
  }

  function renderPublic() {
    var grid = byId('gmttPublicList');
    if (!grid) return;
    if (!rows.length) {
      grid.innerHTML = emptyMarkup('No testimonials yet. Be the first to share your GENMERCH experience.');
      return;
    }
    grid.innerHTML = rows.map(function (row) { return cardMarkup(row, false); }).join('');
    bindAvatarFallbacks(grid);
  }

  function renderAdmin() {
    var list = byId('gmttAdminList');
    var count = byId('gmttAdminCount');
    if (!list) return;
    if (count) count.textContent = String(rows.length);
    if (!rows.length) {
      list.innerHTML = emptyMarkup('No testimonials have been submitted yet.');
      return;
    }
    list.innerHTML = rows.map(function (row) { return cardMarkup(row, true); }).join('');
    bindAvatarFallbacks(list);
  }

  async function fetchAllTestimonials() {
    var db = getClient();
    var all = [];
    var pageSize = 500;
    var from = 0;
    while (true) {
      var result = await db.from(TABLE)
        .select('id,display_name,feedback,region,avatar_path,created_at')
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (result.error) throw result.error;
      var page = Array.isArray(result.data) ? result.data : [];
      all = all.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  async function loadTestimonials() {
    try {
      rows = await fetchAllTestimonials();
      renderPublic();
      if (adminPanelActive) renderAdmin();
      return rows;
    } catch (error) {
      console.warn('GENMERCH Trust & Testimonials could not refresh:', error && error.message ? error.message : error);
      var grid = byId('gmttPublicList');
      if (grid && !rows.length) grid.innerHTML = emptyMarkup('Testimonials are temporarily unavailable. Please try again shortly.');
      throw error;
    }
  }

  var previousBodyOverflow = '';
  var postedCloseTimer = null;

  function injectPublicSection() {
    if (byId('genmerchTrustTestimonials') || byId('gmttModalOverlay')) return;

    var section = document.createElement('section');
    section.className = 'gmtt-section';
    section.id = 'genmerchTrustTestimonials';
    section.setAttribute('aria-labelledby', 'gmttTitle');
    section.innerHTML =
      '<div class="gmtt-heading">' +
        '<div><span class="gmtt-eyebrow">Community voices</span><h2 id="gmttTitle">Trust &amp; Testimonials</h2>' +
          '<p>Real feedback from customers across Luzon, Visayas and Mindanao. Read their experiences or share yours with the GENMERCH community.</p></div>' +
      '</div>' +
      '<div class="gmtt-form-card" id="gmttFormCard" hidden>' +
        '<h3 class="gmtt-form-heading">Share your GENMERCH experience</h3>' +
        '<p class="gmtt-form-copy">Your testimonial, display name and profile photo (when available) will be visible to everyone visiting GENMERCH.</p>' +
        '<form id="gmttForm" novalidate>' +
          '<div class="gmtt-form-grid">' +
            '<div class="gmtt-field"><label for="gmttName">Name / Nickname</label><input id="gmttName" name="display_name" type="text" minlength="2" maxlength="100" autocomplete="name" placeholder="Enter your name or nickname" required><small id="gmttNameHint" class="gmtt-field-hint">You can submit as a guest or sign in to use your account profile.</small></div>' +
            '<div class="gmtt-field"><label for="gmttRegion">Location</label><select id="gmttRegion" name="region" required><option value="">Choose your region</option><option value="Luzon">Luzon</option><option value="Visayas">Visayas</option><option value="Mindanao">Mindanao</option></select></div>' +
            '<div class="gmtt-field gmtt-field-full"><label for="gmttFeedback">Good feedback</label><textarea id="gmttFeedback" name="feedback" minlength="3" maxlength="1200" placeholder="Tell us about your experience with GENMERCH…" required></textarea><small class="gmtt-field-hint">3–1,200 characters.</small></div>' +
          '</div>' +
          '<label class="gmtt-consent"><input id="gmttConsent" type="checkbox" required><span>I understand that my testimonial and display identity (including my profile photo, if available) will be publicly visible on GENMERCH.</span></label>' +
          '<div class="gmtt-field" aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden"><label for="gmttWebsite">Leave this field empty</label><input id="gmttWebsite" name="website" type="text" tabindex="-1" autocomplete="off"></div>' +
          '<div class="gmtt-form-actions"><button class="gmtt-primary-button" id="gmttSubmit" type="submit">Publish testimonial</button><button class="gmtt-secondary-button" id="gmttCancel" type="button">Cancel</button></div>' +
          '<p class="gmtt-status" id="gmttFormStatus" role="status" aria-live="polite"></p>' +
        '</form>' +
      '</div>' +
      '<div class="gmtt-grid" id="gmttPublicList" aria-live="polite"><div class="gmtt-empty">Loading customer testimonials…</div></div>';

    var modal = document.createElement('div');
    modal.className = 'gmtt-modal-overlay';
    modal.id = 'gmttModalOverlay';
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML =
      '<section class="gmtt-modal-dialog" id="gmttModalDialog" role="dialog" aria-modal="true" aria-labelledby="gmttTitle" tabindex="-1">' +
        '<div class="gmtt-modal-toolbar">' +
          '<button class="gmtt-primary-button gmtt-add-testimonies" id="gmttOpenForm" type="button" aria-expanded="false">＋ Add Testimonies</button>' +
          '<button class="gmtt-modal-close" id="gmttCloseModal" type="button" aria-label="Close Trust and Testimonials">×</button>' +
        '</div>' +
        '<div class="gmtt-modal-scroll" id="gmttModalScroll"></div>' +
      '</section>' +
      '<div class="gmtt-posted-backdrop" id="gmttPostedPopup" hidden>' +
        '<div class="gmtt-posted-dialog" role="status" aria-live="assertive">' +
          '<span class="gmtt-posted-check" aria-hidden="true">✓</span>' +
          '<p>Your testimony is now public and posted.</p>' +
        '</div>' +
      '</div>';

    modal.querySelector('#gmttModalScroll').appendChild(section);
    document.body.appendChild(modal);

    byId('gmttOpenForm').addEventListener('click', function () {
      var formCard = byId('gmttFormCard');
      formCard.hidden = !formCard.hidden;
      byId('gmttOpenForm').setAttribute('aria-expanded', String(!formCard.hidden));
      byId('gmttOpenForm').textContent = formCard.hidden ? '＋ Add Testimonies' : '− Close Form';
      if (!formCard.hidden) {
        prepareCustomerIdentity().catch(function (error) {
          setStatus(byId('gmttFormStatus'), error && error.message ? error.message : 'Your account details could not be loaded.', 'error');
        });
        formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        byId('gmttName').focus({ preventScroll: true });
      }
    });
    byId('gmttCancel').addEventListener('click', function () {
      byId('gmttFormCard').hidden = true;
      byId('gmttOpenForm').setAttribute('aria-expanded', 'false');
      byId('gmttOpenForm').textContent = '＋ Add Testimonies';
      setStatus(byId('gmttFormStatus'), '', '');
    });
    byId('gmttForm').addEventListener('submit', submitTestimonial);
    byId('gmttCloseModal').addEventListener('click', closeTestimonialsModal);
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeTestimonialsModal();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !modal.hidden) {
        event.preventDefault();
        closeTestimonialsModal();
      }
    });
  }

  function openTestimonialsModal() {
    var modal = byId('gmttModalOverlay');
    var dialog = byId('gmttModalDialog');
    if (!modal || !dialog) return;
    previousBodyOverflow = document.body.style.overflow || '';
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    dialog.focus({ preventScroll: true });
  }

  function closeTestimonialsModal() {
    var modal = byId('gmttModalOverlay');
    var postedPopup = byId('gmttPostedPopup');
    if (postedCloseTimer !== null) {
      window.clearTimeout(postedCloseTimer);
      postedCloseTimer = null;
    }
    if (postedPopup) postedPopup.hidden = true;
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = previousBodyOverflow;
    var menuToggle = byId('gmMobileMenuToggle');
    if (menuToggle) menuToggle.focus({ preventScroll: true });
  }

  function showPostedConfirmation() {
    var popup = byId('gmttPostedPopup');
    if (!popup) {
      closeTestimonialsModal();
      return;
    }
    popup.hidden = false;
    if (postedCloseTimer !== null) window.clearTimeout(postedCloseTimer);
    postedCloseTimer = window.setTimeout(function () {
      postedCloseTimer = null;
      popup.hidden = true;
      closeTestimonialsModal();
    }, 1800);
  }

  var currentProfile = null;
  var currentUser = null;

  async function prepareCustomerIdentity() {
    var db = getClient();
    var sessionResult = await db.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    currentUser = sessionResult.data && sessionResult.data.session ? sessionResult.data.session.user : null;
    currentProfile = null;

    var nameInput = byId('gmttName');
    var hint = byId('gmttNameHint');
    if (!nameInput || !hint) return;

    nameInput.readOnly = false;
    nameInput.value = '';
    hint.textContent = currentUser
      ? 'Your account profile name will be used when one is saved.'
      : 'You are submitting as a guest. Enter the name or nickname you want displayed.';

    if (!currentUser) return;

    var profileResult = await db.from('profiles')
      .select('full_name,avatar_path')
      .eq('id', currentUser.id)
      .maybeSingle();
    if (profileResult.error) throw profileResult.error;
    currentProfile = profileResult.data || null;
    var profileName = String(currentProfile && currentProfile.full_name || '').trim();
    if (profileName) {
      nameInput.value = profileName;
      nameInput.readOnly = true;
      hint.textContent = 'Using the name saved in your GENMERCH customer profile.';
    } else {
      hint.textContent = 'Your profile does not have a display name yet. Enter a name or nickname for this testimonial.';
    }
  }

  async function copyOwnAvatarToPublicBucket(db, user, profile) {
    var privatePath = String(profile && profile.avatar_path || '').trim();
    if (!user || !privatePath || privatePath.indexOf(String(user.id) + '/') !== 0) return null;

    try {
      var downloaded = await db.storage.from(PRIVATE_AVATAR_BUCKET).download(privatePath);
      if (downloaded.error || !downloaded.data) throw downloaded.error || new Error('Private profile photo could not be downloaded.');
      var blob = downloaded.data;
      var mime = String(blob.type || '').toLowerCase();
      var extensionByMime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
      var extension = extensionByMime[mime];
      if (!extension) {
        var match = privatePath.match(/\.(jpg|jpeg|png|webp)$/i);
        extension = match ? match[1].toLowerCase() : '';
        if (!extension) throw new Error('Unsupported profile photo format.');
        mime = extension === 'png' ? 'image/png' : (extension === 'webp' ? 'image/webp' : 'image/jpeg');
      }
      var randomId = window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      var publicPath = String(user.id) + '/' + randomId + '.' + extension;
      var upload = await db.storage.from(PUBLIC_AVATAR_BUCKET).upload(publicPath, blob, {
        cacheControl: '31536000',
        contentType: mime,
        upsert: false
      });
      if (upload.error) throw upload.error;
      return publicPath;
    } catch (error) {
      console.warn('GENMERCH testimonial avatar copy was skipped:', error && error.message ? error.message : error);
      return null;
    }
  }

  async function submitTestimonial(event) {
    event.preventDefault();
    var form = byId('gmttForm');
    var nameInput = byId('gmttName');
    var feedbackInput = byId('gmttFeedback');
    var regionInput = byId('gmttRegion');
    var consent = byId('gmttConsent');
    var submit = byId('gmttSubmit');
    var honeypot = byId('gmttWebsite');

    if (honeypot && honeypot.value) return;
    var name = String(nameInput.value || '').trim().replace(/\s+/g, ' ');
    var feedback = String(feedbackInput.value || '').trim();
    var region = String(regionInput.value || '');
    if (name.length < 2 || name.length > 100) {
      setStatus(byId('gmttFormStatus'), 'Enter a name or nickname between 2 and 100 characters.', 'error');
      nameInput.focus();
      return;
    }
    if (feedback.length < 3 || feedback.length > 1200) {
      setStatus(byId('gmttFormStatus'), 'Feedback must be between 3 and 1,200 characters.', 'error');
      feedbackInput.focus();
      return;
    }
    if (['Luzon', 'Visayas', 'Mindanao'].indexOf(region) === -1) {
      setStatus(byId('gmttFormStatus'), 'Choose Luzon, Visayas or Mindanao.', 'error');
      regionInput.focus();
      return;
    }
    if (!consent.checked) {
      setStatus(byId('gmttFormStatus'), 'Please confirm that your testimonial and display identity may be shown publicly.', 'error');
      consent.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Publishing…';
    setStatus(byId('gmttFormStatus'), 'Saving your testimonial…', '');

    try {
      var db = getClient();
      var sessionResult = await db.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      var user = sessionResult.data && sessionResult.data.session ? sessionResult.data.session.user : null;
      var displayName = name;
      var profile = null;
      var publicAvatarPath = null;

      if (user) {
        var profileResult = await db.from('profiles')
          .select('full_name,avatar_path')
          .eq('id', user.id)
          .maybeSingle();
        if (profileResult.error) throw profileResult.error;
        profile = profileResult.data || null;
        var profileName = String(profile && profile.full_name || '').trim();
        if (profileName) displayName = profileName;
        publicAvatarPath = await copyOwnAvatarToPublicBucket(db, user, profile);
      }

      var insertResult = await db.from(TABLE).insert({
        user_id: user ? user.id : null,
        display_name: displayName,
        feedback: feedback,
        region: region,
        avatar_path: publicAvatarPath
      });
      if (insertResult.error) throw insertResult.error;

      form.reset();
      currentProfile = null;
      currentUser = null;
      setStatus(byId('gmttFormStatus'), 'Your testimony is now public and posted.', 'success');
      loadTestimonials().catch(function (refreshError) {
        console.warn('Testimonial posted, but the public list could not refresh immediately:', refreshError);
      });
      showPostedConfirmation();
    } catch (error) {
      console.error('GENMERCH testimonial submission failed:', error);
      setStatus(byId('gmttFormStatus'), error && error.message
        ? error.message
        : 'We could not publish your testimonial. Please try again.', 'error');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Publish testimonial';
    }
  }

  function installSellerCentreTab() {
    var overlay = byId('sellerDashboardOverlay');
    var tabs = overlay ? overlay.querySelector('.seller-tabs') : null;
    if (!overlay || !tabs || byId('sellerTestimonialsTab')) return;

    var tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'seller-tab-button';
    tab.id = 'sellerTestimonialsTab';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('aria-controls', 'sellerTestimonialsPanel');
    tab.textContent = 'Trust & Testimonials';
    var tools = tabs.querySelector('.seller-tab-tools');
    tabs.insertBefore(tab, tools || null);

    var panel = document.createElement('section');
    panel.className = 'seller-panel gmtt-admin-panel';
    panel.id = 'sellerTestimonialsPanel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'sellerTestimonialsTab');
    panel.hidden = true;
    panel.innerHTML =
      '<div class="gmtt-admin-header">' +
        '<div><h3>Trust &amp; Testimonials <span class="gmtt-admin-count" id="gmttAdminCount">0</span></h3>' +
        '<p>All customer testimonials shown on the public GENMERCH storefront.</p></div>' +
        '<button class="seller-secondary-button" id="gmttAdminRefresh" type="button">↻ Refresh testimonials</button>' +
      '</div>' +
      '<div class="gmtt-admin-list" id="gmttAdminList"><div class="gmtt-empty">Open this tab to load customer testimonials.</div></div>';

    var existingPanels = overlay.querySelectorAll('.seller-panel');
    var lastPanel = existingPanels.length ? existingPanels[existingPanels.length - 1] : tabs;
    lastPanel.insertAdjacentElement('afterend', panel);

    tab.addEventListener('click', function () {
      if (typeof window.switchSellerTab === 'function') window.switchSellerTab('testimonials');
    });
    byId('gmttAdminRefresh').addEventListener('click', function () {
      loadTestimonials().catch(function () {
        if (byId('gmttAdminList')) byId('gmttAdminList').innerHTML = emptyMarkup('Could not load testimonials. Please try again.');
      });
    });

    var baseSwitch = window.switchSellerTab;
    if (typeof baseSwitch === 'function' && !baseSwitch.__gmttWrapped) {
      var wrappedSwitch = function (requestedTab) {
        if (requestedTab === 'testimonials') {
          baseSwitch.call(this, 'products');
          adminPanelActive = true;
          overlay.querySelectorAll('.seller-tab-button').forEach(function (button) {
            button.classList.toggle('active', button.id === 'sellerTestimonialsTab');
            button.setAttribute('aria-selected', String(button.id === 'sellerTestimonialsTab'));
          });
          overlay.querySelectorAll('.seller-panel').forEach(function (item) {
            item.hidden = item.id !== 'sellerTestimonialsPanel';
          });
          panel.hidden = false;
          loadTestimonials().catch(function () {
            if (byId('gmttAdminList')) byId('gmttAdminList').innerHTML = emptyMarkup('Could not load testimonials. Please refresh and try again.');
          });
          return;
        }

        adminPanelActive = false;
        panel.hidden = true;
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
        return baseSwitch.apply(this, arguments);
      };
      wrappedSwitch.__gmttWrapped = true;
      window.switchSellerTab = wrappedSwitch;
    }

    var baseRefresh = window.refreshSellerTab;
    if (typeof baseRefresh === 'function' && !baseRefresh.__gmttWrapped) {
      var wrappedRefresh = function () {
        if (adminPanelActive) {
          return loadTestimonials();
        }
        return baseRefresh.apply(this, arguments);
      };
      wrappedRefresh.__gmttWrapped = true;
      window.refreshSellerTab = wrappedRefresh;
    }
  }

  function stopFallbackPolling() {
    if (refreshInterval !== null) {
      window.clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  function startFallbackPolling() {
    if (refreshInterval !== null) return;
    refreshInterval = window.setInterval(function () {
      if (document.visibilityState === 'visible') {
        loadTestimonials().catch(function () {});
      }
    }, REFRESH_MS);
  }

  function startRealtime() {
    if (realtimeChannel) return;
    try {
      var db = getClient();
      realtimeChannel = db.channel('genmerch-store-testimonials-public')
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, function () {
          window.clearTimeout(refreshDebounce);
          refreshDebounce = window.setTimeout(function () {
            loadTestimonials().catch(function () {});
          }, 350);
        })
        .subscribe(function (status) {
          if (status === 'SUBSCRIBED') {
            stopFallbackPolling();
          } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].indexOf(status) !== -1) {
            console.warn('GENMERCH testimonials Realtime is unavailable; periodic refresh remains active.');
            startFallbackPolling();
          }
        });
    } catch (error) {
      console.warn('GENMERCH testimonials Realtime could not start:', error && error.message ? error.message : error);
      startFallbackPolling();
    }
  }

  function openPublicSection() {
    openTestimonialsModal();
    loadTestimonials().catch(function () {});
  }

  function init() {
    injectPublicSection();
    installSellerCentreTab();
    window.addEventListener('genmerch:open-trust-testimonials', openPublicSection);
    if (!byId('genmerchTrustTestimonials')) return;
    loadTestimonials().catch(function () {});
    startRealtime();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
