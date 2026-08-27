'use strict';

const assert = require('node:assert/strict');
const math = require('../activities/math/06-grade5-lighthouse/generator.js');

function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
function lcmByMultiples(a, b) { for (let n = Math.max(a, b); n <= a * b; n += 1) if (n % a === 0 && n % b === 0) return n; throw new Error('unreachable'); }
function checkPrompt(prompt) {
  assert.ok(prompt.id && prompt.strand && prompt.question && prompt.answer && prompt.hints.length === 2 && prompt.solution);
  assert.ok(!prompt.question.includes('undefined'));
  assert.ok(prompt.solution.includes(String(prompt.answer.display)), `${prompt.id}: solution must contain display answer`);
}

assert.equal(math.normalizeSeed(0), 0x6d2b79f5);
assert.equal(math.normalizeSeed(0xffffffff), 0xffffffff);
assert.deepEqual(math.generateExpedition(1), math.generateExpedition(1));
assert.notDeepEqual(math.generateExpedition(1), math.generateExpedition(2));
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
assert.equal(attempt.hintsUsed, 2, 'hints cap at two');
for (let count = 0; count < 6; count += 1) attempt = math.reduceAttempt(attempt, 'wrong');
assert.equal(attempt.wrongChecks, 6);
assert.equal(math.canReveal(attempt), true);
attempt = math.reduceAttempt(attempt, 'reveal');
assert.equal(math.classifyAttempt(attempt), 'revisit');
assert.deepEqual(math.reduceAttempt(attempt, 'correct'), attempt, 'completed attempt cannot double-score');
assert.equal(math.canReveal(math.reduceAttempt(math.reduceAttempt(math.reduceAttempt(math.initialAttempt(), 'wrong'), 'wrong'), 'wrong')), false);
const sample = Object.fromEntries(math.generateExpedition(1).prompts.map((item) => [item.type, item]));
assert.equal(math.isCorrect(sample.precedence, String(sample.precedence.answer.value)), true);
assert.equal(math.isCorrect(sample.decimalDivide, sample.decimalDivide.answer.display.replace(',', '.')), true);
assert.equal(math.isCorrect(sample.remainder, { quotient: String(sample.remainder.answer.value.quotient), remainder: String(sample.remainder.answer.value.remainder) }), true);
assert.equal(math.isCorrect(sample.rectangle, { perimeter: String(sample.rectangle.answer.value.perimeter), area: String(sample.rectangle.answer.value.area) }), true);
assert.equal(math.isCorrect(sample.mixedFraction, { whole: '1', numerator: String(sample.mixedFraction.answer.value.numerator), denominator: String(sample.mixedFraction.answer.value.denominator) }), true);
assert.equal(math.isCorrect(sample.precedence, ''), false);
const validOrder = sample.naturalOrder.answer.value.join(' < ');
assert.equal(math.isCorrect(sample.naturalOrder, validOrder), true);
assert.equal(math.isCorrect(sample.naturalOrder, sample.naturalOrder.answer.value.join(', ')), true);
assert.equal(math.isCorrect(sample.naturalOrder, `junk${validOrder}`), false);
assert.equal(math.isCorrect(sample.naturalOrder, `${validOrder}junk`), false);
assert.equal(math.isCorrect(sample.naturalOrder, validOrder.replace(' < ', ' abc ')), false);
assert.equal(math.isCorrect(sample.naturalOrder, `${validOrder} < 9999999`), false);
for (let wrongChecks = 0; wrongChecks <= 6; wrongChecks += 1) for (let hintsUsed = 0; hintsUsed <= 2; hintsUsed += 1) {
  const base = { correct: false, wrongChecks, hintsUsed, solutionRevealed: false };
  const correct = math.reduceAttempt(base, 'correct');
  assert.equal(math.classifyAttempt(correct), wrongChecks === 0 && hintsUsed === 0 ? 'strength' : 'developing');
  if (wrongChecks >= 4) assert.equal(math.classifyAttempt(math.reduceAttempt(base, 'reveal')), 'revisit');
  else assert.equal(math.classifyAttempt(math.reduceAttempt(base, 'reveal')), null);
}
assert.throws(() => math.randInt(() => 0, 2, 1));
console.log('PASS: fixed answers, boundaries, reducers, and 10,000 seeds per generator family');
