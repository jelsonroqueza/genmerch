(function () {
  'use strict';

  if (window.__GENMERCH_CHECKOUT_PREMIUM_READY__) return;
  window.__GENMERCH_CHECKOUT_PREMIUM_READY__ = true;

  const $ = (id) => document.getElementById(id);
  const addressFields = $('checkoutAddressFields');
  const addressPreview = $('checkoutAddressPreview');
  const addressEditButton = $('checkoutAddressEditButton');
  const deliveryStep = $('checkoutStepDelivery');

  const addressFieldIds = [
    'firstName', 'lastName', 'custPhone', 'streetAddress',
    'province', 'city', 'barangay', 'postalCode',
    'landmark', 'specialInstructions'
  ];

  const read = (id) => String($(id)?.value || '').trim();

  function addressIsComplete() {
    return addressFieldIds.every((id) => Boolean(read(id))) &&
      /^[0][9]\d{9}$/.test(read('custPhone')) &&
      /^\d{4}$/.test(read('postalCode')) &&
      read('firstName').length >= 2 &&
      read('lastName').length >= 2;
  }

  function setPreviewText(id, value) {
    const node = $(id);
    if (node) node.textContent = value || '';
  }

  function renderAddressPreview() {
    if (!addressFields || !addressPreview || !addressEditButton) return;

    const complete = addressIsComplete();
    const name = [read('firstName'), read('lastName')].filter(Boolean).join(' ');
    const locality = [read('barangay'), read('city'), read('province')]
      .filter(Boolean).join(', ');
    const postal = read('postalCode');
    const landmark = read('landmark');
    const instructions = read('specialInstructions');

    setPreviewText('checkoutAddressPreviewName', name);
    setPreviewText('checkoutAddressPreviewPhone', read('custPhone'));
    setPreviewText('checkoutAddressPreviewStreet', read('streetAddress'));
    setPreviewText('checkoutAddressPreviewLocality', [locality, postal].filter(Boolean).join(' '));
    setPreviewText('checkoutAddressPreviewLandmark', landmark ? 'Landmark: ' + landmark : '');
    setPreviewText(
      'checkoutAddressPreviewInstructions',
      instructions && !/^n\/?a$/i.test(instructions) ? 'Delivery instructions: ' + instructions : ''
    );

    addressPreview.hidden = !complete;
    addressEditButton.hidden = !complete;

    if (!complete) {
      addressFields.hidden = false;
      addressEditButton.setAttribute('aria-expanded', 'true');
      return;
    }

    addressEditButton.textContent = addressFields.hidden ? '✎ Edit' : 'Done';
    addressEditButton.setAttribute('aria-expanded', String(!addressFields.hidden));
  }

  function prepareAddressForStepEntry() {
    if (!deliveryStep || deliveryStep.hidden || !addressFields) return;
    addressFields.hidden = addressIsComplete();
    renderAddressPreview();
  }

  if (addressEditButton && addressFields) {
    addressEditButton.addEventListener('click', () => {
      if (!addressIsComplete()) {
        addressFields.hidden = false;
        renderAddressPreview();
        return;
      }

      addressFields.hidden = !addressFields.hidden;
      renderAddressPreview();

      if (!addressFields.hidden) {
        const firstField = $('firstName');
        if (firstField) {
          firstField.focus({ preventScroll: true });
          firstField.scrollIntoView({
            block: 'center',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
          });
        }
      }
    });
  }

  addressFieldIds.forEach((id) => {
    const field = $(id);
    if (!field) return;
    field.addEventListener('input', renderAddressPreview);
    field.addEventListener('change', renderAddressPreview);
  });

  if (deliveryStep && window.MutationObserver) {
    new MutationObserver(() => {
      if (!deliveryStep.hidden) prepareAddressForStepEntry();
    }).observe(deliveryStep, { attributes: true, attributeFilter: ['hidden'] });
  }

  const sourceFee = $('shippingText');
  const sourceEstimate = $('shippingEstimate');
  const sourceDisclosure = $('shippingDisclosure');
  const targetFee = $('checkoutDeliveryMethodFee');
  const targetDetails = $('checkoutDeliveryMethodDetails');
  const targetFootnote = $('checkoutDeliveryMethodFootnote');

  function mirrorExistingShippingEstimate() {
    if (!sourceFee || !sourceEstimate) return;

    const feeText = String(sourceFee.textContent || '').trim();
    const estimateText = String(sourceEstimate.textContent || '').trim();
    const pending = !feeText ||
      /awaiting address|enter address|complete address/i.test(feeText) ||
      /choose a city|enter your city|select your province/i.test(estimateText);

    if (targetFee) targetFee.textContent = pending ? 'Awaiting address' : feeText;
    if (targetDetails) {
      targetDetails.textContent = pending
        ? 'Enter your city or municipality and province to display the applicable standard base-rate estimate.'
        : estimateText;
    }
    if (targetFootnote && sourceDisclosure) {
      targetFootnote.textContent = sourceDisclosure.textContent.trim();
    }
  }

  if (window.MutationObserver) {
    const shippingObserver = new MutationObserver(mirrorExistingShippingEstimate);
    [sourceFee, sourceEstimate, sourceDisclosure].forEach((node) => {
      if (node) shippingObserver.observe(node, { childList: true, subtree: true, characterData: true });
    });
  }

  mirrorExistingShippingEstimate();
  renderAddressPreview();
  if (deliveryStep && !deliveryStep.hidden) prepareAddressForStepEntry();
})();
