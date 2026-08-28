(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LighthouseGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COUNTS = [3, 2, 3, 7, 2, 6];
  const SYSTEMS = ['harborPath', 'workshopGears', 'fractionBridge', 'lightReservoir', 'geometryGarden', 'controlConsole'];
  const LESSONS = { 4: 'gcd-lcm', 7: 'mixed-fraction', 10: 'decimal-columns', 16: 'equation-balance' };
  const LESSON_ANSWERS = {
    'gcd-lcm': { sharedFactor: '2·3', missingFactor: '3' },
    'mixed-fraction': { recall: 'усі d частин = 1' },
    'decimal-columns': { recall: 'кома під комою' },
    'equation-balance': { recall: 'обидві частини' }
  };
  let nextRunToken = 0;

  function emptyRestoration() {
    return Object.fromEntries(SYSTEMS.map((name) => [name, 0]));
  }

  function emptyAttempt() {
    return {
      validWrongChecks: 0,
      invalidChecks: 0,
      hintsSeen: [false, false, false],
      autoSupportsSeen: [false, false, false],
      supportLevel: 0,
      completion: null,
      responseSnapshot: null
    };
  }

  function createState(seed) {
    return {
      seed: Number(seed) >>> 0,
      runToken: ++nextRunToken,
      challengeToken: 0,
      phase: 'intro',
      stationIndex: 0,
      challengeIndex: 0,
      currentChallengeId: null,
      restoration: emptyRestoration(),
      attemptsById: {},
      lessonProgress: {},
      practiceReplay: { active: false, sourceStation: null, returnPhase: null, returnChallengeIndex: null, returnChallengeId: null, attemptsById: {}, lessonProgress: {} },
      pacing: { mode: 'withoutRush', activeSince: null, elapsedMs: 0, pausedReasons: [], fired: [false, false, false] },
      finale: { lampLit: false, beamSwept: false },
      fatalReason: null
    };
  }

  function sameToken(state, event) {
    return (event.runToken === undefined || event.runToken === state.runToken) &&
      (event.challengeToken === undefined || event.challengeToken === state.challengeToken);
  }

  function lessonFor(index) {
    return LESSONS[index] || null;
  }

  function stationFor(index) {
    let total = 0;
    for (let station = 0; station < COUNTS.length; station += 1) {
      total += COUNTS[station];
      if (index < total) return station;
    }
    return 5;
  }

  function lessonTemplate(id) {
    return {
      opened: true,
      response: null,
      wrongChecks: 0,
      retrievalActionsCompleted: [],
      requiredRetrievalActions: id === 'gcd-lcm' ? ['sharedFactor', 'missingFactor'] : ['recall'],
      complete: false,
      skipRecallForRun: false
    };
  }

  function enterChallenge(state, challengeIndex, challengeId = null) {
    if (!Number.isInteger(challengeIndex) || challengeIndex < 0 || challengeIndex > 22) return state;
    const id = lessonFor(challengeIndex);
    const lessonProgress = { ...state.lessonProgress };
    let phase = 'challengeReady';
    if (id) {
      lessonProgress[id] = lessonProgress[id] || lessonTemplate(id);
      if (!lessonProgress[id].complete || !lessonProgress[id].skipRecallForRun) phase = 'microLesson';
    }
    return {
      ...state,
      phase,
      challengeIndex,
      currentChallengeId: challengeId,
      stationIndex: stationFor(challengeIndex),
      challengeToken: state.challengeToken + 1,
      lessonProgress,
      pacing: { ...state.pacing, activeSince: null, elapsedMs: 0, pausedReasons: [], fired: [false, false, false] }
    };
  }

  function withAttempt(state, id, update) {
    if (state.practiceReplay.active) {
      const current = state.practiceReplay.attemptsById[id] || emptyAttempt();
      return { ...state, practiceReplay: { ...state.practiceReplay, attemptsById: { ...state.practiceReplay.attemptsById, [id]: update(current) } } };
    }
    const current = state.attemptsById[id] || emptyAttempt();
    return { ...state, attemptsById: { ...state.attemptsById, [id]: update(current) } };
  }

  function completeChallenge(state, event, completion) {
    const id = event.id || `challenge-${state.challengeIndex}`;
    if (!['challengeReady', 'feedbackWrong', 'feedbackInvalid'].includes(state.phase) || id !== state.currentChallengeId) return state;
    const current = state.attemptsById[id] || emptyAttempt();
    if (state.practiceReplay.active) {
      const practiceAttempt = state.practiceReplay.attemptsById[id] || emptyAttempt();
      if (practiceAttempt.completion) return state;
      return { ...state, phase: 'challengeComplete', practiceReplay: { ...state.practiceReplay, attemptsById: { ...state.practiceReplay.attemptsById, [id]: { ...practiceAttempt, completion } } } };
    }
    if (current.completion) return state;
    const station = stationFor(state.challengeIndex);
    const system = SYSTEMS[station];
    const restored = Math.min(COUNTS[station], state.restoration[system] + 1);
    return {
      ...withAttempt(state, id, (attempt) => ({ ...attempt, completion })),
      phase: 'challengeComplete',
      restoration: { ...state.restoration, [system]: restored },
      pacing: { ...state.pacing, activeSince: null }
    };
  }

  function updateLesson(state, event, correct) {
    const id = lessonFor(state.challengeIndex);
    if (!id) return state;
    const current = state.lessonProgress[id] || lessonTemplate(id);
    const response = { action: event.action || null, choice: String(event.choice ?? ''), correct };
    if (!correct) {
      return { ...state, lessonProgress: { ...state.lessonProgress, [id]: { ...current, response, wrongChecks: current.wrongChecks + 1 } } };
    }
    const required = current.requiredRetrievalActions;
    if (!required.includes(event.action) || current.retrievalActionsCompleted.includes(event.action)) return state;
    const actions = [...current.retrievalActionsCompleted, event.action];
    return { ...state, lessonProgress: { ...state.lessonProgress, [id]: { ...current, response, retrievalActionsCompleted: actions, complete: required.every((action) => actions.includes(action)) } } };
  }

  function reduce(state, event) {
    if (!state || !event || typeof event.type !== 'string') return state;
    if (!sameToken(state, event)) return state;
    if (event.type === 'START') return { ...state, phase: 'stationBrief' };
    if (event.type === 'CHECK_LESSON_RESPONSE') {
      const id = lessonFor(state.challengeIndex);
      const expected = id && LESSON_ANSWERS[id]?.[event.action];
      return updateLesson(state, event, expected !== undefined && String(event.choice) === expected);
    }
    if (event.type === 'CHECK_LESSON_WRONG') return updateLesson(state, event, false);
    if (event.type === 'CHECK_LESSON_CORRECT') return updateLesson(state, event, true);
    if (event.type === 'SET_SKIP_RECALL') {
      const id = lessonFor(state.challengeIndex);
      const current = id && state.lessonProgress[id];
      if (!current?.complete) return state;
      return { ...state, lessonProgress: { ...state.lessonProgress, [id]: { ...current, skipRecallForRun: Boolean(event.value) } } };
    }
    if (event.type === 'CLOSE_LESSON') {
      const id = lessonFor(state.challengeIndex);
      return id && state.lessonProgress[id]?.complete ? { ...state, phase: 'challengeReady' } : state;
    }
    const challengeEventAllowed = event.id === state.currentChallengeId && ['challengeReady', 'feedbackWrong', 'feedbackInvalid'].includes(state.phase);
    if (event.type === 'SET_RESPONSE') return challengeEventAllowed ? withAttempt(state, event.id, (attempt) => ({ ...attempt, responseSnapshot: event.response })) : state;
    if (event.type === 'CHECK_INVALID') return challengeEventAllowed ? { ...withAttempt(state, event.id, (attempt) => ({ ...attempt, invalidChecks: attempt.invalidChecks + 1 })), phase: 'feedbackInvalid' } : state;
    if (event.type === 'CHECK_WRONG') return challengeEventAllowed ? { ...withAttempt(state, event.id, (attempt) => ({ ...attempt, validWrongChecks: attempt.validWrongChecks + 1 })), phase: 'feedbackWrong' } : state;
    if (event.type === 'REQUEST_HINT' || event.type === 'AUTO_SUPPORT_DUE') {
      if (!challengeEventAllowed) return state;
      const automatic = event.type === 'AUTO_SUPPORT_DUE';
      const nextState = withAttempt(state, event.id, (attempt) => {
        const hints = [...attempt.hintsSeen];
        const autos = [...attempt.autoSupportsSeen];
        const requested = Number.isInteger(event.level) ? event.level - 1 : hints.findIndex((seen) => !seen);
        if (requested < 0 || requested > 2 || hints[requested]) return attempt;
        hints[requested] = true;
        if (automatic) autos[requested] = true;
        return { ...attempt, hintsSeen: hints, autoSupportsSeen: autos, supportLevel: Math.max(attempt.supportLevel, requested + 1) };
      });
      if (!automatic) {
        if (state.challengeIndex !== 4 || !Number.isInteger(event.level) || event.level < 1 || event.level > 3) return nextState;
        const fired = [...state.pacing.fired]; fired[event.level - 1] = true;
        return { ...nextState, pacing: { ...state.pacing, fired } };
      }
      if (!Number.isInteger(event.level) || event.level < 1 || event.level > 3) return nextState;
      const fired = [...state.pacing.fired]; fired[event.level - 1] = true;
      return { ...nextState, pacing: { ...state.pacing, fired } };
    }
    if (event.type === 'CHECK_CORRECT') {
      const current = state.attemptsById[event.id] || emptyAttempt();
      return completeChallenge(state, event, current.supportLevel ? 'supported' : 'independent');
    }
    if (event.type === 'REVEAL_SOLUTION') {
      const current = state.attemptsById[event.id] || emptyAttempt();
      if (current.validWrongChecks < 3 && !current.hintsSeen.every(Boolean)) return state;
      return completeChallenge(state, event, 'solution');
    }
    if (event.type === 'NEXT') {
      if (state.phase !== 'challengeComplete') return state;
      if (state.challengeIndex === 22) return { ...state, phase: 'finaleReady' };
      if (state.practiceReplay.active) {
        const end = COUNTS.slice(0, state.practiceReplay.sourceStation + 1).reduce((sum, count) => sum + count, 0) - 1;
        if (state.challengeIndex >= end) return reduce(state, { type: 'END_PRACTICE_REPLAY' });
      }
      return enterChallenge(state, state.challengeIndex + 1, event.nextId || null);
    }
    if (event.type === 'START_PRACTICE_REPLAY') {
      const station = Number(event.station);
      if (!Number.isInteger(station) || station < 0 || station > 5 || state.practiceReplay.active || ['finaleReady', 'finalePlaying', 'report', 'fatal'].includes(state.phase)) return state;
      const system = SYSTEMS[station];
      const currentSystem = SYSTEMS[state.stationIndex];
      if (state.restoration[system] !== COUNTS[station] || state.restoration[currentSystem] !== COUNTS[state.stationIndex] || state.pacing.activeSince !== null) return state;
      const start = COUNTS.slice(0, station).reduce((sum, count) => sum + count, 0);
      return { ...state, phase: 'challengeReady', stationIndex: station, challengeIndex: start, currentChallengeId: event.id || null, challengeToken: state.challengeToken + 1, practiceReplay: { active: true, sourceStation: station, returnPhase: state.phase, returnChallengeIndex: state.challengeIndex, returnChallengeId: state.currentChallengeId, attemptsById: {}, lessonProgress: {} } };
    }
    if (event.type === 'END_PRACTICE_REPLAY') {
      if (!state.practiceReplay.active) return state;
      return { ...state, phase: state.practiceReplay.returnPhase, challengeIndex: state.practiceReplay.returnChallengeIndex, currentChallengeId: state.practiceReplay.returnChallengeId, stationIndex: stationFor(state.practiceReplay.returnChallengeIndex), challengeToken: state.challengeToken + 1, practiceReplay: { active: false, sourceStation: null, returnPhase: null, returnChallengeIndex: null, returnChallengeId: null, attemptsById: {}, lessonProgress: {} } };
    }
    if (event.type === 'FINALE_PLAY') {
      if (!isFullyRestored(state)) return state;
      return { ...state, phase: 'finalePlaying', finale: { lampLit: true, beamSwept: false } };
    }
    if (event.type === 'FINALE_COMPLETE') {
      if (state.phase !== 'finalePlaying') return state;
      return { ...state, phase: 'report', finale: { lampLit: true, beamSwept: true } };
    }
    if (event.type === 'SET_PACING_MODE') {
      return { ...state, pacing: { ...state.pacing, mode: event.mode === 'iskraAssist' ? 'iskraAssist' : 'withoutRush', activeSince: null, elapsedMs: 0 } };
    }
    if (event.type === 'PACING_READY') {
      if (state.challengeIndex !== 4 || state.pacing.mode !== 'iskraAssist') return state;
      return { ...state, pacing: { ...state.pacing, activeSince: event.now, elapsedMs: 0 } };
    }
    if (event.type === 'VISIBILITY_PAUSE' || event.type === 'OPEN_BLOCKING') {
      const reason = event.type === 'VISIBILITY_PAUSE' ? 'hidden' : 'blocking';
      if (state.pacing.pausedReasons.includes(reason)) return state;
      const elapsed = state.pacing.activeSince === null ? state.pacing.elapsedMs : state.pacing.elapsedMs + Math.max(0, event.now - state.pacing.activeSince);
      return { ...state, pacing: { ...state.pacing, activeSince: null, elapsedMs: elapsed, pausedReasons: [...state.pacing.pausedReasons, reason] } };
    }
    if (event.type === 'VISIBILITY_RESUME' || event.type === 'CLOSE_BLOCKING') {
      const reason = event.type === 'VISIBILITY_RESUME' ? 'hidden' : 'blocking';
      const pausedReasons = state.pacing.pausedReasons.filter((item) => item !== reason);
      return { ...state, pacing: { ...state.pacing, pausedReasons, activeSince: pausedReasons.length || state.pacing.mode !== 'iskraAssist' ? null : event.now } };
    }
    if (event.type === 'FATAL') return { ...state, phase: 'fatal', fatalReason: String(event.code || 'unknown').slice(0, 40), pacing: { ...state.pacing, activeSince: null } };
    if (event.type === 'RESTART_SAME_SEED') return createState(state.seed);
    if (event.type === 'RESTART_NEW_SEED') return createState(event.seed);
    return state;
  }

  function dueSupport(state, now, id = 'gcd-lcm') {
    if (state.challengeIndex !== 4 || state.pacing.mode !== 'iskraAssist' || state.pacing.activeSince === null || state.pacing.pausedReasons.length) return [];
    const elapsed = state.pacing.elapsedMs + Math.max(0, now - state.pacing.activeSince);
    const attempt = state.attemptsById[id] || emptyAttempt();
    return [90000, 180000, 300000].flatMap((threshold, index) => elapsed >= threshold && !state.pacing.fired[index] && !attempt.hintsSeen[index] ? [index + 1] : []);
  }

  function isFullyRestored(state) {
    return SYSTEMS.every((system, index) => state.restoration[system] === COUNTS[index]);
  }

  function selectWorld(state) {
    return Object.freeze({
      phase: state.phase,
      stationIndex: state.stationIndex,
      challengeIndex: state.challengeIndex,
      restoration: Object.freeze({ ...state.restoration }),
      finale: Object.freeze({ ...state.finale })
    });
  }

  function report(state) {
    const result = { independent: [], supported: [], solution: [], supportLevels: [0, 0, 0] };
    Object.entries(state.attemptsById).forEach(([id, attempt]) => {
      if (attempt.completion) result[attempt.completion].push(id);
      attempt.hintsSeen.forEach((seen, index) => { if (seen) result.supportLevels[index] += 1; });
    });
    return result;
  }

  function dialogue(key, context = {}) {
    const station = context.station || 'ця станція';
    const system = context.system || 'система маяка';
    const lines = {
      'station.enter': `Буря пошкодила ${system}. На станції «${station}» почнемо відновлення.`,
      'lesson.ready': `Перед ремонтом станції «${station}» пригадай потрібний метод — тоді ${system} запрацює надійно.`,
      'response.invalid': `Потрібні всі частини відповіді, щоб ${system} міг відреагувати.`,
      'response.wrong': `Механізм «${system}» показує розбіжність. Перевір саме позначений зв’язок.`,
      'hint.1': `Згадай головне поняття для станції «${station}».`,
      'hint.2': `Обери наступну математичну дію — ${system} уже готовий до неї.`,
      'hint.3': `Іскра підсвітила один наступний крок, але відповідь залишається за тобою.`,
      'support.auto.1': `Іскра м’яко нагадує поняття: ${system} чекає на перший простий множник.`,
      'support.auto.2': `Іскра підсвічує метод: добудуй спільні й відсутні копії для ${system}.`,
      'support.auto.3': `Іскра позначила одну придатну плитку; решту конструкції ${system} заверши самостійно.`,
      'challenge.correct.independent': `Самостійний крок спрацював: ${system} оживає.`,
      'challenge.correct.supported': `Крок із підтримкою правильний: ${system} відновлюється.`,
      'station.complete': `Станцію «${station}» відновлено; шлях до наступної системи відкритий.`,
      'finale.ready': 'Усі шість систем синхронізовані. Можна запалювати лампу.',
      'finale.complete': 'Маяк запалено — промінь освітлює шлях.'
    };
    return lines[key] || '';
  }

  return { COUNTS, SYSTEMS, createState, emptyAttempt, enterChallenge, reduce, dueSupport, isFullyRestored, selectWorld, report, dialogue };
});
