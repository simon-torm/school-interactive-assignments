'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const math = require('../activities/math/07-grade4-lighthouse/generator.js');
const game = require('../activities/math/07-grade4-lighthouse/game-model.js');
const scene = require('../activities/math/07-grade4-lighthouse/lighthouse-scene.js');

const root = path.join(__dirname, '../activities/math/07-grade4-lighthouse');
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const boundarySeeds = [0, 1, 2, 0x6d2b79f5, 0x7fffffff, 0xffffffff];
const expectedIds = ['place-value', 'operations', 'fraction', 'movement', 'rectangle', 'equation'];
const equationKinds = new Set();

function oracle(item) {
  const data = item.data;
  if (item.id === 'place-value') return data.terms.reduce((sum, value) => sum + value, 0);
  if (item.id === 'operations') return data.a + data.b * data.c - data.d / data.e;
  if (item.id === 'fraction') return (data.numerator * data.total) / data.denominator;
  if (item.id === 'movement') return data.speed * data.time;
  if (item.id === 'rectangle') return { perimeter: 2 * (data.width + data.height), area: data.width * data.height };
  if (item.id === 'equation') {
    equationKinds.add(data.kind);
    if (data.kind === 'addend') return data.result - data.known;
    if (data.kind === 'minuend') return data.result + data.known;
    if (data.kind === 'factor') return data.result / data.known;
    if (data.kind === 'dividend') return data.result * data.known;
  }
  throw new Error(`unknown item ${item.id}`);
}

function checkGame(seed) {
  const generated = math.generateItems(seed);
  assert.equal(generated.items.length, 6);
  assert.deepEqual(generated.items.map((item) => item.id), expectedIds);
  assert.equal(JSON.stringify(generated), JSON.stringify(math.generateItems(seed)), `${seed}: deterministic replay`);
  generated.items.forEach((item) => {
    assert.deepEqual(item.answer, oracle(item), `${seed}:${item.id} independent oracle`);
    assert.equal(item.hints.length, 2, `${seed}:${item.id} has two progressive hints`);
    assert.ok(item.hints.every((hint) => typeof hint === 'string' && hint.length >= 20));
    assert.ok(typeof item.diagnostic === 'string' && item.diagnostic.length >= 20);
  });

  const [placeValue, operations, fraction, movement, rectangle, equation] = generated.items;
  assert.ok(placeValue.answer >= 100000 && placeValue.answer <= 999999);
  assert.equal(new Set(placeValue.data.terms).size, placeValue.data.terms.length);
  assert.ok(placeValue.data.terms.length >= 4 && placeValue.data.terms.length <= 5);
  assert.equal(placeValue.data.terms.reduce((sum, value) => sum + value, 0), placeValue.answer);
  assert.match(placeValue.prompt, /^Утвори число із розрядних доданків: /);

  assert.ok(operations.data.a >= 1000 && operations.data.a <= 10000);
  assert.ok(operations.data.b >= 10 && operations.data.b <= 99);
  assert.ok(operations.data.c >= 2 && operations.data.c <= 9);
  assert.ok(operations.data.e >= 2 && operations.data.e <= 9);
  assert.equal(operations.data.d % operations.data.e, 0);
  assert.ok(operations.answer > 0 && operations.answer <= 999999);

  assert.ok(fraction.data.numerator >= 1 && fraction.data.numerator < fraction.data.denominator);
  assert.ok(fraction.data.denominator >= 2 && fraction.data.denominator <= 10);
  assert.equal(fraction.data.total % fraction.data.denominator, 0);
  assert.ok(fraction.data.total <= 2000);

  assert.ok(movement.data.speed >= 20 && movement.data.speed <= 90);
  assert.ok(movement.data.time >= 2 && movement.data.time <= 9);
  assert.equal(movement.answer, movement.data.speed * movement.data.time);
  assert.match(movement.prompt, /км\/год/);
  assert.match(movement.prompt, /кілометрів пройде/);

  assert.ok(rectangle.data.width >= 3 && rectangle.data.width <= 30);
  assert.ok(rectangle.data.height >= 3 && rectangle.data.height <= 30);
  assert.notEqual(rectangle.data.width, rectangle.data.height);
  assert.deepEqual(rectangle.answer, { perimeter: 2 * (rectangle.data.width + rectangle.data.height), area: rectangle.data.width * rectangle.data.height });

  assert.ok(equation.answer >= 2 && equation.answer <= 99);
  assert.ok(['addend', 'minuend', 'factor', 'dividend'].includes(equation.data.kind));
  assert.match(equation.prompt, /^Розв’яжи рівняння: /);
}

boundarySeeds.forEach(checkGame);
for (let seed = 0; seed < 10000; seed += 1) checkGame(seed);
assert.deepEqual(equationKinds, new Set(['addend', 'minuend', 'factor', 'dividend']), 'all unknown-component boundary classes generated');

assert.equal(math.parseWhole(' 725308 '), 725308);
assert.equal(math.parseWhole('725 308'), 725308);
assert.equal(math.parseWhole('725\u00a0308'), 725308);
assert.equal(math.parseWhole('725\u202f308'), 725308);
for (const invalid of ['', ' ', '-1', '+1', '1.0', '1e2', '72 5308', '7 25 308', '１２']) {
  assert.equal(math.parseWhole(invalid), null, `invalid whole number: ${invalid}`);
}

const sample = math.generateItems(1).items;
for (const item of sample) {
  if (item.type === 'rectangle') continue;
  assert.equal(math.inspectResponse(item, '').kind, 'empty');
  assert.equal(math.inspectResponse(item, 'abc').kind, 'invalid');
  assert.equal(math.inspectResponse(item, String(item.answer + 1)).kind, 'wrong');
  assert.equal(math.inspectResponse(item, math.formatWhole(item.answer)).kind, 'correct');
  assert.equal(math.inspectResponse(item, String(item.answer)).kind, 'correct');
}
assert.equal(math.inspectResponse(sample[4], { perimeter: String(sample[4].answer.perimeter), area: String(sample[4].answer.area) }).kind, 'correct');
assert.deepEqual(math.inspectResponse(sample[4], { perimeter: '', area: '' }), { kind: 'empty', field: 'perimeter' });
assert.deepEqual(math.inspectResponse(sample[4], { perimeter: String(sample[4].answer.perimeter), area: '' }), { kind: 'empty', field: 'area' });
assert.deepEqual(math.inspectResponse(sample[4], { perimeter: 'abc', area: '1' }), { kind: 'invalid', field: 'perimeter' });
assert.deepEqual(math.inspectResponse(sample[4], { perimeter: String(sample[4].answer.perimeter), area: 'abc' }), { kind: 'invalid', field: 'area' });
assert.deepEqual(math.inspectResponse(sample[4], { perimeter: String(sample[4].answer.perimeter + 1), area: String(sample[4].answer.area) }), { kind: 'wrong', field: 'perimeter' });
assert.deepEqual(math.inspectResponse(sample[4], { perimeter: String(sample[4].answer.perimeter), area: String(sample[4].answer.area + 1) }), { kind: 'wrong', field: 'area' });

let state = game.createState(1);
const initialScene = game.selectScene(state);
state = game.reduce(state, { type: 'HINT' });
assert.equal(state.hintStep, 1);
assert.deepEqual(game.selectScene(state), initialScene, 'hint does not change scene');
state = game.reduce(state, { type: 'HINT' });
assert.equal(state.hintStep, 2);
assert.equal(game.reduce(state, { type: 'HINT' }), state, 'only two hints are available');
state = game.reduce(state, { type: 'CHECK_INCORRECT' });
assert.deepEqual(game.selectScene(state), initialScene, 'wrong does not change scene');
assert.equal(game.reduce(state, { type: 'NEXT' }), state, 'Next is unavailable before correctness');
state = game.reduce(state, { type: 'CHECK_CORRECT' });
assert.equal(state.stage, 1);
assert.equal(state.phase, 'correct');
assert.equal(game.reduce(state, { type: 'CHECK_CORRECT' }), state, 'correct scores once');
state = game.reduce(state, { type: 'NEXT' });
assert.deepEqual({ index: state.index, stage: state.stage, phase: state.phase, hintStep: state.hintStep }, { index: 1, stage: 1, phase: 'ready', hintStep: 0 });

state = game.createState(2);
for (let index = 0; index < game.TOTAL; index += 1) {
  state = game.reduce(state, { type: 'CHECK_CORRECT' });
  assert.equal(state.stage, index + 1, `question ${index + 1}: stage advances exactly once`);
  assert.equal(state.phase, index === game.TOTAL - 1 ? 'finale' : 'correct');
  assert.equal(game.reduce(state, { type: 'CHECK_CORRECT' }), state, `question ${index + 1}: duplicate scoring ignored`);
  if (index < game.TOTAL - 1) state = game.reduce(state, { type: 'NEXT' });
}
assert.equal(game.reduce(state, { type: 'NEXT' }), state, 'finale is persistent');
state = game.reduce(state, { type: 'RESET', seed: 3 });
assert.deepEqual({ seed: state.seed, index: state.index, stage: state.stage, phase: state.phase, hintStep: state.hintStep }, { seed: 3, index: 0, stage: 0, phase: 'ready', hintStep: 0 });

for (let stage = 0; stage <= 6; stage += 1) {
  assert.equal(scene.stagePath(stage), `lighthouse-${stage}.webp`);
  assert.match(scene.stageLabel(stage), new RegExp(`стан ${stage} із 6`));
  assert.equal(fs.existsSync(path.join(root, scene.stagePath(stage))), true, `state ${stage} image exists`);
}

const html = source('index.html');
const app = source('app.js');
const css = `${source('styles.css')}\n${source('lighthouse-scene.css')}`;
assert.match(html, /<html lang="uk">/);
assert.match(html, /Маяк четвертого класу/);
assert.equal((html.match(/Розв’яжи 6 завдань — кожна правильна відповідь засвітить маяк\./g) || []).length, 1);
assert.equal((html.match(/class="catalog-link" href="\.\.\/\.\.\/\.\.\/"/g) || []).length, 1);
assert.match(html, /default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'none'/);
assert.match(app, /URLSearchParams\(window\.location\.search\)/, 'URL seed supports deterministic replay');
assert.match(app, /focusAnswer\(result\.field\)/, 'invalid and wrong responses return focus to the relevant answer');
assert.match(app, /elements\['question-title'\]\.focus\(\)/, 'Next focuses the new question heading');
assert.match(app, /elements\['finale-title'\]\.focus\(\)/, 'finale receives focus');
assert.match(app, /Ще підказка/, 'first hint offers a progressive second hint');
assert.match(css, /min-height:\s*48px/g);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(`${html}\n${app}`, /\b(?:localStorage|sessionStorage|indexedDB|serviceWorker|fetch|XMLHttpRequest|document\.cookie)\b/);
assert.doesNotMatch(`${html}\n${app}\n${css}`, /https?:\/\//);

console.log('PASS: six Grade 4 families, independent oracle, scorer, two-stage hints, score lifecycle, static privacy and UX across 10,000 seeds');
