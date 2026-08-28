(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LighthouseGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TOTAL = 6;

  function createState(seed) {
    return Object.freeze({
      seed: Number(seed) >>> 0,
      index: 0,
      stage: 0,
      phase: 'ready',
      hintShown: false
    });
  }

  function reduce(state, event) {
    if (!state || !event || typeof event.type !== 'string') return state;
    if (event.type === 'RESET') return createState(event.seed);
    if (event.type === 'FAIL') return Object.freeze({ ...createState(state.seed), phase: 'failure' });
    if (state.phase === 'failure' || state.phase === 'finale') return state;

    if (event.type === 'HINT') {
      if (!['ready', 'incorrect'].includes(state.phase) || state.hintShown) return state;
      return Object.freeze({ ...state, hintShown: true });
    }
    if (event.type === 'CHECK_INCORRECT') {
      if (!['ready', 'incorrect'].includes(state.phase)) return state;
      return Object.freeze({ ...state, phase: 'incorrect' });
    }
    if (event.type === 'CHECK_CORRECT') {
      if (!['ready', 'incorrect'].includes(state.phase)) return state;
      const stage = Math.min(TOTAL, state.stage + 1);
      return Object.freeze({
        ...state,
        stage,
        phase: state.index === TOTAL - 1 ? 'finale' : 'correct'
      });
    }
    if (event.type === 'NEXT') {
      if (state.phase !== 'correct' || state.index >= TOTAL - 1) return state;
      return Object.freeze({ ...state, index: state.index + 1, phase: 'ready', hintShown: false });
    }
    return state;
  }

  function selectScene(state) {
    return Object.freeze({ stage: Math.max(0, Math.min(TOTAL, Number(state?.stage) || 0)) });
  }

  return { TOTAL, createState, reduce, selectScene };
});