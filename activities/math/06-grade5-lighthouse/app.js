(() => {
  'use strict';

  const math = window.LighthouseMath;
  const game = window.LighthouseGame;
  const scene = window.LighthouseScene;
  const elements = Object.fromEntries([
    'lighthouse-scene', 'activity-context', 'game', 'progress-label', 'question-title', 'answer-area',
    'check-button', 'hint-button', 'next-button', 'hint', 'feedback', 'finale',
    'finale-title', 'new-game-button', 'failure', 'failure-title', 'retry-button'
  ].map((id) => [id, document.getElementById(id)]));

  let generated;
  let state;

  function randomSeed() {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0];
  }

  function currentItem() {
    return generated.items[state.index];
  }

  function makeFraction(token) {
    const fraction = document.createElement('span');
    fraction.className = 'stacked-fraction';
    fraction.setAttribute('aria-label', `${token.numerator} із ${token.denominator} рівних частин`);
    const numerator = document.createElement('span');
    numerator.textContent = token.numerator;
    const bar = document.createElement('span');
    bar.className = 'fraction-bar';
    bar.setAttribute('aria-hidden', 'true');
    const denominator = document.createElement('span');
    denominator.textContent = token.denominator;
    fraction.append(numerator, bar, denominator);
    return fraction;
  }

  function renderPrompt(item) {
    elements['question-title'].replaceChildren();
    if (item.promptParts) {
      item.promptParts.forEach((part) => {
        elements['question-title'].append(typeof part === 'string' ? document.createTextNode(part) : makeFraction(part));
      });
    } else {
      elements['question-title'].textContent = item.prompt;
    }
  }

  function makeField(id, labelText, inputMode) {
    const label = document.createElement('label');
    label.className = 'field';
    label.htmlFor = id;
    const text = document.createElement('span');
    text.textContent = labelText;
    const input = document.createElement('input');
    input.id = id;
    input.name = id;
    input.type = 'text';
    input.inputMode = inputMode;
    input.autocomplete = 'off';
    input.spellcheck = false;
    label.append(text, input);
    return label;
  }

  function renderAnswer(item) {
    const area = elements['answer-area'];
    area.replaceChildren();
    if (item.type === 'set') {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = 'Варіанти відповіді';
      const choices = document.createElement('div');
      choices.className = 'choice-grid';
      item.options.forEach((option) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = 'answer';
        input.value = option;
        label.append(input, document.createTextNode(String(option)));
        choices.append(label);
      });
      fieldset.append(legend, choices);
      area.append(fieldset);
      return;
    }
    if (item.type === 'rectangle') {
      area.append(
        makeField('perimeter', 'Периметр, см', 'numeric'),
        makeField('area', 'Площа, см²', 'numeric')
      );
      return;
    }
    area.append(makeField('answer', 'Відповідь', item.type === 'decimal' ? 'decimal' : 'numeric'));
  }

  function collectResponse(item) {
    if (item.type === 'set') {
      return Array.from(elements['answer-area'].querySelectorAll('input:checked'), (input) => input.value);
    }
    if (item.type === 'rectangle') {
      return {
        perimeter: elements['answer-area'].querySelector('#perimeter').value,
        area: elements['answer-area'].querySelector('#area').value
      };
    }
    return elements['answer-area'].querySelector('#answer').value;
  }

  function focusAnswer(field) {
    const target = field ? elements['answer-area'].querySelector(`#${field}`) : null;
    (target || elements['answer-area'].querySelector('input'))?.focus();
  }

  function lockAnswer(locked) {
    elements['answer-area'].querySelectorAll('input').forEach((input) => { input.disabled = locked; });
  }

  function clearSupport() {
    elements.hint.hidden = true;
    elements.hint.textContent = '';
    elements.feedback.hidden = true;
    elements.feedback.textContent = '';
    elements.feedback.classList.remove('correct');
  }

  function renderQuestion({ focusHeading = false } = {}) {
    const item = currentItem();
    if (!item) throw new Error('missing generated item');
    elements['activity-context'].hidden = false;
    elements.game.hidden = false;
    elements.finale.hidden = true;
    elements.failure.hidden = true;
    elements['progress-label'].textContent = `Завдання ${state.index + 1} з 6`;
    renderPrompt(item);
    renderAnswer(item);
    clearSupport();
    elements['check-button'].hidden = false;
    elements['check-button'].disabled = false;
    elements['hint-button'].hidden = false;
    elements['hint-button'].disabled = false;
    elements['next-button'].hidden = true;
    scene.render(elements['lighthouse-scene'], game.selectScene(state));
    if (focusHeading) elements['question-title'].focus();
  }

  function showFailure() {
    state = game.reduce(state || game.createState(0), { type: 'FAIL' });
    elements['activity-context'].hidden = true;
    elements.game.hidden = true;
    elements.finale.hidden = true;
    elements.failure.hidden = false;
    scene.render(elements['lighthouse-scene'], game.selectScene(state));
    elements['failure-title'].focus();
  }

  function start(seed = randomSeed()) {
    try {
      generated = math.generateItems(seed);
      if (!generated || generated.items.length !== game.TOTAL) throw new Error('invalid generated game');
      state = game.createState(generated.seed);
      renderQuestion();
    } catch (_error) {
      showFailure();
    }
  }

  elements['hint-button'].addEventListener('click', () => {
    const nextState = game.reduce(state, { type: 'HINT' });
    if (nextState === state) return;
    state = nextState;
    elements.hint.textContent = currentItem().hint;
    elements.hint.hidden = false;
    elements['hint-button'].disabled = true;
  });

  elements['check-button'].addEventListener('click', () => {
    const item = currentItem();
    const result = math.inspectResponse(item, collectResponse(item));
    if (result.kind !== 'correct') {
      state = game.reduce(state, { type: 'CHECK_INCORRECT' });
      elements.feedback.classList.remove('correct');
      elements.feedback.textContent = result.kind === 'empty'
        ? 'Спочатку введи або обери відповідь.'
        : result.kind === 'invalid'
          ? 'Введи відповідь у правильному форматі.'
          : item.diagnostic;
      elements.feedback.hidden = false;
      focusAnswer(result.field);
      return;
    }

    state = game.reduce(state, { type: 'CHECK_CORRECT' });
    lockAnswer(true);
    elements['check-button'].hidden = true;
    elements['hint-button'].hidden = true;
    elements.feedback.textContent = 'Правильно! Маяк став світлішим.';
    elements.feedback.classList.add('correct');
    elements.feedback.hidden = false;
    scene.render(elements['lighthouse-scene'], game.selectScene(state));
    if (state.phase === 'finale') {
      elements['activity-context'].hidden = true;
      elements.game.hidden = true;
      elements.finale.hidden = false;
      elements['finale-title'].focus();
    } else {
      elements['next-button'].hidden = false;
      elements.feedback.focus();
    }
  });

  elements['next-button'].addEventListener('click', () => {
    const nextState = game.reduce(state, { type: 'NEXT' });
    if (nextState === state) return;
    state = nextState;
    try {
      renderQuestion({ focusHeading: true });
    } catch (_error) {
      showFailure();
    }
  });

  elements['new-game-button'].addEventListener('click', () => start());
  elements['retry-button'].addEventListener('click', () => start());

  if (new URLSearchParams(window.location.search).has('test')) {
    window.__LIGHTHOUSE_TEST__ = Object.freeze({
      renderStage(stage) { scene.render(elements['lighthouse-scene'], { stage }); },
      fail() { showFailure(); }
    });
  }

  start();
})();