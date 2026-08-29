'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const activityPath = path.join(__dirname, '../activities/math/05-catchx/index.html');
const html = fs.readFileSync(activityPath, 'utf8');
const scriptMatch = html.match(/<script>\s*\(function\(\)\{([\s\S]*?)\}\)\(\);\s*<\/script>/);
assert.ok(scriptMatch, 'CatchX inline application script is extractable');
const source = scriptMatch[1];
const coreStart = source.indexOf('function rand(');
const coreEnd = source.indexOf('/* ========================= state ========================= */');
assert.ok(coreStart >= 0 && coreEnd > coreStart, 'generator core boundaries exist');
const generatorCore = `${source.slice(coreStart, coreEnd)}\nglobalThis.__levels = LEVELS;`;

function seededRandom(seed) {
  let value = seed >>> 0;
  return function random() {
    value = (value + 0x6d2b79f5) >>> 0;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSequence(seed) {
  const math = Object.create(Math);
  math.random = seededRandom(seed);
  const context = { Math: math };
  vm.runInNewContext(generatorCore, context, { filename: 'catchx-generator-core.js' });
  return context.__levels.map((level) => level.gen());
}

function plain(value) {
  return value.replace(/<[^>]+>/g, '').trim();
}

function evaluateSide(side, x) {
  const tokens = plain(side).split(/\s+/).map((token) => token === 'x' ? x : (/^\d+$/.test(token) ? Number(token) : token));
  assert.ok(tokens.length % 2 === 1, `valid expression token count: ${side}`);
  const reduced = [tokens[0]];
  for (let index = 1; index < tokens.length; index += 2) {
    const operator = tokens[index];
    const right = tokens[index + 1];
    if (operator === '·' || operator === ':') {
      const left = reduced.pop();
      reduced.push(operator === '·' ? left * right : left / right);
    } else {
      assert.ok(operator === '+' || operator === '−', `supported operator ${operator}`);
      reduced.push(operator, right);
    }
  }
  let result = reduced[0];
  for (let index = 1; index < reduced.length; index += 2) {
    result = reduced[index] === '+' ? result + reduced[index + 1] : result - reduced[index + 1];
  }
  return result;
}

function verifyProblem(problem, label) {
  assert.ok(Number.isInteger(problem.secretX) && problem.secretX > 0, `${label}: positive integer answer`);
  assert.ok(typeof problem.brief === 'string' && problem.brief.length > 20, `${label}: story brief`);
  assert.ok(problem.steps.length === 1 || problem.steps.length === 2, `${label}: one- or two-step problem`);

  problem.steps.forEach((step, stepIndex) => {
    const equation = plain(step.eqBefore).split(' = ');
    assert.equal(equation.length, 2, `${label}:${stepIndex}: equation has two sides`);
    assert.equal(evaluateSide(equation[0], problem.secretX), evaluateSide(equation[1], problem.secretX), `${label}:${stepIndex}: answer satisfies equation`);
    assert.equal(step.options.length, 3, `${label}:${stepIndex}: three options`);
    assert.equal(new Set(step.options.map((option) => option.label)).size, 3, `${label}:${stepIndex}: unique options`);
    assert.equal(step.options.filter((option) => option.correct).length, 1, `${label}:${stepIndex}: one correct option`);
    assert.ok(step.prompt === 'Яку дію виконати з обома шальками терезів, щоб звільнити Ікс?' || step.prompt === 'Яке правило допоможе знайти Ікс?', `${label}:${stepIndex}: approved plain-language first hint`);
    assert.ok(step.ruleName.length > 3 && step.ruleText.length > 20, `${label}:${stepIndex}: conceptual second hint`);
    assert.equal(step.isLast, stepIndex === problem.steps.length - 1, `${label}:${stepIndex}: final-step marker`);
    if (step.type === 'op') {
      const correct = step.options.find((option) => option.correct);
      assert.ok(['add', 'sub', 'mul', 'div'].includes(correct.opType), `${label}:${stepIndex}: supported operation`);
      assert.ok(Number.isInteger(correct.opAmount) && correct.opAmount > 0, `${label}:${stepIndex}: positive operation amount`);
    } else {
      assert.equal(step.type, 'rule', `${label}:${stepIndex}: known step type`);
    }
  });
}

const mixedFamilies = new Set();
const twoStepFamilies = new Set();
for (let seed = 0; seed < 2000; seed += 1) {
  const first = generateSequence(seed);
  const replay = generateSequence(seed);
  assert.equal(JSON.stringify(first), JSON.stringify(replay), `${seed}: deterministic replay`);
  assert.equal(first.length, 8, `${seed}: all eight case generators`);
  first.forEach((problem, index) => verifyProblem(problem, `${seed}:case-${index + 1}`));
  mixedFamilies.add(plain(first[6].steps[0].eqBefore).replace(/\d+/g, '#'));
  twoStepFamilies.add(plain(first[7].steps[0].eqBefore).replace(/\d+/g, '#'));
}
assert.ok(mixedFamilies.size >= 6, 'mixed case reaches all six one-step generator families');
assert.equal(twoStepFamilies.size, 4, 'two-step case reaches all four equation families');

assert.match(html, /font-family:ui-serif, Georgia, Cambria, 'Times New Roman', serif;/, 'story uses a local book-style serif stack');
assert.doesNotMatch(html.match(/\.brief-note\{[\s\S]*?\}/)[0], /Caveat|cursive|Comic Sans|Segoe Print/, 'story does not use script typography');
assert.equal((html.match(/class="pan-token"/g) || []).length, 2, 'both pans have attached value tokens');
assert.match(html, /\.pan-label\{[\s\S]*?font-size:18px;[\s\S]*?font-weight:800;/, 'pan values use readable type');
assert.doesNotMatch(source.match(/function renderStep\(\)\{[\s\S]*?function updateMistakeFlag/)[0], /step-prompt/, 'plain-language question is absent from the default task surface');
assert.match(source, /c\.hintStage === 1 \? step\.prompt : \(step\.ruleName\+'\. '\+step\.ruleText\)/, 'hint ladder reveals question before conceptual hint');
assert.match(source, /c\.hintStage = 0;/, 'hint ladder resets for each rendered step');
assert.match(source, /c\.hintStage >= 2 \|\| c\.hintAdvanceLocked/, 'hint ladder guards completion and rapid repeated input');
assert.match(html, /id="hintArea" aria-live="polite"/, 'hint changes are announced');
assert.match(html, /id="hintStatus" class="visually-hidden" aria-live="polite"/, 'hint position has an accessible status');
assert.doesNotMatch(html, /<(?:script|link|img)\b[^>]*(?:src|href)=["']https?:\/\//i, 'CatchX has no external requests or assets');
assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/, 'CatchX has no network primitives');

console.log('PASS: CatchX eight-case generators, 2,000 deterministic seeds, independent equation oracle, hint ladder, readability and privacy contracts');
