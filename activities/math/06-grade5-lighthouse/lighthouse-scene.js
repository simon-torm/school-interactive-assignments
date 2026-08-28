(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LighthouseScene = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TRANSITION_MS = 540;
  const controllers = new WeakMap();

  function normalizeStage(value) {
    const stage = Number(value);
    return Number.isFinite(stage) ? Math.max(0, Math.min(6, Math.trunc(stage))) : 0;
  }

  function stagePath(value) {
    return `lighthouse-${normalizeStage(value)}.webp`;
  }

  function stageLabel(value) {
    const stage = normalizeStage(value);
    if (stage === 0) return 'Маяк, стан 0 із 6: усі вікна й ліхтар вимкнені.';
    if (stage === 6) return 'Маяк, стан 6 із 6: світяться всі 5 вікон і ліхтар.';
    return `Маяк, стан ${stage} із 6: світяться ${stage} із 5 вікон; ліхтар вимкнений.`;
  }

  function browserPreload(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = reject;
      image.src = source;
    });
  }

  function createController(root, options = {}) {
    if (!root) throw new TypeError('scene root is required');
    const current = root.querySelector('.scene-image-current');
    const next = root.querySelector('.scene-image-next');
    if (!current || !next) throw new Error('scene requires current and next image layers');

    const reducedMotion = options.reducedMotion || (() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const preload = options.preload || browserPreload;
    const schedule = options.schedule || ((callback) => window.setTimeout(callback, TRANSITION_MS));
    const cancel = options.cancel || ((id) => window.clearTimeout(id));
    let currentStage = 0;
    let desiredStage = 0;
    let transitionStage = null;
    let promotionId = null;
    let generation = 0;

    function describe(stage) {
      root.dataset.stage = String(stage);
      const label = stageLabel(stage);
      if (root.getAttribute('aria-label') !== label) root.setAttribute('aria-label', label);
    }

    function preloadFollowing(stage) {
      if (stage < 6) preload(stagePath(stage + 1)).catch(() => {});
    }

    function switchImmediately(stage) {
      generation += 1;
      if (promotionId !== null) cancel(promotionId);
      promotionId = null;
      transitionStage = null;
      currentStage = stage;
      desiredStage = stage;
      current.src = stagePath(stage);
      next.src = stagePath(stage);
      next.classList.remove('is-visible');
      root.dataset.transitioning = 'false';
      describe(stage);
      preloadFollowing(stage);
    }

    function startTransition() {
      if (transitionStage !== null || desiredStage === currentStage) {
        if (desiredStage === currentStage) preloadFollowing(currentStage);
        return;
      }
      if (reducedMotion()) {
        switchImmediately(desiredStage);
        return;
      }

      const target = desiredStage;
      const token = ++generation;
      transitionStage = target;
      preload(stagePath(target)).then(() => {
        if (token !== generation) return;
        if (target !== desiredStage) {
          transitionStage = null;
          startTransition();
          return;
        }
        next.src = stagePath(target);
        next.classList.add('is-visible');
        root.dataset.transitioning = 'true';
        promotionId = schedule(() => {
          if (token !== generation) return;
          current.src = next.src;
          next.classList.remove('is-visible');
          root.dataset.transitioning = 'false';
          currentStage = target;
          transitionStage = null;
          promotionId = null;
          preloadFollowing(currentStage);
          startTransition();
        });
      }).catch(() => {
        if (token !== generation) return;
        transitionStage = null;
      });
    }

    function render(projection) {
      const stage = normalizeStage(projection?.stage);
      describe(stage);
      if (stage === 0 || stage < currentStage || reducedMotion()) {
        switchImmediately(stage);
        return;
      }
      desiredStage = stage;
      startTransition();
    }

    return Object.freeze({ render });
  }

  function render(root, projection) {
    if (!root) return;
    let controller = controllers.get(root);
    if (!controller) {
      controller = createController(root);
      controllers.set(root, controller);
    }
    controller.render(projection);
  }

  return { normalizeStage, stagePath, stageLabel, createController, render };
});