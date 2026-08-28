(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LighthouseScene = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeStage(value) {
    const stage = Number(value);
    return Number.isFinite(stage) ? Math.max(0, Math.min(6, Math.trunc(stage))) : 0;
  }

  function render(root, projection) {
    if (!root) return;
    const stage = normalizeStage(projection?.stage);
    if (root.dataset.stage !== String(stage)) root.dataset.stage = String(stage);
    const windows = Array.from(root.querySelectorAll('.window-light'));
    windows.forEach((windowLight, index) => {
      const lit = stage >= index + 1;
      if (windowLight.dataset.lit !== String(lit)) windowLight.dataset.lit = String(lit);
    });
    const lantern = root.querySelector('.lantern-light');
    const beam = root.querySelector('.beam');
    const final = stage === 6;
    if (lantern && lantern.dataset.lit !== String(final)) lantern.dataset.lit = String(final);
    if (beam && beam.dataset.lit !== String(final)) beam.dataset.lit = String(final);
    const label = final
      ? 'Маяк: світяться всі 5 вікон; ліхтар і промінь світять.'
      : `Маяк: світяться ${stage} з 5 вікон; ліхтар ще не світить.`;
    if (root.getAttribute('aria-label') !== label) root.setAttribute('aria-label', label);
  }

  return { normalizeStage, render };
});