(() => {
  'use strict';

  const math = window.LighthouseMath;
  const game = window.LighthouseGame;
  const lighthouseScene = window.LighthouseScene;
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
    'status', 'report', 'report-title', 'report-groups', 'same-button', 'new-button', 'fatal-error', 'restart-button',
    'lesson-panel', 'lesson-copy', 'lesson-actions', 'lesson-continue', 'pacing-toggle', 'diagnostic',
    'practice-panel', 'practice-copy', 'practice-start', 'practice-close', 'lighthouse-scene'
  ].map((id) => [id, document.getElementById(id)]));

  let seed;
  let expedition;
  let prompts = [];
  let unlockedStation = 0;
  let gameState;
  let pacingInterval = null;
  let pacingFrame = null;
  let pacingIdentity = null;
  let selectedPracticeStation = null;

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
    const index = gameState.challengeIndex;
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
        if (stationIndex < stationFor(index)) {
          selectedPracticeStation = stationIndex;
          elements['practice-copy'].textContent = `${station.title}: система відновлена. Окрема практика не змінить маршрут, світ маяка чи підсумок.`;
          elements['practice-panel'].hidden = false;
          elements['practice-start'].focus();
        }
      });
      item.append(button);
      elements['station-list'].append(item);
    });
  }

  function updateWorld() {
    game.SYSTEMS.forEach((system, stationIndex) => {
      const node = document.querySelector(`[data-system="${system}"]`);
      const value = gameState.restoration[system];
      const maximum = game.COUNTS[stationIndex];
      node.style.setProperty('--repair', `${Math.round((value / maximum) * 100)}%`);
      node.dataset.level = String(value);
      node.dataset.restored = String(value === game.COUNTS[stationIndex]);
      node.querySelector('small').textContent = `${value} з ${maximum}`;
      node.setAttribute('aria-label', `${node.querySelector('strong').textContent}: відновлено ${value} з ${maximum}`);
    });
    lighthouseScene.renderLighthouseScene(elements['lighthouse-scene'], game.selectWorld(gameState));
  }

  function setGuide(key) {
    const station = stations[stationFor(gameState.challengeIndex)] || stations[5];
    elements['guide-text'].textContent = game.dialogue(key, { station: station.title, system: station.title });
  }

  function clearPacing() {
    if (pacingInterval !== null) clearInterval(pacingInterval);
    if (pacingFrame !== null) cancelAnimationFrame(pacingFrame);
    pacingInterval = null;
    pacingFrame = null;
    pacingIdentity = null;
  }

  function startPacing() {
    const index = gameState.challengeIndex;
    const pacingRunToken = gameState.runToken;
    const pacingChallengeToken = gameState.challengeToken;
    const identity = `${pacingRunToken}:${pacingChallengeToken}`;
    if (index !== 4 || gameState.pacing.mode !== 'iskraAssist' || pacingIdentity === identity) return;
    clearPacing();
    pacingIdentity = identity;
    pacingFrame = requestAnimationFrame(() => {
      pacingFrame = null;
      if (index !== 4 || gameState.runToken !== pacingRunToken || gameState.challengeToken !== pacingChallengeToken) return;
      gameState = game.reduce(gameState, { type: 'PACING_READY', now: performance.now(), runToken: pacingRunToken, challengeToken: pacingChallengeToken });
      pacingInterval = setInterval(() => {
        game.dueSupport(gameState, performance.now(), prompts[index].id).forEach((level) => {
          gameState = game.reduce(gameState, { type: 'AUTO_SUPPORT_DUE', id: prompts[index].id, level, runToken: pacingRunToken, challengeToken: pacingChallengeToken });
          setStatus(prompts[index].hints[level - 1]);
          setGuide(`support.auto.${level}`);
        });
      }, 1000);
    });
  }

  const lessonContent = {
    4: {
      title: 'Прості множники для НСД і НСК',
      paragraphs: [
        'Розклади кожне число на прості множники. Перевіряй ознаки подільності на 2, 3 і 5.',
        'НСД: візьми спільні прості множники — стільки копій кожного, скільки є в обох розкладах — і знайди їх добуток.',
        'НСК: візьми повний розклад одного числа й додай прості множники другого, яких бракує; знайди добуток.',
        'Приклад: 12 = 2·2·3, 18 = 2·3·3. Спільні 2·3 дають НСД 6; до розкладу 12 додаємо 3 й отримуємо НСК 36.'
      ],
      actions: [
        { action: 'sharedFactor', prompt: 'Які копії є спільними для 12 і 18?', choices: ['2·2', '2·3', '3·3'] },
        { action: 'missingFactor', prompt: 'Якої копії бракує розкладу 12 для НСК?', choices: ['2', '3', '6'] }
      ]
    },
    7: { title: 'Як зібрати мішане число', paragraphs: ['Одна ціла містить стільки частинок, скільки показує знаменник. Додай чисельники, збережи знаменник і перенеси одну повну групу в ціле.'], actions: [{ action: 'recall', prompt: 'Коли рівні частини утворюють одну цілу?', choices: ['усі d частин = 1', 'одна з d частин = 1', 'd цілих = 1'] }] },
    10: { title: 'Десяткові стовпчики', paragraphs: ['Вирівняй коми: соті працюють із сотими, десяті — з десятими, цілі — з цілими. Перенос або позичання використовуй лише там, де його вимагають цифри.'], actions: [{ action: 'recall', prompt: 'Як розмістити числа у стовпчик?', choices: ['кома під комою', 'за останньою цифрою', 'за довжиною запису'] }] },
    16: { title: 'Рівновага рівняння', paragraphs: ['Спочатку прибери однакову додану кількість з обох боків, потім поділи обидві частини на однакову кількість груп.'], actions: [{ action: 'recall', prompt: 'До якої частини рівняння застосовуємо обернену дію?', choices: ['лише до лівої', 'лише до правої', 'обидві частини'] }] }
  };

  function renderLesson() {
    const index = gameState.challengeIndex;
    const config = lessonContent[index];
    const active = gameState.phase === 'microLesson' && config;
    elements['lesson-panel'].hidden = !active;
    elements.question.hidden = Boolean(active);
    elements['answer-area'].hidden = Boolean(active);
    document.querySelector('#prompt-card > .actions').hidden = Boolean(active);
    if (!active) return false;
    document.getElementById('lesson-title').textContent = config.title;
    elements['lesson-copy'].replaceChildren(...config.paragraphs.map((text) => { const paragraph = document.createElement('p'); paragraph.textContent = text; return paragraph; }));
    elements['lesson-actions'].replaceChildren();
    const lessonId = { 4: 'gcd-lcm', 7: 'mixed-fraction', 10: 'decimal-columns', 16: 'equation-balance' }[index];
    const progress = gameState.lessonProgress[lessonId];
    config.actions.forEach(({ action, prompt, choices }) => {
      const group = document.createElement('fieldset'); group.className = 'retrieval-check';
      const legend = document.createElement('legend'); legend.textContent = prompt; group.append(legend);
      choices.forEach((choice) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'mechanic-button'; button.textContent = choice;
        button.dataset.complete = String(progress.retrievalActionsCompleted.includes(action));
        button.disabled = progress.retrievalActionsCompleted.includes(action);
        button.addEventListener('click', () => { gameState = game.reduce(gameState, { type: 'CHECK_LESSON_RESPONSE', action, choice }); renderLesson(); });
        group.append(button);
      });
      elements['lesson-actions'].append(group);
    });
    if (progress.response) {
      const feedback = document.createElement('p'); feedback.className = progress.response.correct ? 'retrieval-feedback correct' : 'retrieval-feedback wrong'; feedback.setAttribute('role', progress.response.correct ? 'status' : 'alert');
      feedback.textContent = progress.response.correct ? 'Правильно: цей крок пригадано.' : 'Цей вибір не відповідає прикладу. Зістав копії множників ще раз.';
      elements['lesson-actions'].append(feedback);
    }
    elements['lesson-continue'].hidden = !progress.complete;
    elements['pacing-toggle'].hidden = index !== 4;
    elements['pacing-toggle'].setAttribute('aria-pressed', String(gameState.pacing.mode === 'iskraAssist'));
    elements['pacing-toggle'].textContent = gameState.pacing.mode === 'iskraAssist' ? 'Іскра м’яко підказуватиме з часом — повернути «Без поспіху»' : 'Без поспіху — увімкнути м’які підказки Іскри';
    setGuide('lesson.ready');
    return true;
  }

  function field(name, label, inputMode = 'numeric', controlName = 'input') {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';
    const labelNode = document.createElement('label');
    labelNode.htmlFor = `response-${name}`;
    labelNode.textContent = label;
    const control = document.createElement(controlName);
    control.id = `response-${name}`;
    control.dataset.answer = name;
    if (controlName === 'input') { control.inputMode = inputMode; control.autocomplete = 'off'; }
    control.setAttribute('aria-describedby', 'diagnostic');
    wrapper.append(labelNode, control);
    return wrapper;
  }

  function outputField(name, label) {
    return field(name, label, 'numeric', 'output');
  }

  const fractionNames = { 2: 'других', 3: 'третіх', 4: 'четвертих', 5: 'п’ятих', 6: 'шостих', 7: 'сьомих', 8: 'восьмих', 9: 'дев’ятих', 10: 'десятих', 11: 'одинадцятих', 12: 'дванадцятих' };

  function fractionLabel(numerator, denominator) {
    return `дріб: чисельник ${numerator}, знаменник ${denominator}`;
  }

  function makeFraction(token, mixed = false) {
    const node = document.createElement('span');
    node.className = mixed ? 'math-mixed' : 'math-fraction';
    const fraction = mixed ? token.fraction : token;
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', mixed ? `${token.whole} ціла; ${fractionLabel(fraction.numerator, fraction.denominator)}` : fractionLabel(fraction.numerator, fraction.denominator));
    if (mixed) {
      const whole = document.createElement('span'); whole.className = 'mixed-whole'; whole.setAttribute('aria-hidden', 'true'); whole.textContent = String(token.whole); node.append(whole);
    }
    const visual = document.createElement('span'); visual.className = 'fraction-visual'; visual.setAttribute('aria-hidden', 'true');
    const numerator = document.createElement('span'); numerator.className = 'numerator'; numerator.textContent = String(fraction.numerator);
    const bar = document.createElement('span'); bar.className = 'fraction-bar';
    const denominator = document.createElement('span'); denominator.className = 'denominator'; denominator.textContent = String(fraction.denominator);
    visual.append(numerator, bar, denominator); node.append(visual); return node;
  }

  function renderTokens(target, tokens) {
    target.replaceChildren();
    (Array.isArray(tokens) ? tokens : [tokens]).forEach((token) => {
      if (typeof token === 'string') target.append(document.createTextNode(token));
      else if (token?.kind === 'fraction') target.append(makeFraction(token));
      else if (token?.kind === 'mixed') target.append(makeFraction(token, true));
    });
  }

  function relationButton(value, area) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'mechanic-button'; button.textContent = value;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      area.dataset.choice = value;
      area.querySelectorAll('.mechanic-button').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
    });
    return button;
  }

  function fractionBar(numerator, denominator, label) {
    const bar = document.createElement('div'); bar.className = 'fraction-model'; bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `${label}: ${fractionLabel(numerator, denominator)}`);
    for (let part = 0; part < denominator; part += 1) { const segment = document.createElement('span'); if (part < numerator) segment.className = 'filled'; bar.append(segment); }
    return bar;
  }

  function renderFractionBars(item, area) {
    const model = document.createElement('div'); model.className = 'fraction-bars mechanic-workspace';
    model.append(fractionBar(item.data.a, item.data.d, 'Ліва смуга'), relationButton('<', area), relationButton('>', area), fractionBar(item.data.b, item.data.d, 'Права смуга'));
    area.append(model);
  }

  function renderEqualGroupTrays(item, area) {
    const workspace = document.createElement('fieldset'); workspace.className = 'mechanic-workspace group-trays';
    const legend = document.createElement('legend'); legend.textContent = `Поділено на ${item.data.d} рівних груп. Активуй ${item.data.n}.`;
    const result = outputField('value', 'Скільки ліхтарів активовано'); const output = result.querySelector('output');
    let selected = 0;
    for (let group = 0; group < item.data.d; group += 1) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tray-button'; button.textContent = `Група ${group + 1}: ${item.data.k}`; button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => { const active = button.getAttribute('aria-pressed') !== 'true'; button.setAttribute('aria-pressed', String(active)); selected += active ? 1 : -1; output.value = String(selected * item.data.k); });
      workspace.append(button);
    }
    workspace.prepend(legend); workspace.append(result); area.append(workspace);
  }

  function renderPieceToWhole(item, area) {
    const workspace = document.createElement('fieldset'); workspace.className = 'mechanic-workspace piece-workspace';
    const legend = document.createElement('legend'); legend.textContent = 'Збери цілу частину й запиши залишок';
    const row = document.createElement('div'); row.className = 'mixed-editor';
    const whole = outputField('whole', 'Ціла частина');
    const fraction = document.createElement('div'); fraction.className = 'stacked-fraction';
    fraction.append(outputField('numerator', 'Чисельник'), document.createElement('span'), outputField('denominator', 'Знаменник'));
    fraction.children[1].className = 'fraction-bar'; row.append(whole, fraction);
    const pieces = document.createElement('div'); pieces.className = 'fraction-pieces';
    for (let count = 0; count < item.data.a + item.data.b; count += 1) { const piece = document.createElement('span'); piece.textContent = '◆'; pieces.append(piece); }
    let moved = 0;
    const update = () => {
      area.dataset.piecesMoved = String(moved);
      whole.querySelector('output').value = moved === item.data.d ? '1' : '0';
      fraction.querySelector('[data-answer="numerator"]').value = String(item.data.a + item.data.b - moved);
      fraction.querySelector('[data-answer="denominator"]').value = String(item.data.d);
      [...pieces.children].forEach((piece, position) => piece.classList.toggle('moved', position < moved));
    };
    const move = document.createElement('button'); move.type = 'button'; move.className = 'mechanic-button'; move.textContent = 'Перемістити одну частинку в ціле';
    move.addEventListener('click', () => { if (moved < item.data.d) { moved += 1; update(); } });
    const undo = document.createElement('button'); undo.type = 'button'; undo.className = 'mechanic-button'; undo.textContent = 'Скасувати частинку'; undo.addEventListener('click', () => { if (moved > 0) { moved -= 1; update(); } });
    workspace.append(legend, pieces, move, undo, row); area.append(workspace); update();
  }

  function renderCrateSort(item, area) {
    const workspace = document.createElement('fieldset'); workspace.className = 'mechanic-workspace crate-sort';
    const legend = document.createElement('legend'); legend.textContent = 'Причальний рейок: розмісти скрині за зростанням';
    const rail = document.createElement('div'); rail.className = 'crate-rail'; let selected = 0; const order = [...item.data.values];
    const render = () => {
      rail.replaceChildren(); area.dataset.order = order.join(', ');
      order.forEach((value, position) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'crate'; button.textContent = String(value); button.setAttribute('aria-pressed', String(position === selected));
        button.addEventListener('click', () => { selected = position; render(); }); rail.append(button);
      });
    };
    const left = document.createElement('button'); left.type = 'button'; left.className = 'mechanic-button'; left.textContent = '← Пересунути';
    const right = document.createElement('button'); right.type = 'button'; right.className = 'mechanic-button'; right.textContent = 'Пересунути →';
    left.addEventListener('click', () => { if (selected > 0) { [order[selected - 1], order[selected]] = [order[selected], order[selected - 1]]; selected -= 1; render(); } });
    right.addEventListener('click', () => { if (selected < order.length - 1) { [order[selected + 1], order[selected]] = [order[selected], order[selected + 1]]; selected += 1; render(); } });
    render(); workspace.append(legend, rail, left, right); area.append(workspace);
  }

  function renderRelationShutter(item, area) {
    const workspace = document.createElement('fieldset'); workspace.className = 'mechanic-workspace relation-shutter';
    const legend = document.createElement('legend'); legend.textContent = 'Закрий порівняльну заслінку правильним знаком';
    workspace.append(legend, relationButton('<', area), relationButton('>', area)); area.append(workspace);
  }

  function renderRoundingStrip(item, area) {
    const lower = Math.floor(item.data.cents / 10) * 10, upper = lower + 10;
    const workspace = document.createElement('fieldset'); workspace.className = 'mechanic-workspace rounding-strip';
    const legend = document.createElement('legend'); legend.textContent = `Сота цифра ${item.data.cents % 10}: обери сусідню десяту`;
    const output = field('value', 'Обрана десята', 'decimal'); const input = output.querySelector('input'); input.readOnly = true;
    [lower, upper].forEach((value) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'mechanic-button'; button.textContent = math.formatHundredths(value, true); button.addEventListener('click', () => { input.value = math.formatHundredths(value, true); }); workspace.append(button); });
    workspace.prepend(legend); workspace.append(output); area.append(workspace);
  }

  function renderWorkbench(item, area) {
    const workspace = document.createElement('fieldset'); workspace.className = 'mechanic-workspace factor-workbench';
    const legend = document.createElement('legend'); legend.textContent = `Побудуй повторюваними простими плитками розклади ${item.data.A} і ${item.data.B}, кільце НСД і шестерню НСК`;
    const values = { factorsA: [], factorsB: [], commonFactors: [], lcmFactors: [] };
    const labels = { factorsA: `Розклад ${item.data.A}`, factorsB: `Розклад ${item.data.B}`, commonFactors: 'Спільні копії для НСД', lcmFactors: 'Повний набір для НСК' };
    const update = (name, output) => { output.textContent = values[name].length ? values[name].join('·') : 'ще порожньо'; area.dataset[name] = JSON.stringify(values[name]); };
    Object.keys(values).forEach((name) => {
      const group = document.createElement('section'); group.className = 'factor-group';
      const heading = document.createElement('strong'); heading.textContent = labels[name];
      const output = document.createElement('span'); output.className = 'factor-output';
      [2, 3, 5, 7, 11, 13].forEach((prime) => { const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'factor-tile'; tile.dataset.group = name; tile.dataset.factor = String(prime); tile.textContent = `+${prime}`; tile.setAttribute('aria-label', `${labels[name]}: додати простий множник ${prime}`); tile.addEventListener('click', () => { if (values[name].length < 8) { values[name].push(prime); update(name, output); } }); group.append(tile); });
      const undo = document.createElement('button'); undo.type = 'button'; undo.className = 'mechanic-button'; undo.textContent = 'Скасувати останню'; undo.addEventListener('click', () => { values[name].pop(); update(name, output); });
      group.prepend(heading, output); group.append(undo); workspace.append(group); update(name, output);
    });
    const row = document.createElement('div'); row.className = 'input-row'; row.append(field('gcd', 'НСД'), field('lcm', 'НСК')); workspace.append(legend, row); area.append(workspace);
  }

  function actionButton(label, onActivate) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'mechanic-button'; button.textContent = label;
    button.addEventListener('click', () => onActivate(button));
    return button;
  }

  function markStep(button, label) {
    button.disabled = true; button.dataset.complete = 'true'; button.textContent = `${label} ✓`;
  }

  function renderOperationSlots(item, area) {
    const workspace = document.createElement('fieldset'); workspace.className = 'mechanic-workspace operation-slots';
    const legend = document.createElement('legend'); legend.textContent = 'Кран операцій: виконай дві пріоритетні дії, потім об’єднай результат';
    let completed = 0;
    const first = actionButton(`${item.data.b} × ${item.data.c}`, (button) => { completed += 1; markStep(button, 'Множення виконано'); });
    const second = actionButton(`${item.data.d} ÷ ${item.data.e}`, (button) => { completed += 1; markStep(button, 'Ділення виконано'); });
    const combine = actionButton('Перенести результати в останній слот', (button) => {
      if (completed !== 2) return;
      area.dataset.prepared = 'true'; markStep(button, 'Останній слот готовий');
    });
    workspace.append(legend, first, second, combine, field('value', 'Підсумкове значення')); area.append(workspace);
  }

  function renderEqualCrates(item, area) {
    const workspace = document.createElement('fieldset'); workspace.className = 'mechanic-workspace equal-crates';
    const legend = document.createElement('legend'); legend.textContent = `${item.data.N} паливних комірок розкладаємо в ящики по ${item.data.d}`;
    const quotient = field('quotient', 'Повних рівних ящиків');
    const remainder = field('remainder', 'Комірок в остачі');
    let groups = 0;
    const output = document.createElement('output'); output.className = 'mechanic-output';
    const update = () => { output.textContent = `${groups} повних ящиків; залишок ${item.data.N - groups * item.data.d}`; area.dataset.grouped = String(groups === item.data.q); };
    const minus = actionButton('− ящик', () => { groups = Math.max(0, groups - 1); update(); });
    const plus = actionButton('+ ящик', () => { groups = Math.min(item.data.q, groups + 1); update(); });
    const fill = actionButton('Зібрати всі можливі повні ящики', (button) => { groups = item.data.q; update(); markStep(button, 'Рівні ящики зібрано'); });
    workspace.append(legend, output, minus, plus, fill, quotient, remainder); area.append(workspace); update();
  }

  function renderGearToggles(item, area) {
    const workspace = document.createElement('fieldset'); workspace.className = 'mechanic-workspace gear-toggles';
    const legend = document.createElement('legend'); legend.textContent = `Шестерня ${item.data.n}: обери всі придатні штампи`;
    const digitSum = String(item.data.n).split('').reduce((sum, digit) => sum + Number(digit), 0);
    const gauges = document.createElement('p'); gauges.textContent = `Остання цифра: ${String(item.data.n).slice(-1)}. Сума цифр: ${digitSum}.`;
    workspace.append(legend, gauges);
    [2, 3, 5, 9, 10].forEach((value) => {
      const label = document.createElement('label'); label.className = 'toggle-card';
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = String(value); input.dataset.answer = 'set';
      label.append(input, document.createTextNode(` штамп ${value}`)); workspace.append(label);
    });
    area.append(workspace);
  }

  function renderColumnWork(item, area) {
    const workspace = document.createElement('fieldset'); workspace.className = `mechanic-workspace ${item.mechanicData.kind}`;
    const legend = document.createElement('legend'); legend.textContent = item.type === 'decimalAdd' ? 'Колонний насос: вирівняй коми й установи перенос' : 'Колонний насос: вирівняй коми й установи позичання лише за потреби';
    let aligned = false, tokenReady = false;
    const update = () => { area.dataset.prepared = String(aligned && tokenReady); };
    const align = actionButton('Вирівняти коми та розряди', (button) => { aligned = true; markStep(button, 'Коми вирівняно'); update(); });
    const required = item.type === 'decimalAdd' || item.mechanicData.borrow.required;
    const token = actionButton(required ? (item.type === 'decimalAdd' ? 'Поставити перенос із сотих' : 'Позичити одну десяту') : 'Підтвердити: позичання не потрібне', (button) => { tokenReady = true; markStep(button, required ? 'Розрядний жетон установлено' : 'Без позичання'); update(); });
    workspace.append(legend, align, token, field('value', 'Результат', 'decimal')); area.append(workspace);
  }

  function renderBatchBins(item, area) {
    const workspace = document.createElement('fieldset'); workspace.className = 'mechanic-workspace batch-bins';
    const legend = document.createElement('legend'); legend.textContent = `Збери ${item.data.m} однакових партій по ${math.formatHundredths(item.data.x, true)}`;
    let batches = 0; const output = document.createElement('output'); output.className = 'mechanic-output';
    const update = () => { output.textContent = `Партій у бункері: ${batches} з ${item.data.m}`; area.dataset.prepared = String(batches === item.data.m); };
    workspace.append(legend, output,
      actionButton('− партія', () => { batches = Math.max(0, batches - 1); update(); }),
      actionButton('+ партія', () => { batches = Math.min(item.data.m, batches + 1); update(); }),
      field('value', 'Результат', 'decimal'));
    area.append(workspace); update();
  }

  function renderDivisionChannels(item, area) {
    const workspace = document.createElement('fieldset'); workspace.className = 'mechanic-workspace division-channels';
    const legend = document.createElement('legend'); legend.textContent = `Розподіли ${math.formatHundredths(item.data.x, true)} порівну між ${item.data.d} каналами`;
    const channels = document.createElement('div'); channels.className = 'channel-row';
    for (let channel = 1; channel <= item.data.d; channel += 1) { const node = document.createElement('span'); node.textContent = `Канал ${channel}`; channels.append(node); }
    const deal = actionButton('Роздати порівну в усі канали', (button) => { area.dataset.prepared = 'true'; channels.dataset.equal = 'true'; markStep(button, 'Канали зрівняно'); });
    workspace.append(legend, channels, deal, field('value', 'У кожному каналі', 'decimal')); area.append(workspace);
  }

  function renderWaterBalance(item, area) {
    const workspace = document.createElement('fieldset'); workspace.className = 'mechanic-workspace water-balance';
    const legend = document.createElement('legend'); legend.textContent = 'Перелий воду так, щоб три стовпчики мали однаковий рівень';
    const levels = [item.data.p, item.data.q, item.data.r];
    let source = null, destination = null;
    const columns = levels.map((value, index) => actionButton(`Стовпчик ${index + 1}: ${math.formatHundredths(value, true)}`, (button) => {
      if (source === null) source = index;
      else destination = index;
      columns.forEach((column, position) => column.setAttribute('aria-pressed', String(position === source || position === destination)));
    }));
    columns.forEach((column) => column.classList.add('water-column'));
    const transferField = field('transfer', 'Скільки перелити', 'decimal');
    const transfer = actionButton('Перелити вибрану кількість', (button) => {
      const amount = math.parseHundredths(transferField.querySelector('input').value);
      const required = item.data.r - item.data.q;
      if (source !== 2 || destination !== 0 || amount !== required) return;
      levels[source] -= amount; levels[destination] += amount;
      columns.forEach((column, index) => { column.textContent = `Стовпчик ${index + 1}: ${math.formatHundredths(levels[index], true)}`; column.dataset.equal = String(levels[index] === item.data.q); });
      area.dataset.prepared = String(levels.every((value) => value === item.data.q)); markStep(button, 'Рівні стовпчики');
    });
    workspace.append(legend, ...columns, transferField, transfer, field('value', 'Спільний рівень', 'decimal')); area.append(workspace);
  }

  function renderFormulaRouting(item, area) {
    const workspace = document.createElement('fieldset'); workspace.className = 'mechanic-workspace formula-routing';
    const legend = document.createElement('legend'); legend.textContent = 'Сад: направ формулу межі до огорожі, а формулу поверхні — до ґрунту';
    let fence = false, soil = false;
    const update = () => { area.dataset.routed = String(fence && soil); };
    const perimeter = actionButton(`Огорожа ← 2·(${item.data.a}+${item.data.b})`, (button) => { fence = true; markStep(button, 'Формула огорожі'); update(); });
    const surface = actionButton(`Ґрунт ← ${item.data.a}·${item.data.b}`, (button) => { soil = true; markStep(button, 'Формула ґрунту'); update(); });
    workspace.append(legend, perimeter, surface, field('perimeter', 'Периметр, см'), field('area', 'Площа, см²')); area.append(workspace);
  }

  function renderBalanceBoxes(item, area) {
    const workspace = document.createElement('fieldset'); workspace.className = 'mechanic-workspace balance-boxes';
    const legend = document.createElement('legend'); legend.textContent = `Терези: ${item.data.m}x + ${item.data.a} = ${item.data.b}`;
    let removed = false, distributed = false;
    const update = () => { area.dataset.prepared = String(removed && distributed); };
    const remove = actionButton(`Прибрати ${item.data.a} ламп з обох боків`, (button) => { removed = true; markStep(button, 'Однаковий доданок прибрано'); update(); });
    const distribute = actionButton(`Поділити решту на ${item.data.m} рівних коробок`, (button) => { if (!removed) return; distributed = true; markStep(button, 'Розподілено порівну'); update(); });
    workspace.append(legend, remove, distribute, field('value', 'Ламп у кожній коробці')); area.append(workspace);
  }

  const mechanicRenderers = {
    'crate-sort': renderCrateSort,
    'prime-factor-workbench': renderWorkbench,
    'fraction-bars': renderFractionBars,
    'equal-group-trays': renderEqualGroupTrays,
    'piece-to-whole': renderPieceToWhole,
    'place-value-rack': renderRelationShutter,
    'rounding-strip': renderRoundingStrip,
    'operation-slots': renderOperationSlots,
    'equal-crates': renderEqualCrates,
    'gear-toggles': renderGearToggles,
    'column-add': renderColumnWork,
    'column-subtract': renderColumnWork,
    'batch-bins': renderBatchBins,
    'division-channels': renderDivisionChannels,
    'water-balance': renderWaterBalance,
    'formula-routing': renderFormulaRouting,
    'balance-boxes': renderBalanceBoxes
  };

  function renderAnswer(item) {
    const area = elements['answer-area'];
    area.replaceChildren();
    delete area.dataset.choice; delete area.dataset.order;
    const kind = item.answer.kind;
    if (mechanicRenderers[item.mechanicData.kind]) {
      mechanicRenderers[item.mechanicData.kind](item, area);
      return;
    }
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
      row.append(field('perimeter', 'Периметр, см'), field('area', 'Площа, см²')); area.append(row);
    } else {
      const mode = kind === 'decimal' ? 'decimal' : kind === 'order' ? 'text' : 'numeric';
      const label = kind === 'order' ? 'Запиши числа через кому або знак <' : 'Відповідь';
      area.append(field('value', label, mode));
    }
  }

  function collectAnswer(item) {
    if (item.type === 'naturalOrder') return elements['answer-area'].dataset.order || '';
    if (item.answer.kind === 'choice') return elements['answer-area'].dataset.choice || '';
    if (item.answer.kind === 'set') return [...elements['answer-area'].querySelectorAll('input:checked')].map((input) => input.value);
    if (['remainder', 'gcdLcm', 'mixed', 'rectangle'].includes(item.answer.kind)) {
      const response = Object.fromEntries([...elements['answer-area'].querySelectorAll('[data-answer]')].map((input) => [input.dataset.answer, input.value]));
      if (item.answer.kind === 'remainder') response.grouped = elements['answer-area'].dataset.grouped === 'true';
      if (item.answer.kind === 'gcdLcm') ['factorsA', 'factorsB', 'commonFactors', 'lcmFactors'].forEach((name) => { response[name] = JSON.parse(elements['answer-area'].dataset[name] || '[]'); });
      if (item.answer.kind === 'mixed') response.piecesMoved = elements['answer-area'].dataset.piecesMoved;
      if (item.answer.kind === 'rectangle') response.routed = elements['answer-area'].dataset.routed === 'true';
      return response;
    }
    const value = elements['answer-area'].querySelector('[data-answer="value"]').value;
    const consequential = ['operation-slots', 'column-add', 'column-subtract', 'batch-bins', 'division-channels', 'water-balance', 'balance-boxes'].includes(item.mechanicData.kind);
    return consequential ? { value, mechanicComplete: elements['answer-area'].dataset.prepared === 'true' } : value;
  }

  function diagnose(item, response) {
    return math.diagnoseResponse(item, response);
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

  function setStatus(content, wrong = false) {
    const target = wrong ? elements.diagnostic : elements.status;
    const other = wrong ? elements.status : elements.diagnostic;
    other.replaceChildren(); renderTokens(target, content);
    if (!wrong) elements.status.focus();
  }

  function attemptView(item) {
    const source = gameState.practiceReplay.active ? gameState.practiceReplay.attemptsById : gameState.attemptsById;
    const attempt = source[item.id] || game.emptyAttempt();
    return {
      complete: Boolean(attempt.completion),
      solutionRevealed: attempt.completion === 'solution',
      hintsUsed: attempt.hintsSeen.filter(Boolean).length,
      canReveal: attempt.validWrongChecks >= 3 || attempt.hintsSeen.every(Boolean)
    };
  }

  function renderPrompt(focus = false) {
    const index = gameState.challengeIndex;
    const item = prompts[index];
    const attempt = attemptView(item);
    const currentStation = stationFor(index);
    unlockedStation = Math.max(unlockedStation, currentStation);
    buildMap();
    updateWorld();
    elements.report.hidden = true;
    elements['fatal-error'].hidden = true;
    elements['prompt-card'].hidden = false;
    elements['scene-kicker'].textContent = `Станція ${currentStation + 1} з 6`;
    if (gameState.practiceReplay.active) elements['scene-kicker'].textContent += ' — окрема практика';
    elements['scene-title'].textContent = stations[currentStation].title;
    renderTokens(elements.question, item.question);
    setGuide('station.enter');
    elements['progress-label'].textContent = `Крок ${index + 1} з ${prompts.length}`;
    elements['progress-bar'].style.width = `${Math.round((index / prompts.length) * 100)}%`;
    elements.status.textContent = '';
    elements.diagnostic.textContent = '';
    elements.status.classList.remove('wrong');
    renderAnswer(item);
    if (renderLesson()) {
      if (focus) elements['scene-title'].focus();
      return;
    }
    const complete = attempt.complete;
    elements['answer-area'].hidden = complete;
    elements['check-button'].hidden = complete;
    elements['hint-button'].hidden = complete;
    elements['hint-button'].disabled = attempt.hintsUsed >= 3;
    elements['hint-button'].textContent = attempt.hintsUsed >= 3 ? 'Усі підказки відкрито' : `Підказка ${attempt.hintsUsed + 1} з 3`;
    elements['reveal-button'].hidden = complete || !attempt.canReveal;
    elements['next-button'].hidden = !complete;
    if (complete) setStatus(attempt.solutionRevealed ? item.solution : ['Правильно. ', ...(Array.isArray(item.solution) ? item.solution : [item.solution])]);
    if (!complete) startPacing();
    const first = elements['answer-area'].querySelector('input, select, button');
    if (!complete && focus) elements['scene-title'].focus();
    else if (!complete) first?.focus();
  }

  function countByStrand(ids, byId) {
    return ids.reduce((counts, id) => {
      const strand = byId[id]?.strand || 'unknown';
      counts[strand] = (counts[strand] || 0) + 1;
      return counts;
    }, {});
  }

  function finish() {
    clearPacing();
    gameState = game.reduce(gameState, { type: 'FINALE_PLAY' });
    lighthouseScene.renderLighthouseScene(elements['lighthouse-scene'], game.selectWorld(gameState));
    elements['prompt-card'].hidden = true;
    elements.report.hidden = false;
    elements['progress-label'].textContent = 'Експедицію завершено';
    elements['progress-bar'].style.width = '100%';
    unlockedStation = 5; buildMap();
    const summary = game.report(gameState);
    const byId = Object.fromEntries(prompts.map((prompt) => [prompt.id, prompt]));
    const copy = {
      independent: ['Розв’язано самостійно', 'Правильні математичні відповіді без підказок.'],
      supported: ['Розв’язано з підтримкою', 'Правильні математичні відповіді після концептуальної, методичної або покрокової підказки.'],
      solution: ['Опрацьовано з розв’язанням', 'Крок завершено через явно відкрите пояснення; це не позначено як самостійна відповідь.']
    };
    elements['report-groups'].replaceChildren();
    Object.entries(copy).forEach(([status, [title, description]]) => {
      if (!summary[status].length) return;
      const section = document.createElement('section'); section.className = 'report-section';
      const heading = document.createElement('h3'); heading.textContent = title;
      const intro = document.createElement('p'); intro.textContent = description;
      const list = document.createElement('ul');
      Object.entries(countByStrand(summary[status], byId)).forEach(([strand, count]) => { const item = document.createElement('li'); item.textContent = `${strandNames[strand] || strand}: ${count} — ${practice[strand] || ''}`; list.append(item); });
      section.append(heading, intro, list); elements['report-groups'].append(section);
    });
    const support = document.createElement('section'); support.className = 'report-section';
    const supportTitle = document.createElement('h3'); supportTitle.textContent = 'Самостійність / підтримка';
    const supportText = document.createElement('p'); supportText.textContent = `Концептуальні підказки: ${summary.supportLevels[0]}; підказки методу: ${summary.supportLevels[1]}; покрокові опори: ${summary.supportLevels[2]}. Час не змінює правильність відповіді.`;
    support.append(supportTitle, supportText); elements['report-groups'].append(support);
    setGuide('finale.ready');
    const finaleTokens = { runToken: gameState.runToken, challengeToken: gameState.challengeToken };
    setTimeout(() => {
      gameState = game.reduce(gameState, { type: 'FINALE_COMPLETE', ...finaleTokens });
      lighthouseScene.renderLighthouseScene(elements['lighthouse-scene'], game.selectWorld(gameState));
      if (gameState.phase === 'report') { setGuide('finale.complete'); elements['report-title'].focus(); }
    }, 1600);
  }

  function start(nextSeed) {
    try {
      clearPacing();
      seed = nextSeed;
      expedition = math.generateExpedition(seed);
      seed = expedition.seed;
      prompts = expedition.prompts.concat(expedition.finalPrompts);
      gameState = game.enterChallenge(game.reduce(game.createState(seed), { type: 'START' }), 0, prompts[0].id);
      unlockedStation = 0;
      elements['seed-value'].textContent = String(seed);
      renderPrompt(false);
    } catch (error) {
      console.error('Expedition generation failed:', error instanceof Error ? error.message : 'unknown error');
      const fatalWorld = gameState || game.createState(nextSeed);
      lighthouseScene.renderLighthouseScene(elements['lighthouse-scene'], game.selectWorld(fatalWorld));
      elements['prompt-card'].hidden = true; elements.report.hidden = true; elements['fatal-error'].hidden = false;
    }
  }

  elements['check-button'].addEventListener('click', () => {
    const index = gameState.challengeIndex;
    const item = prompts[index];
    const response = collectAnswer(item);
    if (math.isCorrect(item, response)) {
      elements['answer-area'].querySelectorAll('[data-answer]').forEach((control) => control.setAttribute('aria-invalid', 'false'));
      clearPacing();
      gameState = game.reduce(gameState, { type: 'CHECK_CORRECT', id: item.id });
      const attempts = gameState.practiceReplay.active ? gameState.practiceReplay.attemptsById : gameState.attemptsById;
      const completion = attempts[item.id]?.completion;
      const stationIndex = stationFor(index);
      const stationComplete = !gameState.practiceReplay.active && gameState.restoration[game.SYSTEMS[stationIndex]] === game.COUNTS[stationIndex];
      renderPrompt(false);
      if (completion === 'independent') setGuide('challenge.correct.independent');
      else if (completion === 'supported') setGuide('challenge.correct.supported');
      const successLine = elements['guide-text'].textContent;
      if (stationComplete) { setGuide('station.complete'); elements['guide-text'].textContent = `${successLine} ${elements['guide-text'].textContent}`; }
    } else {
      const values = response && typeof response === 'object' ? Object.values(response) : [response];
      const invalid = !values.length || values.some((value) => Array.isArray(value) ? !value.length : String(value ?? '').trim() === '');
      gameState = game.reduce(gameState, { type: invalid ? 'CHECK_INVALID' : 'CHECK_WRONG', id: item.id });
      elements['reveal-button'].hidden = !attemptView(item).canReveal;
      setStatus(diagnose(item, response), true);
      const firstInvalid = elements['answer-area'].querySelector('button, input:not([readonly]), select, [data-answer]');
      if (firstInvalid) { firstInvalid.setAttribute('aria-invalid', 'true'); firstInvalid.focus(); }
      elements['guide-text'].textContent = game.dialogue(invalid ? 'response.invalid' : 'response.wrong', { station: stations[stationFor(index)].title, system: stations[stationFor(index)].title });
    }
  });
  elements['hint-button'].addEventListener('click', () => {
    const index = gameState.challengeIndex;
    const before = attemptView(prompts[index]).hintsUsed;
    gameState = game.reduce(gameState, { type: 'REQUEST_HINT', id: prompts[index].id, level: before + 1 });
    setStatus(prompts[index].hints[before]);
    elements['guide-text'].textContent = game.dialogue(`hint.${before + 1}`, { station: stations[stationFor(index)].title, system: stations[stationFor(index)].title });
    const used = attemptView(prompts[index]).hintsUsed;
    elements['hint-button'].disabled = used >= 3;
    elements['hint-button'].textContent = used >= 3 ? 'Усі підказки відкрито' : `Підказка ${used + 1} з 3`;
    elements['reveal-button'].hidden = !attemptView(prompts[index]).canReveal;
  });
  elements['reveal-button'].addEventListener('click', () => {
    const index = gameState.challengeIndex;
    clearPacing();
    gameState = game.reduce(gameState, { type: 'REVEAL_SOLUTION', id: prompts[index].id });
    renderPrompt(false);
  });
  elements['next-button'].addEventListener('click', () => {
    const index = gameState.challengeIndex;
    clearPacing();
    if (index + 1 >= prompts.length) finish(); else { gameState = game.reduce(gameState, { type: 'NEXT', nextId: prompts[index + 1].id }); renderPrompt(true); }
  });
  elements['lesson-continue'].addEventListener('click', () => { gameState = game.reduce(gameState, { type: 'CLOSE_LESSON' }); renderPrompt(true); });
  elements['practice-start'].addEventListener('click', () => {
    if (selectedPracticeStation === null) return;
    const start = game.COUNTS.slice(0, selectedPracticeStation).reduce((sum, count) => sum + count, 0);
    gameState = game.reduce(gameState, { type: 'START_PRACTICE_REPLAY', station: selectedPracticeStation, id: prompts[start].id });
    elements['practice-panel'].hidden = true;
    renderPrompt(true);
  });
  elements['practice-close'].addEventListener('click', () => { elements['practice-panel'].hidden = true; });
  elements['pacing-toggle'].addEventListener('click', () => {
    const mode = gameState.pacing.mode === 'iskraAssist' ? 'withoutRush' : 'iskraAssist';
    gameState = game.reduce(gameState, { type: 'SET_PACING_MODE', mode });
    clearPacing();
    renderLesson();
  });
  document.addEventListener('visibilitychange', () => {
    gameState = game.reduce(gameState, { type: document.hidden ? 'VISIBILITY_PAUSE' : 'VISIBILITY_RESUME', now: performance.now() });
  });
  elements['same-button'].addEventListener('click', () => start(seed));
  elements['new-button'].addEventListener('click', () => start(randomSeed()));
  elements['restart-button'].addEventListener('click', () => start(randomSeed()));

  start(seedFromUrl());
})();
