/* GENMERCH V2.0 — persistent form drafts.
 * Saves eligible form fields locally per customer account and per form.
 * Passwords, passcodes, OTPs, payment credentials, hidden fields and file uploads are excluded.
 */
(function () {
  'use strict';

  const STORAGE_PREFIX = 'genmerch.formDrafts.v1:';
  const ROOT_SELECTOR = '.seller-modal-overlay,.customer-orders-overlay,.wishlist-overlay,.cart-overlay,.cart-modal,.overlay,.gmca-overlay,.genmerch-review-overlay,.customer-auth-overlay,[id$="Overlay"],[id$="Modal"]';
  const EXISTING_CHECKOUT_DRAFT_FIELDS = new Set([
    'custName','firstName','lastName','custPhone','streetAddress','province','city',
    'barangay','postalCode','landmark','specialInstructions'
  ]);
  const SENSITIVE_NAME = /(?:^|[_-])(password|passcode|otp|one.?time.?code|verification.?code|security.?code|token|secret|cvv|cvc|pin)(?:$|[_-])/i;
  const SENSITIVE_ID = /(password|passcode|one.?time.?code|verification.?code|security.?code|access.?token|refresh.?token|auth.?token|secret|cvv|cvc|card.?number|credit.?card|debit.?card)/i;
  const dirtyGroups = new Map();
  const saveTimers = new Map();
  const restoredGroups = new WeakMap();
  let currentScope = 'guest';
  let scopeInitialized = false;
  let observer = null;

  function storageKey(scope) {
    return STORAGE_PREFIX + encodeURIComponent(scope || currentScope);
  }

  function isSensitiveField(field) {
    const type = String(field.type || '').toLowerCase();
    const id = String(field.id || '');
    const name = String(field.name || '');
    const autocomplete = String(field.autocomplete || '').toLowerCase();
    return (
      field.hasAttribute('data-gm-draft-ignore') ||
      Boolean(field.closest('[data-gm-draft-ignore],.partner-honeypot')) ||
      ['password','file','hidden','submit','button','reset','image'].includes(type) ||
      autocomplete === 'one-time-code' ||
      autocomplete === 'current-password' ||
      autocomplete === 'new-password' ||
      autocomplete.startsWith('cc-') ||
      SENSITIVE_NAME.test(name) ||
      SENSITIVE_ID.test(id) ||
      EXISTING_CHECKOUT_DRAFT_FIELDS.has(id) ||
      field.disabled ||
      field.readOnly
    );
  }

  function isEligibleField(field) {
    if (!(field instanceof HTMLElement)) return false;
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName)) return false;
    return !isSensitiveField(field);
  }

  function formKey(form) {
    const custom = String(form.dataset.gmDraftKey || '').trim();
    if (custom) return 'form:' + custom;
    const id = String(form.id || '').trim();
    if (id) return 'form:' + id;
    const name = String(form.getAttribute('name') || '').trim();
    if (name) return 'form:name:' + name;
    return '';
  }

  function groupForField(field) {
    if (!field) return null;
    const form = field.closest('form');
    if (form) {
      const key = formKey(form);
      return key ? { element: form, key: key, isForm: true } : null;
    }
    const root = field.closest(ROOT_SELECTOR);
    if (root && root.id) return { element: root, key: 'container:' + root.id, isForm: false };
    return null;
  }

  function getGroupFields(group) {
    const candidates = Array.from(group.element.querySelectorAll('input,textarea,select'));
    return candidates.filter(function (field) {
      if (!isEligibleField(field)) return false;
      return group.isForm ? field.closest('form') === group.element : !field.closest('form');
    });
  }

  function fieldKeys(fields) {
    const counts = new Map();
    return fields.map(function (field, index) {
      if (field.id) return 'id:' + field.id;
      const name = String(field.name || '');
      if (name) {
        const count = counts.get(name) || 0;
        counts.set(name, count + 1);
        return 'name:' + name + ':' + count;
      }
      return 'index:' + index + ':' + String(field.type || field.tagName).toLowerCase();
    });
  }

  function readFieldValue(field) {
    const type = String(field.type || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio') return { kind: 'checked', value: Boolean(field.checked) };
    if (field.tagName === 'SELECT' && field.multiple) {
      return { kind: 'multiple', value: Array.from(field.selectedOptions).map(function (option) { return option.value; }) };
    }
    return { kind: 'value', value: String(field.value || '').slice(0, 6000) };
  }

  function applyFieldValue(field, savedValue) {
    if (!savedValue || typeof savedValue !== 'object') return false;
    if (field.dataset.gmDraftTouched === '1') return false;
    if (savedValue.kind === 'checked' && ('checked' in field)) {
      field.checked = Boolean(savedValue.value);
      return true;
    }
    if (savedValue.kind === 'multiple' && field.tagName === 'SELECT' && field.multiple) {
      const selected = new Set(Array.isArray(savedValue.value) ? savedValue.value.map(String) : []);
      Array.from(field.options).forEach(function (option) { option.selected = selected.has(option.value); });
      return true;
    }
    if (savedValue.kind !== 'value') return false;
    const value = String(savedValue.value == null ? '' : savedValue.value);
    if (field.tagName === 'SELECT') {
      const exists = Array.from(field.options).some(function (option) { return option.value === value; });
      if (!exists && value !== '') return false;
    }
    field.value = value;
    return true;
  }

  function readStore(scope) {
    try {
      const raw = window.localStorage.getItem(storageKey(scope));
      if (!raw) return { version: 1, groups: {} };
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || typeof parsed.groups !== 'object') return { version: 1, groups: {} };
      if ((scope || currentScope) === 'guest' && parsed.claimedBy) return { version: 1, groups: {} };
      return parsed;
    } catch (error) {
      console.warn('GENMERCH saved form drafts are unavailable in this browser.', error);
      return { version: 1, groups: {} };
    }
  }

  function writeStore(store, scope) {
    try {
      const serialized = JSON.stringify(store);
      if (serialized.length > 1800000) {
        console.warn('GENMERCH form draft storage limit reached. The latest change was not saved.');
        return false;
      }
      window.localStorage.setItem(storageKey(scope), serialized);
      return true;
    } catch (error) {
      console.warn('GENMERCH could not save a form draft in browser storage.', error);
      return false;
    }
  }

  function getExtraFormState(group) {
    if (!group.isForm) return {};
    const form = group.element;
    const extra = {};
    const activeStep = form.querySelector('[data-partner-step].is-active');
    if (activeStep && activeStep.dataset.partnerStep !== undefined) {
      extra.activeStep = Math.max(0, Math.min(20, Number(activeStep.dataset.partnerStep) || 0));
    }
    const selectedStar = form.querySelector('[data-review-star][aria-pressed="true"]');
    if (selectedStar) extra.rating = Math.max(1, Math.min(5, Number(selectedStar.dataset.reviewStar) || 5));
    return extra;
  }

  function saveGroup(group) {
    if (!scopeInitialized || !group || !group.element || !group.element.isConnected) return false;
    const fields = getGroupFields(group);
    if (!fields.length) return false;
    const keys = fieldKeys(fields);
    const values = {};
    fields.forEach(function (field, index) {
      values[keys[index]] = readFieldValue(field);
    });
    const store = readStore();
    const previous = store.groups[group.key] || {};
    const touchedKeys = fields.reduce(function (list, field, index) {
      if (field.dataset.gmDraftTouched === '1') list.push(keys[index]);
      return list;
    }, []);
    const mergedTouchedKeys = Array.from(new Set([].concat(previous.touchedFields || [], touchedKeys)));
    store.groups[group.key] = Object.assign({}, previous, {
      values: values,
      touchedFields: mergedTouchedKeys,
      extraTouched: Boolean(group.isForm && group.element.dataset.gmDraftExtraTouched === '1') || Boolean(previous.extraTouched),
      updatedAt: Date.now()
    }, getExtraFormState(group));
    return writeStore(store);
  }

  function flushGroup(group) {
    if (!group) return;
    const timer = saveTimers.get(group.key);
    if (timer) window.clearTimeout(timer);
    saveTimers.delete(group.key);
    dirtyGroups.delete(group.key);
    saveGroup(group);
  }

  function scheduleSave(group, delay) {
    if (!group) return;
    dirtyGroups.set(group.key, group);
    const previousTimer = saveTimers.get(group.key);
    if (previousTimer) window.clearTimeout(previousTimer);
    const timer = window.setTimeout(function () {
      saveTimers.delete(group.key);
      dirtyGroups.delete(group.key);
      saveGroup(group);
    }, Number.isFinite(delay) ? delay : 220);
    saveTimers.set(group.key, timer);
  }

  function restoreGroup(group, preserveExisting) {
    if (!group || !group.element || !group.element.isConnected) return;
    const store = readStore();
    const saved = store.groups[group.key];
    if (!saved || !saved.values || typeof saved.values !== 'object') {
      restoredGroups.set(group.element, currentScope + '|' + group.key);
      return;
    }
    const fields = getGroupFields(group);
    const keys = fieldKeys(fields);
    let pendingSelectRestore = false;
    fields.forEach(function (field, index) {
      const savedValue = saved.values[keys[index]];
      if (!savedValue || field.dataset.gmDraftTouched === '1') return;
      if (preserveExisting) {
        const type = String(field.type || '').toLowerCase();
        const hasExistingValue = type === 'checkbox' || type === 'radio'
          ? Boolean(field.checked)
          : String(field.value || '') !== '';
        if (hasExistingValue) return;
      }
      const applied = applyFieldValue(field, savedValue);
      if (!applied && field.tagName === 'SELECT' && savedValue.kind === 'value' && String(savedValue.value || '') !== '') {
        pendingSelectRestore = true;
      }
    });

    if (group.isForm) {
      if (Number.isInteger(saved.activeStep)) {
        group.element.dataset.gmDraftStep = String(saved.activeStep);
        group.element.dispatchEvent(new CustomEvent('genmerch:restore-draft-step', {
          bubbles: false,
          detail: { step: saved.activeStep }
        }));
      }
      if (Number.isInteger(saved.rating)) {
        const star = group.element.querySelector('[data-review-star="' + saved.rating + '"]');
        if (star && star.getAttribute('aria-pressed') !== 'true') star.click();
      }
    }
    if (!pendingSelectRestore) restoredGroups.set(group.element, currentScope + '|' + group.key);
  }

  function enumerateGroups(root) {
    const groups = new Map();
    const base = root && root.nodeType === 1 ? root : document;
    const forms = [];
    if (base.matches && base.matches('form')) forms.push(base);
    if (base.querySelectorAll) forms.push.apply(forms, Array.from(base.querySelectorAll('form')));
    forms.forEach(function (form) {
      const key = formKey(form);
      if (key) groups.set(key, { element: form, key: key, isForm: true });
    });

    const roots = [];
    if (base.matches && base.matches(ROOT_SELECTOR)) roots.push(base);
    if (base.querySelectorAll) roots.push.apply(roots, Array.from(base.querySelectorAll(ROOT_SELECTOR)));
    roots.forEach(function (container) {
      if (!container.id) return;
      const key = 'container:' + container.id;
      groups.set(key, { element: container, key: key, isForm: false });
    });
    return Array.from(groups.values());
  }

  function restoreWithin(root, preserveExisting) {
    if (!scopeInitialized) return;
    enumerateGroups(root).forEach(function (group) {
      if (restoredGroups.get(group.element) === currentScope + '|' + group.key && !preserveExisting) return;
      restoreGroup(group, Boolean(preserveExisting));
    });
  }

  function mergeTouchedDrafts(sourceScope, targetScope) {
    const sourceStore = readStore(sourceScope);
    if (sourceStore.claimedBy && sourceStore.claimedBy !== targetScope) return;
    const targetStore = readStore(targetScope);
    let changed = false;
    Object.keys(sourceStore.groups || {}).forEach(function (key) {
      const source = sourceStore.groups[key];
      if (!source || !source.values || !Array.isArray(source.touchedFields) || !source.touchedFields.length) return;
      const target = targetStore.groups[key] || { values: {}, touchedFields: [] };
      const values = Object.assign({}, target.values || {});
      source.touchedFields.forEach(function (fieldKey) {
        if (Object.prototype.hasOwnProperty.call(source.values, fieldKey)) {
          values[fieldKey] = source.values[fieldKey];
          changed = true;
        }
      });
      if (!changed && !source.extraTouched) return;
      const merged = Object.assign({}, target, {
        values: values,
        touchedFields: Array.from(new Set([].concat(target.touchedFields || [], source.touchedFields))),
        updatedAt: Math.max(Number(target.updatedAt) || 0, Number(source.updatedAt) || Date.now())
      });
      if (source.extraTouched) {
        if (Number.isInteger(source.activeStep)) merged.activeStep = source.activeStep;
        if (Number.isInteger(source.rating)) merged.rating = source.rating;
        merged.extraTouched = true;
        changed = true;
      }
      targetStore.groups[key] = merged;
    });
    if (changed) {
      sourceStore.claimedBy = targetScope;
      writeStore(sourceStore, sourceScope);
      writeStore(targetStore, targetScope);
    }
  }

  function flushAllDirty() {
    Array.from(dirtyGroups.values()).forEach(flushGroup);
  }

  function clearVisibleFields() {
    enumerateGroups(document).forEach(function (group) {
      getGroupFields(group).forEach(function (field) {
        if (field.type === 'checkbox' || field.type === 'radio') field.checked = false;
        else field.value = '';
        delete field.dataset.gmDraftTouched;
      });
      restoredGroups.delete(group.element);
    });
  }

  function scopeForSession(session) {
    const userId = session && session.user && session.user.id ? String(session.user.id) : '';
    return userId ? 'user:' + userId : 'guest';
  }

  function saveTouchedGroups() {
    enumerateGroups(document).forEach(function (group) {
      const hasTouchedField = getGroupFields(group).some(function (field) {
        return field.dataset.gmDraftTouched === '1';
      });
      if (hasTouchedField) saveGroup(group);
    });
  }

  function switchScope(session, initial) {
    if (!scopeInitialized) initial = true;
    const nextScope = scopeForSession(session);
    if (scopeInitialized && nextScope === currentScope) return;
    const previousScope = currentScope;
    if (scopeInitialized) flushAllDirty();
    currentScope = nextScope;
    scopeInitialized = true;

    if (!initial && previousScope === 'guest' && nextScope !== 'guest') {
      // Merge only fields the guest actually edited; never overwrite the customer's untouched saved fields.
      mergeTouchedDrafts(previousScope, nextScope);
    } else if (!initial && previousScope !== 'guest' && previousScope !== nextScope) {
      // Do not expose one customer's unsaved entries to another customer on a shared browser.
      clearVisibleFields();
    }
    restoreWithin(document, !initial);
    if (initial) saveTouchedGroups();
  }

  function onFieldEdit(event) {
    const field = event.target;
    if (!isEligibleField(field)) return;
    field.dataset.gmDraftTouched = '1';
    const group = groupForField(field);
    if (group) scheduleSave(group);
  }

  function onClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const star = target.closest('[data-review-star]');
    if (star) {
      const starForm = star.closest('form');
      const starKey = starForm ? formKey(starForm) : '';
      if (starForm && starKey) {
        starForm.dataset.gmDraftExtraTouched = '1';
        scheduleSave({ element: starForm, key: starKey, isForm: true }, 0);
      }
    }

    const form = target.closest('form');
    if (form && form.querySelector('[data-partner-step]')) {
      const group = { element: form, key: formKey(form), isForm: true };
      if (group.key) {
        form.dataset.gmDraftExtraTouched = '1';
        scheduleSave(group, 0);
      }
    }

    const closeControl = target.closest(
      '[data-close],[aria-label*="close" i],.modal-close,.seller-modal-close,.customer-auth-close,.gmca-close'
    );
    const root = target.closest(ROOT_SELECTOR);
    if (root && (closeControl || target === root || /close/i.test(target.id || ''))) {
      enumerateGroups(root).forEach(flushGroup);
    }
  }

  function onKeydown(event) {
    if (event.key !== 'Escape') return;
    const visibleRoots = Array.from(document.querySelectorAll(ROOT_SELECTOR)).filter(function (root) {
      return root.classList.contains('open') || root.getAttribute('aria-hidden') === 'false';
    });
    visibleRoots.forEach(function (root) {
      enumerateGroups(root).forEach(flushGroup);
    });
  }

  function onMutations(records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) {
        if (!(node instanceof Element)) return;
        const form = node.matches('form') ? node : node.closest('form');
        if (form) restoreWithin(form, true);
        restoreWithin(node, false);
      });
    });
  }

  async function initializeScope() {
    try {
      const session = typeof window.GENMERCH_GET_FORM_DRAFT_SESSION === 'function'
        ? await window.GENMERCH_GET_FORM_DRAFT_SESSION()
        : null;
      switchScope(session, true);
    } catch (error) {
      console.warn('GENMERCH could not resolve the customer for form draft separation. Guest drafts remain available.', error);
      switchScope(null, true);
    }
  }

  function install() {
    document.addEventListener('input', onFieldEdit, true);
    document.addEventListener('change', onFieldEdit, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushAllDirty();
      else restoreWithin(document, true);
    });
    window.addEventListener('pagehide', flushAllDirty);
    window.addEventListener('beforeunload', flushAllDirty);
    window.addEventListener('genmerch:customer-auth-changed', function (event) {
      switchScope(event && event.detail ? event.detail : null, false);
    });

    observer = new MutationObserver(onMutations);
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    initializeScope();

    window.GENMERCH_RESTORE_FORM_DRAFT = function (form) {
      if (!form) return;
      restoreWithin(form, false);
    };
    window.GENMERCH_CLEAR_ALL_FORM_DRAFTS = function () {
      try {
        const keys = [];
        for (let index = 0; index < window.localStorage.length; index++) {
          const key = window.localStorage.key(index);
          if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
        }
        keys.forEach(function (key) { window.localStorage.removeItem(key); });
        dirtyGroups.clear();
        saveTimers.forEach(function (timer) { window.clearTimeout(timer); });
        saveTimers.clear();
        return true;
      } catch (error) {
        console.warn('GENMERCH could not clear all saved form drafts.', error);
        return false;
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
