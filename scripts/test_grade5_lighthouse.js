'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const math = require('../activities/math/06-grade5-lighthouse/generator.js');
const game = require('../activities/math/06-grade5-lighthouse/game-model.js');

const root = path.join(__dirname, '../activities/math/06-grade5-lighthouse');
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const boundarySeeds = [0, 1, 2, 0x6d2b79f5, 0x7fffffff, 0xffffffff];

function oracle(item) {
  const data = item.data;
  if (item.id === 'operations') return data.a + data.b * data.c - data.d / data.e;
  if (item.id === 'divisibility') return math.DIVISORS.filter((value) => data.number % value === 0);
  if (item.id === 'fraction') return (data.numerator * data.total) / data.denominator;
  if (item.id === 'decimal') return data.left + data.right;
  if (item.id === 'rectangle') return { perimeter: data.width + data.height + data.width + data.height, area: data.width * data.height };
  if (item.id === 'equation') return (data.result - data.offset) / data.multiplier;
  throw new Error(`unknown item ${item.id}`);
}

function checkGame(seed) {
  const generated = math.generateItems(seed);
  assert.equal(generated.items.length, 6);
  assert.deepEqual(generated.items.map((item) => item.id), ['operations', 'divisibility', 'fraction', 'decimal', 'rectangle', 'equation']);
  assert.equal(JSON.stringify(generated), JSON.stringify(math.generateItems(seed)), `${seed}: deterministic replay`);
  generated.items.forEach((item) => assert.deepEqual(item.answer, oracle(item), `${seed}:${item.id} independent oracle`));

  const [operations, divisibility, fraction, decimal, rectangle, equation] = generated.items;
  assert.ok(operations.data.a >= 100 && operations.data.a <= 500);
  assert.ok(operations.data.b >= 2 && operations.data.b <= 20);
  assert.ok(operations.data.c >= 2 && operations.data.c <= 20);
  assert.ok(operations.data.e >= 2 && operations.data.e <= 9);
  assert.equal(operations.data.d % operations.data.e, 0);
  assert.ok(operations.answer > 0 && operations.answer <= 999);
  assert.ok(divisibility.data.number >= 100 && divisibility.data.number <= 999);
  assert.ok(divisibility.answer.length >= 2 && divisibility.answer.length <= 4);
  assert.deepEqual(divisibility.options, [2, 3, 5, 9, 10]);
  assert.equal(new Set(divisibility.options).size, 5);
  assert.ok(fraction.data.numerator >= 1 && fraction.data.numerator < fraction.data.denominator);
  assert.ok(fraction.data.denominator >= 2 && fraction.data.denominator <= 10);
  assert.equal(fraction.data.total % fraction.data.denominator, 0);
  assert.ok((decimal.data.left % 10) + (decimal.data.right % 10) >= 10, 'hundredths carry required');
  assert.ok(decimal.answer <= 9999);
  assert.ok(rectangle.data.width >= 3 && rectangle.data.width <= 20);
  assert.ok(rectangle.data.height >= 3 && rectangle.data.height <= 20);
  assert.notEqual(rectangle.data.width, rectangle.data.height);
  assert.ok(equation.answer >= 2 && equation.answer <= 20);
  assert.ok(equation.data.multiplier >= 2 && equation.data.multiplier <= 9);
  assert.ok(equation.data.offset >= 1 && equation.data.offset <= 30);
}

boundarySeeds.forEach(checkGame);
for (let seed = 0; seed < 10000; seed += 1) checkGame(seed);

assert.equal(math.parseInteger(' 42 '), 42);
for (const invalid of ['', ' ', '-1', '+1', '1.0', '1e2', '1 000', '１２']) assert.equal(math.parseInteger(invalid), null, `invalid integer: ${invalid}`);
assert.equal(math.parseHundredths(' 12,30 '), 1230);
assert.equal(math.parseHundredths('12.3'), 1230);
for (const invalid of ['', '-', '+1', '.5', '1.', '1,234', '1e2', '1 000,00', '1,2,3']) assert.equal(math.parseHundredths(invalid), null, `invalid decimal: ${invalid}`);

const sample = math.generateItems(1).items;
assert.equal(math.inspectResponse(sample[0], '').kind, 'empty');
assert.equal(math.inspectResponse(sample[0], 'abc').kind, 'invalid');
assert.equal(math.inspectResponse(sample[0], String(sample[0].answer + 1)).kind, 'wrong');
assert.equal(math.inspectResponse(sample[0], ` ${sample[0].answer} `).kind, 'correct');
assert.equal(math.inspectResponse(sample[1], sample[1].answer.map(String)).kind, 'correct');
assert.equal(math.inspectResponse(sample[1], []).kind, 'empty');
assert.equal(math.inspectResponse(sample[3], math.formatHundredths(sample[3].answer)).kind, 'correct');
assert.equal(math.inspectResponse(sample[3], math.formatHundredths(sample[3].answer).replace(',', '.')).kind, 'correct');
assert.equal(math.inspectResponse(sample[4], { perimeter: String(sample[4].answer.perimeter), area: String(sample[4].answer.area) }).kind, 'correct');
assert.deepEqual(math.inspectResponse(sample[4], { perimeter: '', area: '' }), { kind: 'empty', field: 'perimeter' });
assert.deepEqual(math.inspectResponse(sample[4], { perimeter: String(sample[4].answer.perimeter), area: '' }), { kind: 'empty', field: 'area' });
assert.deepEqual(math.inspectResponse(sample[4], { perimeter: 'abc', area: '1' }), { kind: 'invalid', field: 'perimeter' });
assert.deepEqual(math.inspectResponse(sample[4], { perimeter: String(sample[4].answer.perimeter), area: 'abc' }), { kind: 'invalid', field: 'area' });
assert.deepEqual(math.inspectResponse(sample[4], { perimeter: String(sample[4].answer.perimeter + 1), area: String(sample[4].answer.area) }), { kind: 'wrong', field: 'perimeter' });
assert.deepEqual(math.inspectResponse(sample[4], { perimeter: String(sample[4].answer.perimeter), area: String(sample[4].answer.area + 1) }), { kind: 'wrong', field: 'area' });
assert.equal(math.inspectResponse(sample[1], sample[1].answer.slice(0, -1).map(String)).kind, 'wrong');
assert.equal(math.inspectResponse(sample[1], [...sample[1].answer, sample[1].answer[0]].map(String)).kind, 'invalid');
assert.equal(math.inspectResponse(sample[2], String(sample[2].answer)).kind, 'correct');
assert.equal(math.inspectResponse(sample[5], String(sample[5].answer)).kind, 'correct');

let state = game.createState(1);
const initialScene = game.selectScene(state);
state = game.reduce(state, { type: 'HINT' });
assert.deepEqual(game.selectScene(state), initialScene, 'hint does not change scene');
assert.equal(game.reduce(state, { type: 'HINT' }), state, 'hint reveals once');
state = game.reduce(state, { type: 'CHECK_INCORRECT' });
assert.deepEqual(game.selectScene(state), initialScene, 'wrong does not change scene');
assert.equal(game.reduce(state, { type: 'NEXT' }), state, 'Next is unavailable before correctness');
state = game.reduce(state, { type: 'CHECK_CORRECT' });
assert.equal(state.stage, 1);
assert.equal(state.phase, 'correct');
assert.equal(game.reduce(state, { type: 'CHECK_CORRECT' }), state, 'correct scores once');
state = game.reduce(state, { type: 'NEXT' });
assert.equal(state.index, 1);
assert.equal(state.stage, 1);
assert.equal(state.phase, 'ready');
assert.equal(state.hintShown, false);
state = game.reduce(state, { type: 'FAIL' });
assert.deepEqual({ index: state.index, stage: state.stage, phase: state.phase, hintShown: state.hintShown }, { index: 0, stage: 0, phase: 'failure', hintShown: false });

state = game.createState(2);
for (let index = 0; index < game.TOTAL; index += 1) {
  state = game.reduce(state, { type: 'CHECK_CORRECT' });
  assert.equal(state.stage, index + 1, `question ${index + 1}: stage advances exactly once`);
  assert.equal(state.phase, index === game.TOTAL - 1 ? 'finale' : 'correct');
  assert.equal(game.reduce(state, { type: 'CHECK_CORRECT' }), state, `question ${index + 1}: duplicate scoring ignored`);
  if (index < game.TOTAL - 1) state = game.reduce(state, { type: 'NEXT' });
}
const finale = state;
assert.equal(game.reduce(finale, { type: 'NEXT' }), finale, 'finale is persistent');
state = game.reduce(finale, { type: 'RESET', seed: 3 });
assert.deepEqual({ seed: state.seed, index: state.index, stage: state.stage, phase: state.phase, hintShown: state.hintShown }, { seed: 3, index: 0, stage: 0, phase: 'ready', hintShown: false });

const html = source('index.html');
const app = source('app.js');
const css = `${source('styles.css')}\n${source('lighthouse-scene.css')}`;
assert.equal((html.match(/Розв’яжи 6 завдань — кожна правильна відповідь засвітить маяк\./g) || []).length, 1, 'one instruction');
assert.equal((html.match(/Завдання 1 з 6/g) || []).length, 1, 'one progress label');
for (const action of ['Перевірити', 'Підказка', 'Далі', 'Нова гра']) assert.match(html, new RegExp(`>${action}<`));
assert.match(html, /default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'none'/);
assert.match(html, /lighthouse-base\.webp/);
assert.match(html, /class="window-light window-light-5"/);
assert.match(app, /function focusAnswer\(field\)/, 'incorrect responses return focus to an answer control');
assert.match(app, /focusAnswer\(result\.field\)/, 'multi-field errors focus the relevant answer');
assert.match(app, /elements\['activity-context'\]\.hidden = true/, 'finale and failure hide the setup context');
assert.match(app, /elements\['question-title'\]\.focus\(\)/, 'Next focuses the new question heading');
assert.match(app, /elements\['finale-title'\]\.focus\(\)/, 'finale receives focus');
assert.match(app, /\$\{token\.numerator\} із \$\{token\.denominator\} рівних частин/, 'stacked fraction has a clear accessible name');
assert.doesNotMatch(app, /других/, 'stacked fraction accessible name uses correct Ukrainian');
assert.match(css, /min-height:\s*48px/g);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(`${html}\n${app}`, /\b(?:localStorage|sessionStorage|indexedDB|serviceWorker|fetch|XMLHttpRequest|document\.cookie)\b/);
assert.doesNotMatch(`${html}\n${app}\n${css}`, /https?:\/\//);
for (const obsolete of ['Поточна станція', 'Маршрут', 'система маяка', 'експедиція', 'контрольна кімната', 'Іскра', 'підсумок']) {
  assert.doesNotMatch(`${html}\n${app}`, new RegExp(obsolete, 'i'), `obsolete concept: ${obsolete}`);
}

const asset = path.join(root, 'lighthouse-base.webp');
assert.equal(fs.existsSync(asset), true, 'local image exists');
assert.ok(fs.statSync(asset).size <= 700 * 1024, 'local image is at most 700KB');

console.log('PASS: six-family generator, scorer, slice lifecycle, static privacy and UX contracts across 10,000 seeds');