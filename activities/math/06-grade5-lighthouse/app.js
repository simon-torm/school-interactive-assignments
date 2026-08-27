(() => {
  'use strict';

  const math = window.LighthouseMath;
  const stations = [
    { title: 'Числова гавань', intro: 'Відновімо лінзу натуральних чисел.', start: 0, end: 3 },
    { title: 'Кузня подільності', intro: 'Перевіримо ознаки подільності, НСД і НСК.', start: 3, end: 5 },
    { title: 'Міст дробів', intro: 'З’єднаємо частини в ціле.', start: 5, end: 8 },
    { title: 'Десяткове озеро', intro: 'Тримай коми на своїх місцях.', start: 8, end: 15 },
    { title: 'Геометричний сад', intro: 'Виміряй простір і розплутай історію.', start: 15, end: 17 },
    { title: 'Контрольна кімната', intro: 'Шість коротких перевірок запалять маяк.', start: 17, end: 23 }
  ];
  const strandNames = {
    natural: 'Натуральні числа', divisibility: 'Подільність', fractions: 'Звичайні дроби',
    decimals: 'Десяткові дроби', geometry: 'Геометрія', equations: 'Рівняння й текстові задачі'
  };
  const practice = {
    natural: 'Повтори порядок дій і ділення з остачею.', divisibility: 'Потренуй ознаки подільності, НСД і НСК.',
    fractions: 'Попрацюй із дробами з однаковими знаменниками.', decimals: 'Повтори точні дії з десятковими дробами.',
    geometry: 'Зістав формули периметра та площі.', equations: 'Перекладай коротку історію мовою рівнянь.'
  };

  const elements = Object.fromEntries([
    'station-list', 'seed-value', 'progress-label', 'progress-bar', 'guide-text', 'prompt-card', 'scene-kicker',
    'scene-title', 'question', 'answer-area', 'check-button', 'hint-button', 'reveal-button', 'next-button',
    'status', 'report', 'report-title', 'report-groups', 'same-button', 'new-button', 'fatal-error', 'restart-button'
  ].map((id) => [id, document.getElementById(id)]));

  let seed;
  let expedition;
  let prompts = [];
  let attempts = [];
  let index = 0;
  let unlockedStation = 0;

  function randomSeed() {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0];
  }

  function seedFromUrl() {
    const params = new URLSearchParams(location.search);
    const values = params.getAll('seed');
    if (values.length === 1 && /^\d+$/.test(values[0])) {
      const value = Number(values[0]);
      if (Number.isInteger(value) && value >= 0 && value <= 0xffffffff) return value;
    }
    if (location.search) history.replaceState({}, '', `${location.pathname}${location.hash}`);
    return randomSeed();
  }

  function stationFor(promptIndex) {
    return stations.findIndex((station) => promptIndex >= station.start && promptIndex < station.end);
  }

  function buildMap() {
    elements['station-list'].replaceChildren();
    stations.forEach((station, stationIndex) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'station-button';
      button.textContent = `${stationIndex + 1}. ${station.title}`;
      button.disabled = stationIndex > unlockedStation;
      if (stationIndex === stationFor(index)) button.setAttribute('aria-current', 'step');
      button.addEventListener('click', () => {
        if (stationIndex <= unlockedStation) {
          index = station.start;
          renderPrompt(true);
        }
      });
      item.append(button);
      elements['station-list'].append(item);
    });
  }

  function field(name, label, inputMode = 'numeric') {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';
    const labelNode = document.createElement('label');
    labelNode.htmlFor = `response-${name}`;
    labelNode.textContent = label;
    const input = document.createElement('input');
    input.id = `response-${name}`;
    input.dataset.answer = name;
    input.inputMode = inputMode;
    input.autocomplete = 'off';
    wrapper.append(labelNode, input);
    return wrapper;
  }

  function renderAnswer(item) {
    const area = elements['answer-area'];
    area.replaceChildren();
    const kind = item.answer.kind;
    if (kind === 'set') {
      const group = document.createElement('div');
      group.className = 'choice-grid';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Обери всі дільники');
      [2, 3, 5, 9, 10].forEach((value) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox'; input.value = String(value); input.dataset.answer = 'set';
        label.append(input, document.createTextNode(String(value))); group.append(label);
      });
      area.append(group);
    } else if (kind === 'choice') {
      const wrapper = field('choice', 'Знак', 'text');
      const oldInput = wrapper.querySelector('input');
      const select = document.createElement('select');
      select.id = oldInput.id; select.dataset.answer = 'choice';
      [['', 'Обери знак'], ['<', '<'], ['>', '>']].forEach(([value, text]) => {
        const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option);
      });
      oldInput.replaceWith(select); area.append(wrapper);
    } else if (kind === 'remainder') {
      const row = document.createElement('div'); row.className = 'input-row';
      row.append(field('quotient', 'Частка'), field('remainder', 'Остача')); area.append(row);
    } else if (kind === 'gcdLcm') {
      const row = document.createElement('div'); row.className = 'input-row';
      row.append(field('gcd', 'НСД'), field('lcm', 'НСК')); area.append(row);
    } else if (kind === 'mixed') {
      const row = document.createElement('div'); row.className = 'input-row';
      row.append(field('whole', 'Ціла частина'), field('numerator', 'Чисельник'), field('denominator', 'Знаменник')); area.append(row);
    } else if (kind === 'rectangle') {
      const row = document.createElement('div'); row.className = 'input-row';
      row.append(field('perimeter', 'Периметр, cm'), field('area', 'Площа, cm²')); area.append(row);
    } else {
      const mode = kind === 'decimal' ? 'decimal' : kind === 'order' ? 'text' : 'numeric';
      const label = kind === 'order' ? 'Запиши числа через кому або знак <' : 'Відповідь';
      area.append(field('value', label, mode));
    }
  }

  function collectAnswer(item) {
    if (item.answer.kind === 'set') return [...elements['answer-area'].querySelectorAll('input:checked')].map((input) => input.value);
    if (['remainder', 'gcdLcm', 'mixed', 'rectangle'].includes(item.answer.kind)) {
      return Object.fromEntries([...elements['answer-area'].querySelectorAll('[data-answer]')].map((input) => [input.dataset.answer, input.value]));
    }
    return elements['answer-area'].querySelector('[data-answer]').value;
  }

  function thirdStep(item) {
    const data = item.data;
    const addUnits = item.type === 'decimalAdd' ? data.x % 10 + data.y % 10 : null;
    const subtractUnits = item.type === 'decimalSubtract' ? (data.x % 10 - data.y % 10 + 10) % 10 : null;
    const multiplyUnits = item.type === 'decimalMultiply' ? (data.x % 10) * data.m : null;
    let divisionStep = '';
    if (item.type === 'decimalDivide') {
      const digits = String(data.x);
      let length = 1;
      while (Number(digits.slice(0, length)) < data.d) length += 1;
      const partial = Number(digits.slice(0, length));
      divisionStep = `${partial} ÷ ${data.d} = ${Math.floor(partial / data.d)}, остача ${partial % data.d}.`;
    }
    const values = {
      naturalOrder: `Найменше число: ${item.answer.value[0]}.`, precedence: `${data.b} × ${data.c} = ${data.b * data.c}.`,
      remainder: `${data.d} × ${data.q} = ${data.d * data.q}.`, divisibility: `Сума цифр дорівнює ${String(data.n).split('').reduce((sum, digit) => sum + Number(digit), 0)}.`,
      gcdLcm: `Спільний множник обох чисел — ${data.g}.`, fractionCompare: `Знаменники однакові (${data.d}); продовжуй порівняння лише за чисельниками.`,
      fractionOf: `${data.T} ÷ ${data.d} = ${data.k}.`, mixedFraction: `${data.a} + ${data.b} = ${data.a + data.b}.`,
      decimalCompare: `У сотих маємо ${data.x} і ${data.y}.`, decimalRound: `Цифра сотих — ${data.cents % 10}.`,
      decimalAdd: `У розряді сотих ${data.x % 10} + ${data.y % 10} = ${addUnits}: запиши ${addUnits % 10}, перенеси ${Math.floor(addUnits / 10)}.`,
      decimalSubtract: `У розряді сотих після потрібного позичання запиши ${subtractUnits}.`,
      decimalMultiply: `Перший крок справа: ${data.x % 10} × ${data.m} = ${multiplyUnits}; запиши ${multiplyUnits % 10}, перенеси ${Math.floor(multiplyUnits / 10)}.`,
      decimalDivide: divisionStep,
      average: `Сума дорівнює ${data.p + data.q + data.r} сотих.`, rectangle: `${data.a} + ${data.b} = ${data.a + data.b}.`,
      equation: `${data.b} − ${data.a} = ${data.b - data.a}.`
    };
    return values[item.type];
  }

  function setStatus(text, wrong = false) {
    elements.status.textContent = text;
    elements.status.classList.toggle('wrong', wrong);
    elements.status.focus();
  }

  function renderPrompt(focus = false) {
    const item = prompts[index];
    const attempt = attempts[index];
    const currentStation = stationFor(index);
    unlockedStation = Math.max(unlockedStation, currentStation);
    buildMap();
    elements.report.hidden = true;
    elements['fatal-error'].hidden = true;
    elements['prompt-card'].hidden = false;
    elements['scene-kicker'].textContent = `Станція ${currentStation + 1} з 6`;
    elements['scene-title'].textContent = stations[currentStation].title;
    elements.question.textContent = item.question;
    elements['guide-text'].textContent = stations[currentStation].intro;
    elements['progress-label'].textContent = `Крок ${index + 1} з ${prompts.length}`;
    elements['progress-bar'].style.width = `${Math.round((index / prompts.length) * 100)}%`;
    elements.status.textContent = '';
    elements.status.classList.remove('wrong');
    renderAnswer(item);
    const complete = attempt.correct || attempt.solutionRevealed;
    elements['answer-area'].hidden = complete;
    elements['check-button'].hidden = complete;
    elements['hint-button'].hidden = complete;
    elements['hint-button'].disabled = attempt.hintsUsed >= 2;
    elements['hint-button'].textContent = attempt.hintsUsed >= 2 ? 'Усі підказки відкрито' : `Підказка ${attempt.hintsUsed + 1} з 2`;
    elements['reveal-button'].hidden = complete || !math.canReveal(attempt);
    elements['next-button'].hidden = !complete;
    if (complete) setStatus(attempt.solutionRevealed ? item.solution : `Правильно. ${item.solution}`);
    const first = elements['answer-area'].querySelector('input, select');
    if (!complete && focus) elements['scene-title'].focus();
    else if (!complete) first?.focus();
  }

  function finish() {
    elements['prompt-card'].hidden = true;
    elements.report.hidden = false;
    elements['progress-label'].textContent = 'Експедицію завершено';
    elements['progress-bar'].style.width = '100%';
    unlockedStation = 5; buildMap();
    const groups = { strength: [], developing: [], revisit: [] };
    for (let finalIndex = 17; finalIndex < prompts.length; finalIndex += 1) {
      groups[math.classifyAttempt(attempts[finalIndex])].push(prompts[finalIndex].strand);
    }
    const copy = {
      strength: ['Сильні сторони', 'Ти виконав це з першої спроби без підказки.'],
      developing: ['Уже розвивається', 'Ти знайшов відповідь без повного розв’язання після додаткових спроб або підказок.'],
      revisit: ['Варто повторити', 'Розв’язання допомогло пройти цей крок.']
    };
    elements['report-groups'].replaceChildren();
    Object.entries(copy).forEach(([status, [title, description]]) => {
      if (!groups[status].length) return;
      const section = document.createElement('section'); section.className = 'report-section';
      const heading = document.createElement('h3'); heading.textContent = title;
      const intro = document.createElement('p'); intro.textContent = description;
      const list = document.createElement('ul');
      groups[status].forEach((strand) => { const item = document.createElement('li'); item.textContent = `${strandNames[strand]} — ${practice[strand]}`; list.append(item); });
      section.append(heading, intro, list); elements['report-groups'].append(section);
    });
    elements['guide-text'].textContent = 'Маяк запалено. Обери, чи повторити той самий маршрут, чи створити новий.';
    elements['report-title'].focus();
  }

  function start(nextSeed) {
    try {
      seed = nextSeed;
      expedition = math.generateExpedition(seed);
      seed = expedition.seed;
      prompts = expedition.prompts.concat(expedition.finalPrompts);
      attempts = prompts.map(() => math.initialAttempt());
      index = 0; unlockedStation = 0;
      elements['seed-value'].textContent = String(seed);
      renderPrompt(false);
    } catch (error) {
      console.error('Expedition generation failed:', error instanceof Error ? error.message : 'unknown error');
      elements['prompt-card'].hidden = true; elements.report.hidden = true; elements['fatal-error'].hidden = false;
    }
  }

  elements['check-button'].addEventListener('click', () => {
    const item = prompts[index];
    if (math.isCorrect(item, collectAnswer(item))) {
      attempts[index] = math.reduceAttempt(attempts[index], 'correct');
      renderPrompt(false);
    } else {
      attempts[index] = math.reduceAttempt(attempts[index], 'wrong');
      const count = attempts[index].wrongChecks;
      const message = count === 1 ? item.hints[0] : count === 2 ? item.hints[1] : count === 3 ? `Проміжний крок: ${thirdStep(item)}` : 'Спробуй ще або відкрий повне розв’язання. Завдання не змінилося.';
      elements['reveal-button'].hidden = !math.canReveal(attempts[index]);
      setStatus(message, true);
    }
  });
  elements['hint-button'].addEventListener('click', () => {
    const before = attempts[index].hintsUsed;
    attempts[index] = math.reduceAttempt(attempts[index], 'hint');
    setStatus(prompts[index].hints[before]);
    elements['hint-button'].disabled = attempts[index].hintsUsed >= 2;
    elements['hint-button'].textContent = attempts[index].hintsUsed >= 2 ? 'Усі підказки відкрито' : `Підказка ${attempts[index].hintsUsed + 1} з 2`;
  });
  elements['reveal-button'].addEventListener('click', () => {
    attempts[index] = math.reduceAttempt(attempts[index], 'reveal');
    renderPrompt(false);
  });
  elements['next-button'].addEventListener('click', () => {
    if (index + 1 >= prompts.length) finish(); else { index += 1; renderPrompt(true); }
  });
  elements['same-button'].addEventListener('click', () => start(seed));
  elements['new-button'].addEventListener('click', () => start(randomSeed()));
  elements['restart-button'].addEventListener('click', () => start(randomSeed()));

  start(seedFromUrl());
})();
