'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const math = require('../activities/math/06-grade5-lighthouse/generator.js');
const game = require('../activities/math/06-grade5-lighthouse/game-model.js');

const activityRoot = path.join(__dirname, '../activities/math/06-grade5-lighthouse');
const source = (name) => fs.readFileSync(path.join(activityRoot, name), 'utf8');

// The principal scene receives a detached projection, never canonical state.
const initialWorldState = game.createState(1);
assert.equal(typeof game.selectWorld, 'function', 'world projection is exported');
assert.deepEqual(game.selectWorld(initialWorldState), {
  phase: 'intro',
  stationIndex: 0,
  challengeIndex: 0,
  restoration: {
    harborPath: 0,
    workshopGears: 0,
    fractionBridge: 0,
    lightReservoir: 0,
    geometryGarden: 0,
    controlConsole: 0
  },
  finale: { lampLit: false, beamSwept: false }
});
let harborOneState = game.enterChallenge(game.reduce(initialWorldState, { type: 'START' }), 0, 'harbor-1');
harborOneState = game.reduce(harborOneState, { type: 'CHECK_CORRECT', id: 'harbor-1' });
const harborOneWorld = game.selectWorld(harborOneState);
assert.equal(harborOneWorld.restoration.harborPath, 1, 'first Harbor success reaches the scene projection');
assert.notEqual(harborOneWorld.restoration, harborOneState.restoration, 'projection detaches restoration state');
assert.notEqual(harborOneWorld.finale, harborOneState.finale, 'projection detaches finale state');
assert.equal(Object.isFrozen(harborOneWorld), true, 'projection is immutable');
assert.equal(Object.isFrozen(harborOneWorld.restoration), true, 'restoration projection is immutable');
assert.equal(Object.isFrozen(harborOneWorld.finale), true, 'finale projection is immutable');

// The isolated principal scene renders one physical Harbor repair once.
const scenePath = path.join(activityRoot, 'lighthouse-scene.js');
assert.equal(fs.existsSync(scenePath), true, 'principal scene renderer exists');
const scene = require(scenePath);
const sceneClasses = new Set();
let repairClassAdditions = 0;
const harborSegment = { dataset: {} };
const sceneRoot = {
  dataset: {},
  classList: {
    contains(name) { return sceneClasses.has(name); },
    toggle(name, force) {
      const present = sceneClasses.has(name);
      if (force && !present) {
        sceneClasses.add(name);
        if (name === 'has-harbor-repair') repairClassAdditions += 1;
      } else if (!force && present) sceneClasses.delete(name);
      return Boolean(force);
    }
  },
  setAttribute(name, value) { this[name] = String(value); },
  querySelector(selector) { return selector === '[data-scene-part="harbor-access"]' ? harborSegment : null; }
};
scene.renderLighthouseScene(sceneRoot, game.selectWorld(initialWorldState));
assert.equal(sceneRoot.dataset.harborPath, '0');
assert.equal(harborSegment.dataset.repaired, 'false');
assert.equal(sceneClasses.has('has-harbor-repair'), false);
scene.renderLighthouseScene(sceneRoot, harborOneWorld);
scene.renderLighthouseScene(sceneRoot, game.selectWorld(game.reduce(harborOneState, { type: 'CHECK_CORRECT', id: 'harbor-1' })));
assert.equal(sceneRoot.dataset.harborPath, '1');
assert.equal(harborSegment.dataset.repaired, 'true');
assert.equal(sceneClasses.has('has-harbor-repair'), true);
assert.equal(repairClassAdditions, 1, 'duplicate success cannot replay the Harbor restoration transition');

// Regression contract: progress text must live on one solid, AA-safe surface.
const initialHtml = source('index.html');
const initialCss = source('styles.css');
const sceneCss = source('lighthouse-scene.css');
assert.match(initialHtml, /id="lighthouse-scene"[^>]*class="lighthouse-scene"/);
assert.match(initialHtml, /href="lighthouse-scene\.css"/);
assert.match(initialHtml, /src="lighthouse-scene\.js"[^>]*defer/);
assert.match(source('app.js'), /renderLighthouseScene\([^,]+,\s*game\.selectWorld\(gameState\)\)/, 'app projects canonical state into the scene');
assert.match(sceneCss, /\.lighthouse-scene[^{]*\.harbor-access[^{]*\{[^}]*transform:/s, 'Harbor repair changes physical position');
assert.match(sceneCss, /\.lighthouse-scene\.has-harbor-repair[^{]*\.harbor-access[^{]*\{[^}]*transform:/s, 'restored access segment locks into place');
assert.match(initialHtml, /id="world-progress"[^>]*class="[^"]*progress-surface/);
assert.match(initialCss, /--progress-surface:\s*#[0-9a-f]{6}/i);
assert.match(initialCss, /\.progress-surface\s*\{[^}]*background:\s*var\(--progress-surface\)/s);

// Mobile shell keeps one current station visible and reveals the full route on request.
assert.match(initialHtml, /<details[^>]*class="[^"]*route-disclosure[^"]*"[\s\S]*?<summary>Маршрут<\/summary>[\s\S]*?id="world"/,
  'the restoration overview is behind an explicit native route disclosure');
assert.match(initialHtml, /<ol id="station-list"><\/ol>[\s\S]*?<details[^>]*route-disclosure/,
  'the current station row remains before the optional route overview');
assert.match(initialCss, /@media \(max-width:\s*760px\)[\s\S]*?\.hero\s*\{[^}]*min-height:\s*(?:88|9\d|10\d|11\d|120)px/s,
  'mobile hero is a compact 88–120 CSS px visual rail');
assert.match(initialCss, /@media \(max-width:\s*760px\)[\s\S]*?#station-list li\s*\{[^}]*display:\s*none/s,
  'mobile route defaults to one station row');
assert.match(initialCss, /@media \(max-width:\s*760px\)[\s\S]*?#station-list li:has\(\.station-button\[aria-current="step"\]\)\s*\{[^}]*display:\s*list-item/s,
  'the current station remains visible when the route is closed');
assert.match(initialCss, /\.map:has\(\.route-disclosure\[open\]\) #station-list li\s*\{[^}]*display:\s*list-item/s,
  'opening Маршрут reveals learner-controlled station navigation');
assert.doesNotMatch(initialCss, /\.guide\s*\{[^}]*display:\s*none/s,
  'responsive layout preserves the live pedagogical support region');
assert.match(initialCss, /@media \(max-width:\s*760px\)[\s\S]*?body\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/s,
  'the mobile document reserves one viewport for the rail and task scroller');
assert.match(initialCss, /@media \(max-width:\s*760px\)[\s\S]*?\.hero\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/s,
  'the visual rail remains continuously visible at every mobile viewport height');
assert.match(initialCss, /@media \(max-width:\s*760px\)[\s\S]*?\.shell\s*\{[^}]*overflow-y:\s*auto/s,
  'challenge content scrolls below rather than underneath the visual rail');
assert.doesNotMatch(initialCss, /@media \(max-width:\s*760px\) and \(min-height:/,
  'mobile rail visibility cannot be disabled by a viewport-height gate');
assert.doesNotMatch(initialCss, /body:has\(#diagnostic:not\(:empty\)\) \.hero\s*\{[^}]*position:\s*relative/s,
  'wrong feedback cannot disable the continuously visible rail');

function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
function lcmByMultiples(a, b) { for (let n = Math.max(a, b); n <= a * b; n += 1) if (n % a === 0 && n % b === 0) return n; throw new Error('unreachable'); }
function normalized(text) { return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function assertDistinctSupport(item) {
  assert.equal(item.hints.length, 3, `${item.id}: three progressive hints`);
  assert.ok(item.errorRules && Object.keys(item.errorRules).length, `${item.id}: separate diagnostics`);
  const errors = Object.values(item.errorRules).map(normalized);
  const hints = item.hints.map(normalized);
  assert.equal(new Set(hints).size, 3, `${item.id}: hint levels differ`);
  for (const error of errors) for (const hint of hints) {
    assert.ok(error !== hint && !error.includes(hint) && !hint.includes(error), `${item.id}: diagnosis must not duplicate a hint`);
  }
}
const supportRegression = Object.fromEntries(math.generateExpedition(1).prompts.map((item) => [item.type, item]));
assertDistinctSupport(supportRegression.naturalOrder);
assertDistinctSupport(supportRegression.gcdLcm);

// Required GCD/LCM recall cannot be skipped before its two retrieval actions.
let lessonState = game.createState(1);
lessonState = game.reduce(lessonState, { type: 'START' });
lessonState = game.enterChallenge(lessonState, 4, 'gcd-lcm');
assert.equal(lessonState.phase, 'microLesson');
assert.equal(game.reduce(lessonState, { type: 'CHECK_CORRECT', id: 'gcd-lcm' }).restoration.workshopGears, 0, 'lesson gate blocks early correctness');
assert.equal(game.reduce(lessonState, { type: 'CLOSE_LESSON' }).phase, 'microLesson');
lessonState = game.reduce(lessonState, { type: 'CHECK_LESSON_RESPONSE', action: 'sharedFactor', choice: '2·2' });
assert.equal(lessonState.lessonProgress['gcd-lcm'].wrongChecks, 1, 'retrieval checks a learner choice');
assert.deepEqual(lessonState.lessonProgress['gcd-lcm'].retrievalActionsCompleted, [], 'wrong retrieval choice does not advance');
lessonState = game.reduce(lessonState, { type: 'CHECK_LESSON_RESPONSE', action: 'sharedFactor', choice: '2·3' });
assert.equal(lessonState.lessonProgress['gcd-lcm'].complete, false);
lessonState = game.reduce(lessonState, { type: 'CHECK_LESSON_RESPONSE', action: 'missingFactor', choice: '3' });
assert.equal(lessonState.lessonProgress['gcd-lcm'].complete, true);
assert.equal(game.reduce(lessonState, { type: 'CLOSE_LESSON' }).phase, 'challengeReady');
assert.match(source('app.js'), /CHECK_LESSON_RESPONSE/, 'lesson UI submits the selected retrieval answer');
assert.doesNotMatch(source('app.js'), /button\.addEventListener\('click', \(\) => \{ gameState = game\.reduce\(gameState, \{ type: 'CHECK_LESSON_CORRECT'/, 'lesson UI cannot mark a fixed button correct');

// Diagnostics must describe the submitted misconception, not the first generic rule.
const diagnosticGcd = supportRegression.gcdLcm;
assert.equal(math.diagnoseResponse(diagnosticGcd, {
  gcd: diagnosticGcd.answer.value.gcd,
  lcm: diagnosticGcd.answer.value.lcm,
  factorsA: diagnosticGcd.data.factorsA,
  factorsB: diagnosticGcd.data.factorsB,
  commonFactors: diagnosticGcd.data.factorsA,
  lcmFactors: diagnosticGcd.data.lcmFactors
}), diagnosticGcd.errorRules.commonMismatch);
const diagnosticOrder = supportRegression.naturalOrder;
assert.equal(math.diagnoseResponse(diagnosticOrder, diagnosticOrder.data.values.join(', ')), diagnosticOrder.errorRules.incorrectOrder);

function walkLearnerTokens(value, visit) {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) value.forEach((item) => walkLearnerTokens(item, visit));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => walkLearnerTokens(item, visit));
}
const fractionTypes = new Set(['fractionCompare', 'fractionOf', 'mixedFraction']);
for (let seed = 0; seed < 10000; seed += 1) {
  const all = math.generateExpedition(seed).prompts.concat(math.generateExpedition(seed).finalPrompts);
  for (const item of all) {
    walkLearnerTokens({ question: item.question, hints: item.hints, errors: item.errorRules, solution: item.solution, display: item.answer.display }, (text) => {
      assert.doesNotMatch(text, /\b\d+\s*\/\s*\d+\b/, `${item.id}: learner-visible slash fraction`);
      assert.doesNotMatch(text, /\bcm(?:²)?\b/i, `${item.id}: Ukrainian geometry units required`);
    });
    if (fractionTypes.has(item.type)) {
      const serialized = JSON.stringify(item.question);
      assert.match(serialized, /"kind":"fraction"/, `${item.id}: structured fraction token required`);
    }
  }
}
assert.doesNotMatch(source('app.js'), /\bd\s*\/\s*d\b/i, 'micro-lessons cannot expose slash fractions');
assert.doesNotMatch(source('app.js'), /['"`]Периметр, cm|['"`]Площа, cm²/, 'geometry field labels use Ukrainian units');
const bridge = Object.fromEntries(math.generateExpedition(7).prompts.map((item) => [item.type, item]));
assert.equal(bridge.fractionCompare.mechanicData.kind, 'fraction-bars');
assert.equal(bridge.fractionOf.mechanicData.kind, 'equal-group-trays');
assert.equal(bridge.mixedFraction.mechanicData.kind, 'piece-to-whole');
assert.match(source('app.js'), /function renderFractionBars\s*\(/);
assert.match(source('app.js'), /function renderEqualGroupTrays\s*\(/);
assert.match(source('app.js'), /function renderPieceToWhole\s*\(/);
// Fraction Bridge has one direct-construction path: controls precede inert stacked results.
const bridgeApp = source('app.js');
assert.match(bridgeApp, /function outputField\s*\(/, 'bridge results use one non-editable output primitive');
assert.doesNotMatch(bridgeApp, /className = 'editable-fraction'/, 'mixed-number construction has no parallel manual-entry path');
assert.match(bridgeApp, /workspace\.append\(legend, pieces, move, undo, row\)/,
  'piece construction controls precede the derived stacked result in DOM and focus order');
assert.match(bridgeApp, /querySelector\('button, input:not\(\[readonly\]\), select, \[data-answer\]'\)/,
  'wrong or invalid bridge attempts return focus to the direct interaction');
assert.match(bridgeApp, /if \(item\.answer\.kind === 'choice'\) return elements\['answer-area'\]\.dataset\.choice \|\| '';/,
  'an untouched comparison is collected as an invalid empty response, not a missing-control error');
for (const item of [bridge.fractionCompare, bridge.fractionOf, bridge.mixedFraction]) {
  assertDistinctSupport(item);
  assert.ok(Array.isArray(item.solution) ? item.solution.length : String(item.solution).trim(), `${item.id}: solution is present`);
  assert.equal(math.isCorrect(item, ''), false, `${item.id}: empty response is invalid`);
}
assert.equal(math.isCorrect(bridge.fractionCompare, bridge.fractionCompare.answer.value), true);
assert.equal(math.isCorrect(bridge.fractionCompare, bridge.fractionCompare.answer.value === '<' ? '>' : '<'), false);
assert.equal(math.isCorrect(bridge.fractionOf, String(bridge.fractionOf.answer.value)), true);
assert.equal(math.isCorrect(bridge.fractionOf, String(bridge.fractionOf.answer.value + 1)), false);
assert.equal(math.isCorrect(bridge.mixedFraction, {
  whole: '1',
  numerator: String(bridge.mixedFraction.answer.value.numerator),
  denominator: String(bridge.mixedFraction.answer.value.denominator),
  piecesMoved: bridge.mixedFraction.data.d
}), true);
assert.equal(math.isCorrect(bridge.mixedFraction, {
  whole: '0',
  numerator: String(bridge.mixedFraction.data.a + bridge.mixedFraction.data.b),
  denominator: String(bridge.mixedFraction.data.d),
  piecesMoved: 0
}), false);
for (let seed = 0; seed < 10000; seed += 1) {
  const item = math.generateExpedition(seed).prompts[0];
  const lengths = item.data.values.map((value) => String(value).length);
  assert.deepEqual(lengths.toSorted(), [5, 5, 6, 6], `${item.id}: exactly two five- and two six-digit crates`);
  assert.notDeepEqual(item.data.values, item.answer.value, `${item.id}: starts shuffled`);
  assert.ok(item.data.firstDifferingPlace && item.data.firstDifferingPlace.left !== item.data.firstDifferingPlace.right, `${item.id}: relevant equal-length scaffold`);
}
let borrowCount = 0, roundUpCount = 0;
const roundingDigits = Array(10).fill(0);
for (let seed = 0; seed < 10000; seed += 1) {
  const byType = Object.fromEntries(math.generateExpedition(seed).prompts.map((item) => [item.type, item]));
  assert.equal(byType.decimalAdd.mechanicData.carry.required, true);
  assert.equal(byType.decimalMultiply.mechanicData.carry.required, true);
  const borrow = byType.decimalSubtract.mechanicData.borrow.required;
  borrowCount += Number(borrow);
  assert.equal(byType.decimalSubtract.hints.some((hint) => hint.toLowerCase().includes('позич')), borrow);
  const deciding = byType.decimalRound.data.cents % 10;
  roundingDigits[deciding] += 1;
  roundUpCount += Number(deciding >= 5);
}
assert.ok(borrowCount >= 4000 && borrowCount <= 6000, `borrow class balance: ${borrowCount}`);
assert.ok(roundUpCount >= 4500 && roundUpCount <= 5500, `rounding classes balance: ${roundUpCount}`);
assert.ok(roundingDigits.every((count) => count >= 700), `all rounding digits occur at least 7%: ${roundingDigits}`);
let restorationState = game.reduce(game.createState(9), { type: 'START' });
for (let challengeIndex = 0; challengeIndex < 23; challengeIndex += 1) {
  restorationState = game.enterChallenge(restorationState, challengeIndex, `c${challengeIndex}`);
  const lessonId = { 4: 'gcd-lcm', 7: 'mixed-fraction', 10: 'decimal-columns', 16: 'equation-balance' }[challengeIndex];
  if (lessonId) {
    const actions = lessonId === 'gcd-lcm' ? ['sharedFactor', 'missingFactor'] : ['recall'];
    actions.forEach((action) => { restorationState = game.reduce(restorationState, { type: 'CHECK_LESSON_CORRECT', action }); });
    restorationState = game.reduce(restorationState, { type: 'CLOSE_LESSON' });
  }
  restorationState = game.reduce(restorationState, { type: 'CHECK_CORRECT', id: `c${challengeIndex}` });
  const snapshot = restorationState.restoration;
  assert.deepEqual(game.reduce(restorationState, { type: 'CHECK_CORRECT', id: `c${challengeIndex}` }).restoration, snapshot, 'success increments once');
}
assert.deepEqual(game.SYSTEMS.map((system) => restorationState.restoration[system]), [3, 2, 3, 7, 2, 6]);
assert.equal(game.isFullyRestored(restorationState), true);
for (const system of game.SYSTEMS) assert.match(initialHtml, new RegExp(`data-system="${system}"`));
assert.match(source('app.js'), /style\.setProperty\(['"]--repair['"]/, 'every success visibly advances the shared world');
assert.match(source('styles.css'), /linear-gradient\([^}]*var\(--repair\)/s, 'world cards expose incremental physical restoration');
assert.match(initialHtml, /data-system="geometryGarden"[\s\S]*data-world-part="garden-bed"[\s\S]*data-world-part="garden-gate"/, 'garden has physical plants and gate');
assert.match(initialCss, /data-system="geometryGarden"\]\[data-level="1"\][^{]*garden-bed/s, 'first garden repair visibly grows plants');
assert.match(initialCss, /data-system="geometryGarden"\]\[data-level="2"\][^{]*garden-gate/s, 'second garden repair visibly opens the gate');
for (const system of game.SYSTEMS) {
  assert.match(initialHtml, new RegExp(`data-system="${system}"[\\s\\S]*?data-world-part=`), `${system}: distinct physical world consequence`);
}
const interactionItems = math.generateExpedition(11).prompts.concat(math.generateExpedition(11).finalPrompts);
assert.ok(new Set(interactionItems.map((item) => item.mechanicData.kind)).size >= 8, 'at least eight primary mechanics');
assert.ok(interactionItems.filter((item) => item.mechanicData.kind !== 'single-field').length >= 17, 'at least 17 direct mechanics');
assert.match(source('app.js'), /const mechanicRenderers\s*=/);
assert.match(source('styles.css'), /\.mechanic-workspace\s*\{/);
const requiredMechanicRenderers = {
  'operation-slots': 'renderOperationSlots',
  'equal-crates': 'renderEqualCrates',
  'gear-toggles': 'renderGearToggles',
  'column-add': 'renderColumnWork',
  'column-subtract': 'renderColumnWork',
  'batch-bins': 'renderBatchBins',
  'division-channels': 'renderDivisionChannels',
  'water-balance': 'renderWaterBalance',
  'formula-routing': 'renderFormulaRouting',
  'balance-boxes': 'renderBalanceBoxes'
};
for (const [kind, renderer] of Object.entries(requiredMechanicRenderers)) {
  assert.match(source('app.js'), new RegExp(`['"]${kind}['"]\\s*:\\s*${renderer}`), `${kind}: concrete renderer is wired`);
}
assert.doesNotMatch(source('app.js'), /Виконати просторовий крок механізму/, 'no generic preparation placeholder');
assert.match(source('app.js'), /if \(mechanicRenderers\[item\.mechanicData\.kind\]\) \{\s*mechanicRenderers\[item\.mechanicData\.kind\]\(item, area\);\s*return;\s*\}/s, 'a concrete mechanic is not followed by a duplicate generic form');
assert.doesNotMatch(source('app.js'), /columns\.forEach\([^)]*item\.answer\.value/s, 'average workspace must not insert the answer');
assert.match(source('app.js'), /field\(['"]transfer['"][\s\S]*?item\.data\.r - item\.data\.q/s, 'average requires a learner-chosen conserving transfer');
assert.ok(source('app.js').includes("querySelector('[data-answer=\"value\"]').value"), 'consequential mechanics read the named final value, not an earlier workspace field');
const dialogueKeys = ['station.enter', 'lesson.ready', 'response.invalid', 'response.wrong', 'hint.1', 'hint.2', 'hint.3', 'support.auto.1', 'support.auto.2', 'support.auto.3', 'challenge.correct.independent', 'challenge.correct.supported', 'station.complete', 'finale.ready', 'finale.complete'];
const dialogueLines = dialogueKeys.map((key) => game.dialogue(key, { station: 'Гавань', system: 'шлях' }));
assert.equal(new Set(dialogueLines).size, dialogueKeys.length, 'Іскра reacts distinctly to bounded events');
assert.ok(dialogueLines.every(Boolean));
assert.match(initialHtml, /class="guide"[^>]*aria-live="polite"/, 'Іскра has a stable polite live region');
for (const key of ['station.enter', 'lesson.ready', 'challenge.correct.independent', 'challenge.correct.supported', 'station.complete', 'finale.ready', 'finale.complete']) {
  assert.match(source('app.js'), new RegExp(`setGuide\\(['"]${key.replaceAll('.', '\\.')}`), `${key}: wired to a UI transition`);
}
assert.match(source('app.js'), /function diagnose\s*\(/);
assert.match(source('app.js'), /function countByStrand\s*\(/);
assert.match(source('app.js'), /hint-button['"]\]\.addEventListener[\s\S]*?reveal-button['"]\]\.hidden = !attemptView\(prompts\[index\]\)\.canReveal[\s\S]*?\}\);/, 'third hint immediately unlocks the worked solution');
let reportState = game.enterChallenge(game.createState(1), 0, 'a');
reportState = game.reduce(reportState, { type: 'REQUEST_HINT', id: 'a', level: 1 });
reportState = game.reduce(reportState, { type: 'CHECK_CORRECT', id: 'a' });
assert.deepEqual(game.report(reportState).supported, ['a']);
assert.equal(game.report(reportState).independent.length, 0);
let pacing = game.enterChallenge(game.createState(3), 4, 'gcd-lcm');
pacing = game.reduce(pacing, { type: 'CHECK_LESSON_CORRECT', action: 'sharedFactor' });
pacing = game.reduce(pacing, { type: 'CHECK_LESSON_CORRECT', action: 'missingFactor' });
pacing = game.reduce(pacing, { type: 'CLOSE_LESSON' });
pacing = game.reduce(pacing, { type: 'SET_PACING_MODE', mode: 'iskraAssist' });
pacing = game.reduce(pacing, { type: 'PACING_READY', now: 1000 });
assert.deepEqual(game.dueSupport(pacing, 90999), []);
assert.deepEqual(game.dueSupport(pacing, 91000), [1]);
pacing = game.reduce(pacing, { type: 'AUTO_SUPPORT_DUE', id: 'gcd-lcm', level: 1 });
assert.deepEqual(game.dueSupport(pacing, 91000), [], 'automatic hint never repeats');
pacing = game.reduce(pacing, { type: 'VISIBILITY_PAUSE', now: 92000 });
assert.deepEqual(game.dueSupport(pacing, 400000), [], 'hidden document pauses support');
pacing = game.reduce(pacing, { type: 'VISIBILITY_RESUME', now: 400000 });
assert.deepEqual(game.dueSupport(pacing, 488999), []);
assert.deepEqual(game.dueSupport(pacing, 489000), [2]);
const stalePacing = game.reduce(pacing, { type: 'AUTO_SUPPORT_DUE', id: 'gcd-lcm', level: 2, runToken: pacing.runToken + 1, challengeToken: pacing.challengeToken });
assert.deepEqual(stalePacing, pacing, 'stale timer callback ignored');
let untimed = game.enterChallenge(game.createState(4), 4, 'gcd-lcm');
untimed = game.reduce(untimed, { type: 'PACING_READY', now: 0 });
assert.deepEqual(game.dueSupport(untimed, 999999), [], 'Без поспіху is default');
assert.match(source('app.js'), /let pacingFrame = null/);
assert.match(source('app.js'), /cancelAnimationFrame\(pacingFrame\)/, 'teardown cancels pending readiness frame');
assert.match(source('app.js'), /const pacingRunToken = gameState\.runToken[\s\S]*?const pacingChallengeToken = gameState\.challengeToken[\s\S]*?runToken: pacingRunToken, challengeToken: pacingChallengeToken/s, 'pacing callbacks dispatch immutable captured tokens');
assert.match(source('app.js'), /if \(math\.isCorrect\(item, response\)\) \{[\s\S]*?clearPacing\(\);[\s\S]*?type: 'CHECK_CORRECT'/s, 'correct completion cancels pending pacing work before state transition');
assert.match(source('app.js'), /reveal-button['"]\]\.addEventListener[\s\S]*?clearPacing\(\);[\s\S]*?type: 'REVEAL_SOLUTION'/s, 'worked-solution completion cancels pending pacing work');
const prematureFinale = game.reduce(game.createState(1), { type: 'FINALE_PLAY' });
assert.equal(prematureFinale.finale.lampLit, false);
assert.match(initialHtml, /id="lighthouse-scene"[^>]*role="img"/);
assert.match(sceneCss, /\.lighthouse-scene\.is-lit \.beam[^}]*animation:[^;}]*1\.6s/s);
assert.match(source('styles.css'), /@media \(prefers-reduced-motion: reduce\)/);
assert.match(sceneCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(initialHtml, /id="finale-status"[^>]*>Маяк запалено — промінь освітлює шлях</);
assert.match(initialHtml, /class="finale-scene"[^>]*aria-hidden="true"/);
let replayState = game.createState(6);
for (let challengeIndex = 0; challengeIndex < 3; challengeIndex += 1) {
  replayState = game.enterChallenge(replayState, challengeIndex, `route-${challengeIndex}`);
  replayState = game.reduce(replayState, { type: 'CHECK_CORRECT', id: `route-${challengeIndex}` });
}
const canonicalBeforeReplay = JSON.stringify({ restoration: replayState.restoration, attempts: replayState.attemptsById });
replayState = game.reduce(replayState, { type: 'START_PRACTICE_REPLAY', station: 0, id: 'practice-route-0' });
assert.equal(replayState.practiceReplay.active, true);
replayState = game.reduce(replayState, { type: 'CHECK_CORRECT', id: 'practice-route-0' });
assert.equal(JSON.stringify({ restoration: replayState.restoration, attempts: replayState.attemptsById }), canonicalBeforeReplay, 'practice never mutates canonical state');
replayState = game.reduce(replayState, { type: 'END_PRACTICE_REPLAY' });
assert.equal(replayState.practiceReplay.active, false);
let unfinishedState = game.enterChallenge(replayState, 3, 'divisibility');
unfinishedState = game.reduce(unfinishedState, { type: 'CHECK_CORRECT', id: 'divisibility' });
assert.equal(game.reduce(unfinishedState, { type: 'START_PRACTICE_REPLAY', station: 0 }).practiceReplay.active, false, 'replay unavailable during unfinished canonical station');
function checkPrompt(prompt) {
  assert.ok(prompt.id && prompt.strand && prompt.question && prompt.answer && prompt.hints.length >= 2 && prompt.solution);
  assertDistinctSupport(prompt);
  assert.ok(!JSON.stringify(prompt.question).includes('undefined'));
  assert.equal(typeof prompt.validate, 'function', `${prompt.id}: validity predicate`);
  assert.equal(prompt.validate(prompt.data), true, `${prompt.id}: generated instance valid`);
  assert.equal(typeof prompt.oracle, 'function', `${prompt.id}: independent answer oracle`);
  assert.deepEqual(prompt.oracle(prompt.data), prompt.answer.value, `${prompt.id}: oracle agrees`);
  if (!fractionTypes.has(prompt.type)) assert.ok(String(prompt.solution).includes(String(prompt.answer.display)), `${prompt.id}: solution must contain display answer`);
}

assert.equal(math.normalizeSeed(0), 0x6d2b79f5);
assert.equal(math.normalizeSeed(0xffffffff), 0xffffffff);
assert.equal(JSON.stringify(math.generateExpedition(1)), JSON.stringify(math.generateExpedition(1)));
assert.notEqual(JSON.stringify(math.generateExpedition(1)), JSON.stringify(math.generateExpedition(2)));
assert.equal(math.parseInteger(' 42 '), 42);
assert.equal(math.parseInteger('-2'), null);
assert.equal(math.parseHundredths('16,35'), 1635);
assert.equal(math.parseHundredths('16.35'), 1635);
assert.equal(math.parseHundredths('1.234'), null);
assert.equal(math.formatHundredths(270, true), '2,70');
assert.equal(math.formatHundredths(270, false), '2,7');

const fixed = math.fixedExamples();
assert.deepEqual(fixed.naturalOrder, [40125, 40215, 42015, 42105]);
assert.equal(fixed.precedence, 339);
assert.deepEqual(fixed.remainder, { quotient: 36, remainder: 5 });
assert.deepEqual(fixed.divisibility, [3, 5, 9]);
assert.deepEqual(fixed.gcdLcm, { gcd: 8, lcm: 120 });
assert.equal(fixed.fractionCompare, '>');
assert.equal(fixed.fractionOf, 24);
assert.deepEqual(fixed.mixedFraction, { whole: 1, numerator: 2, denominator: 7 });
assert.equal(fixed.decimalAdd, 1635);
assert.equal(fixed.decimalMultiply, 2880);
assert.equal(fixed.decimalDivide, 270);
assert.equal(fixed.average, 510);
assert.deepEqual(fixed.rectangle, { perimeter: 26, area: 40 });
assert.equal(fixed.equationA, 6);
assert.equal(fixed.equationB, 8);

const boundarySeeds = [0, 1, 2, 0x6d2b79f5, 0x7fffffff, 0xffffffff];
for (const seed of boundarySeeds) math.generateExpedition(seed).prompts.forEach(checkPrompt);

let sawEquationOffsetAbove20 = false;
for (let seed = 0; seed < 10000; seed += 1) {
  const expedition = math.generateExpedition(seed);
  assert.equal(expedition.prompts.length, 17);
  assert.equal(expedition.finalPrompts.length, 6);
  expedition.prompts.concat(expedition.finalPrompts).forEach(checkPrompt);
  const byType = Object.fromEntries(expedition.prompts.map((item) => [item.type, item]));

  const order = byType.naturalOrder.data.values;
  assert.equal(new Set(order).size, 4);
  assert.ok(order.every((value) => value >= 10000 && value <= 999999));
  assert.deepEqual(byType.naturalOrder.answer.value, [...order].sort((a, b) => a - b));

  const p = byType.precedence.data;
  assert.notEqual(p.e, 0);
  assert.equal(p.d % p.e, 0);
  assert.equal(byType.precedence.answer.value, p.a + p.b * p.c - p.d / p.e);
  assert.ok(byType.precedence.answer.value >= 1 && byType.precedence.answer.value <= 999);

  const rem = byType.remainder.data;
  assert.ok(rem.r > 0 && rem.r < rem.d);
  assert.equal(rem.N, rem.d * rem.q + rem.r);

  const div = byType.divisibility.data;
  const oracleRules = [2, 3, 5, 9, 10].filter((rule) => div.n % rule === 0);
  assert.deepEqual(byType.divisibility.answer.value, oracleRules);
  assert.ok(oracleRules.length >= 2 && oracleRules.length <= 4);

  const pair = byType.gcdLcm.data;
  assert.equal(byType.gcdLcm.answer.value.gcd, gcd(pair.A, pair.B));
  assert.equal(byType.gcdLcm.answer.value.lcm, lcmByMultiples(pair.A, pair.B));
  assert.ok(pair.A <= 120 && pair.B <= 120);
  assert.ok(pair.factorsA.length >= 4 && pair.factorsA.length <= 8);
  assert.ok(pair.factorsB.length >= 4 && pair.factorsB.length <= 8);
  assert.equal(pair.factorsA.reduce((product, factor) => product * factor, 1), pair.A);
  assert.equal(pair.factorsB.reduce((product, factor) => product * factor, 1), pair.B);
  assert.equal(pair.commonFactors.reduce((product, factor) => product * factor, 1), byType.gcdLcm.answer.value.gcd);
  assert.equal(pair.lcmFactors.reduce((product, factor) => product * factor, 1), byType.gcdLcm.answer.value.lcm);

  const compare = byType.fractionCompare.data;
  assert.notEqual(compare.a, compare.b);
  assert.equal(byType.fractionCompare.answer.value, compare.a > compare.b ? '>' : '<');

  const fraction = byType.fractionOf.data;
  assert.equal(fraction.T % fraction.d, 0);
  assert.equal(byType.fractionOf.answer.value * fraction.d, fraction.n * fraction.T);

  const mixed = byType.mixedFraction.data;
  const remainder = mixed.a + mixed.b - mixed.d;
  assert.ok(mixed.a + mixed.b > mixed.d && mixed.a + mixed.b < 2 * mixed.d);
  assert.equal(gcd(remainder, mixed.d), 1);
  assert.deepEqual(byType.mixedFraction.answer.value, { whole: 1, numerator: remainder, denominator: mixed.d });

  for (const type of ['decimalAdd', 'decimalSubtract', 'decimalMultiply', 'decimalDivide']) {
    assert.ok(byType[type].answer.value >= 0 && byType[type].answer.value <= 9999);
  }
  assert.equal(byType.decimalAdd.answer.value, byType.decimalAdd.data.x + byType.decimalAdd.data.y);
  assert.equal(byType.decimalSubtract.answer.value, byType.decimalSubtract.data.x - byType.decimalSubtract.data.y);
  assert.equal(byType.decimalMultiply.answer.value, byType.decimalMultiply.data.x * byType.decimalMultiply.data.m);
  assert.equal(byType.decimalDivide.data.x, byType.decimalDivide.answer.value * byType.decimalDivide.data.d);

  const comparison = byType.decimalCompare.data;
  assert.notEqual(comparison.x, comparison.y);
  assert.equal(byType.decimalCompare.answer.value, comparison.x > comparison.y ? '>' : '<');
  const rounding = byType.decimalRound.data.cents;
  assert.equal(byType.decimalRound.answer.value, Math.floor((rounding + 5) / 10) * 10);

  const avg = byType.average.data;
  assert.equal(avg.p + avg.q + avg.r, 3 * byType.average.answer.value);
  assert.equal(new Set([avg.p, avg.q, avg.r]).size, 3);

  const rect = byType.rectangle.data;
  assert.notEqual(rect.a, rect.b);
  assert.equal(byType.rectangle.answer.value.perimeter, rect.a + rect.b + rect.a + rect.b);
  assert.equal(byType.rectangle.answer.value.area, Array(rect.a).fill(rect.b).reduce((sum, item) => sum + item, 0));

  const equation = byType.equation.data;
  if (equation.a > 20) sawEquationOffsetAbove20 = true;
  assert.equal(equation.m * byType.equation.answer.value + equation.a, equation.b);
  assert.ok(equation.b <= 200);
}
assert.equal(sawEquationOffsetAbove20, true, 'equation generator reaches the reviewed offset range above 20 when valid');

for (let d = 3; d <= 12; d += 1) {
  for (let q = 12; q <= 60; q += 1) for (let r = 1; r < d; r += 1) {
    const N = d * q + r;
    assert.equal(Math.floor(N / d), q);
    assert.equal(N % d, r);
  }
  for (let a = 1; a < d; a += 1) for (let b = 1; b < d; b += 1) {
    if (a !== b) assert.equal(Math.sign(a / d - b / d), Math.sign(a - b));
    const rest = a + b - d;
    if (rest > 0 && a + b < 2 * d && gcd(rest, d) === 1) assert.deepEqual({ whole: 1, numerator: rest, denominator: d }, { whole: 1, numerator: a + b - d, denominator: d });
  }
}
for (let cents = 10; cents <= 9999; cents += 1) assert.equal(Math.floor((cents + 5) / 10) * 10, Math.round(cents / 10) * 10);
for (let a = 3; a <= 20; a += 1) for (let b = 3; b <= 20; b += 1) if (a !== b) {
  assert.equal(2 * (a + b), a + b + a + b);
  assert.equal(a * b, Array(a).fill(b).reduce((sum, value) => sum + value, 0));
}

assert.equal(math.classifyAttempt({ correct: true, wrongChecks: 0, hintsUsed: 0, solutionRevealed: false }), 'strength');
assert.equal(math.classifyAttempt({ correct: true, wrongChecks: 3, hintsUsed: 2, solutionRevealed: false }), 'developing');
assert.equal(math.classifyAttempt({ correct: true, wrongChecks: 4, hintsUsed: 2, solutionRevealed: true }), 'revisit');
assert.equal(math.classifyAttempt({ correct: false, wrongChecks: 6, hintsUsed: 2, solutionRevealed: false }), null);
let attempt = math.initialAttempt();
attempt = math.reduceAttempt(attempt, 'hint');
attempt = math.reduceAttempt(attempt, 'hint');
attempt = math.reduceAttempt(attempt, 'hint');
attempt = math.reduceAttempt(attempt, 'hint');
assert.equal(attempt.hintsUsed, 3, 'hints cap at three');
for (let count = 0; count < 6; count += 1) attempt = math.reduceAttempt(attempt, 'wrong');
assert.equal(attempt.wrongChecks, 6);
assert.equal(math.canReveal(attempt), true);
attempt = math.reduceAttempt(attempt, 'reveal');
assert.equal(math.classifyAttempt(attempt), 'revisit');
assert.deepEqual(math.reduceAttempt(attempt, 'correct'), attempt, 'completed attempt cannot double-score');
assert.equal(math.canReveal(math.reduceAttempt(math.reduceAttempt(math.reduceAttempt(math.initialAttempt(), 'wrong'), 'wrong'), 'wrong')), true);
const sample = Object.fromEntries(math.generateExpedition(1).prompts.map((item) => [item.type, item]));
assert.equal(math.isCorrect(sample.precedence, String(sample.precedence.answer.value)), false, 'console preparation is consequential');
assert.equal(math.isCorrect(sample.precedence, { value: String(sample.precedence.answer.value), mechanicComplete: true }), true);
assert.equal(math.isCorrect(sample.decimalDivide, { value: sample.decimalDivide.answer.display.replace(',', '.'), mechanicComplete: true }), true);
assert.equal(math.isCorrect(sample.remainder, { quotient: String(sample.remainder.answer.value.quotient), remainder: String(sample.remainder.answer.value.remainder) }), false);
assert.equal(math.isCorrect(sample.remainder, { quotient: String(sample.remainder.answer.value.quotient), remainder: String(sample.remainder.answer.value.remainder), grouped: false }), false, 'remainder fields alone do not repair the crates');
assert.equal(math.isCorrect(sample.remainder, { quotient: String(sample.remainder.answer.value.quotient), remainder: String(sample.remainder.answer.value.remainder), grouped: true }), true);
assert.equal(math.isCorrect(sample.rectangle, { perimeter: String(sample.rectangle.answer.value.perimeter), area: String(sample.rectangle.answer.value.area), routed: false }), false, 'rectangle values alone do not route fence and soil');
assert.equal(math.isCorrect(sample.rectangle, { perimeter: String(sample.rectangle.answer.value.perimeter), area: String(sample.rectangle.answer.value.area), routed: true }), true);
assert.equal(math.isCorrect(sample.mixedFraction, { whole: '1', numerator: String(sample.mixedFraction.answer.value.numerator), denominator: String(sample.mixedFraction.answer.value.denominator) }), false, 'mixed-number cells must agree with direct pieces');
assert.equal(math.isCorrect(sample.mixedFraction, { whole: '1', numerator: String(sample.mixedFraction.answer.value.numerator), denominator: String(sample.mixedFraction.answer.value.denominator), piecesMoved: sample.mixedFraction.data.d }), true);
assert.equal(math.isCorrect(sample.gcdLcm, { gcd: String(sample.gcdLcm.answer.value.gcd), lcm: String(sample.gcdLcm.answer.value.lcm) }), false, 'numeric GCD/LCM fields alone are insufficient');
assert.equal(math.isCorrect(sample.gcdLcm, { gcd: String(sample.gcdLcm.answer.value.gcd), lcm: String(sample.gcdLcm.answer.value.lcm), factorsA: sample.gcdLcm.data.factorsA, factorsB: sample.gcdLcm.data.factorsB, commonFactors: sample.gcdLcm.data.commonFactors, lcmFactors: sample.gcdLcm.data.lcmFactors }), true);
assert.equal(math.isCorrect(sample.precedence, ''), false);
const validOrder = sample.naturalOrder.answer.value.join(' < ');
assert.equal(math.isCorrect(sample.naturalOrder, validOrder), true);
assert.equal(math.isCorrect(sample.naturalOrder, sample.naturalOrder.answer.value.join(', ')), true);
assert.equal(math.isCorrect(sample.naturalOrder, `junk${validOrder}`), false);
assert.equal(math.isCorrect(sample.naturalOrder, `${validOrder}junk`), false);
assert.equal(math.isCorrect(sample.naturalOrder, validOrder.replace(' < ', ' abc ')), false);
assert.equal(math.isCorrect(sample.naturalOrder, `${validOrder} < 9999999`), false);
for (let wrongChecks = 0; wrongChecks <= 6; wrongChecks += 1) for (let hintsUsed = 0; hintsUsed <= 3; hintsUsed += 1) {
  const base = { correct: false, wrongChecks, hintsUsed, solutionRevealed: false };
  const correct = math.reduceAttempt(base, 'correct');
  assert.equal(math.classifyAttempt(correct), wrongChecks === 0 && hintsUsed === 0 ? 'strength' : 'developing');
  if (wrongChecks >= 3 || hintsUsed >= 3) assert.equal(math.classifyAttempt(math.reduceAttempt(base, 'reveal')), 'revisit');
  else assert.equal(math.classifyAttempt(math.reduceAttempt(base, 'reveal')), null);
}
assert.throws(() => math.randInt(() => 0, 2, 1));
console.log('PASS: fixed answers, boundaries, reducers, and 10,000 seeds per generator family');
