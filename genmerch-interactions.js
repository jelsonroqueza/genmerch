/* GENMERCH subtle storefront interactions: 3D hover and wishlist heart burst. */
(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function resetCardTilt(card) {
    if (!card) return;
    card.classList.remove('gm-card-hover-active');
    card.style.removeProperty('--gm-tilt-x');
    card.style.removeProperty('--gm-tilt-y');
  }

  function launchHeartBurst(button) {
    if (!button || reducedMotion.matches) return;

    const oldBurst = button.querySelector('.gm-heart-burst');
    if (oldBurst) oldBurst.remove();

    const burst = document.createElement('span');
    burst.className = 'gm-heart-burst';
    burst.setAttribute('aria-hidden', 'true');

    const heartColors = ['#ee3049', '#ff6077', '#d71939', '#ff8798', '#f04462', '#c91f3b', '#ff4d68'];
    const heartCount = 7;

    for (let index = 0; index < heartCount; index += 1) {
      const heart = document.createElement('span');
      const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / heartCount);
      const distance = 28 + ((index % 3) * 8);
      const horizontal = Math.round(Math.cos(angle) * distance);
      const vertical = Math.round((Math.sin(angle) * distance) - 24);
      const size = 11 + ((index * 3) % 8);

      heart.className = 'gm-heart-particle';
      heart.textContent = '♥';
      heart.style.setProperty('--gm-heart-x', horizontal + 'px');
      heart.style.setProperty('--gm-heart-y', vertical + 'px');
      heart.style.setProperty('--gm-heart-size', size + 'px');
      heart.style.setProperty('--gm-heart-rotation', ((index % 2 === 0) ? -1 : 1) * (10 + index * 3) + 'deg');
      heart.style.setProperty('--gm-heart-delay', (index * 24) + 'ms');
      heart.style.color = heartColors[index];
      burst.appendChild(heart);
    }

    button.appendChild(burst);
    button.classList.remove('gm-heart-pop');
    void button.offsetWidth;
    button.classList.add('gm-heart-pop');

    window.setTimeout(function () {
      burst.remove();
      button.classList.remove('gm-heart-pop');
    }, 1250);
  }

  function init() {
    const productGrid = document.getElementById('productGrid');
    if (!productGrid) return;

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let activeCard = null;

    if (finePointer.matches && !reducedMotion.matches) {
      productGrid.addEventListener('pointermove', function (event) {
        if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;

        const card = event.target instanceof Element
          ? event.target.closest('.card[data-product-id]')
          : null;

        if (!card || !productGrid.contains(card)) {
          resetCardTilt(activeCard);
          activeCard = null;
          return;
        }

        if (activeCard && activeCard !== card) resetCardTilt(activeCard);
        activeCard = card;

        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const relativeX = (event.clientX - rect.left) / rect.width;
        const relativeY = (event.clientY - rect.top) / rect.height;
        const tiltX = ((0.5 - relativeY) * 5.2).toFixed(2);
        const tiltY = ((relativeX - 0.5) * 5.2).toFixed(2);

        card.classList.add('gm-card-hover-active');
        card.style.setProperty('--gm-tilt-x', tiltX + 'deg');
        card.style.setProperty('--gm-tilt-y', tiltY + 'deg');
      });

      productGrid.addEventListener('pointerleave', function () {
        resetCardTilt(activeCard);
        activeCard = null;
      });
    }

    /* Capture the press before the existing wishlist handler updates aria-pressed. */
    productGrid.addEventListener('click', function (event) {
      const button = event.target instanceof Element
        ? event.target.closest('[data-wishlist-id]')
        : null;

      if (!button || !productGrid.contains(button)) return;

      const isAlreadySaved = button.getAttribute('aria-pressed') === 'true';
      if (!isAlreadySaved) launchHeartBurst(button);
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
