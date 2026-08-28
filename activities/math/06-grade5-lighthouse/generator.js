(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LighthouseMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ZERO_SEED = 0x6d2b79f5;
  const UINT_RANGE = 0x100000000;
  const DIVISORS = Object.freeze([2, 3, 5, 9, 10]);

  function normalizeSeed(seed) {
    const value = Number(seed);
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) return ZERO_SEED;
    return (value >>> 0) || ZERO_SEED;
  }

  function xorshift32(seed) {
    let state = normalizeSeed(seed);
    return function next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state >>> 0;
    };
  }

  function randInt(rng, minimum, maximum) {
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum > maximum) throw new RangeError('invalid integer range');
    const span = maximum - minimum + 1;
    const limit = Math.floor(UINT_RANGE / span) * span;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const value = rng() >>> 0;
      if (value < limit) return minimum + (value % span);
    }
    throw new Error('random range exhausted');
  }

  function parseInteger(raw) {
    const text = String(raw ?? '').trim();
    if (!/^\d+$/.test(text)) return null;
    const value = Number(text);
    return Number.isSafeInteger(value) ? value : null;
  }

  function parseHundredths(raw) {
    const text = String(raw ?? '').trim();
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(text)) return null;
    const [whole, fraction = ''] = text.replace(',', '.').split('.');
    const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return Number.isSafeInteger(value) ? value : null;
  }

  function formatHundredths(value) {
    return `${Math.floor(value / 100)},${String(value % 100).padStart(2, '0')}`;
  }

  function makeOperations(rng) {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const a = randInt(rng, 100, 500);
      const b = randInt(rng, 2, 20);
      const c = randInt(rng, 2, 20);
      const e = randInt(rng, 2, 9);
      const k = randInt(rng, 2, 12);
      const d = e * k;
      const answer = a + b * c - k;
      if (answer > 0 && answer <= 999) {
        return {
          id: 'operations', type: 'integer',
          prompt: `Обчисли: ${a} + ${b} × ${c} − ${d} ÷ ${e}.`,
          hint: 'Спочатку виконай множення і ділення, а потім додавання і віднімання.',
          diagnostic: 'Перевір порядок дій: множення і ділення виконують раніше.',
          answer, data: { a, b, c, d, e }
        };
      }
    }
    throw new Error('operations exhausted');
  }

  const divisibilityCandidates = [];
  for (let number = 100; number <= 999; number += 1) {
    const answer = DIVISORS.filter((divisor) => number % divisor === 0);
    if (answer.length >= 2 && answer.length <= 4) divisibilityCandidates.push({ number, answer });
  }

  function makeDivisibility(rng) {
    const candidate = divisibilityCandidates[randInt(rng, 0, divisibilityCandidates.length - 1)];
    return {
      id: 'divisibility', type: 'set', options: [...DIVISORS],
      prompt: `Обери всі числа, на які ${candidate.number} ділиться без остачі.`,
      hint: 'Для 2, 5 і 10 перевір останню цифру; для 3 і 9 — суму цифр.',
      diagnostic: 'Перевір кожну ознаку подільності й обери точний набір.',
      answer: [...candidate.answer], data: { number: candidate.number }
    };
  }

  function makeFraction(rng) {
    const denominator = randInt(rng, 2, 10);
    const numerator = randInt(rng, 1, denominator - 1);
    const part = randInt(rng, 2, 20);
    const total = denominator * part;
    return {
      id: 'fraction', type: 'integer',
      promptParts: ['Знайди ', { numerator, denominator }, ` від числа ${total}.`],
      hint: 'Поділи число на знаменник, а результат помнож на чисельник.',
      diagnostic: 'Перевір: знаменник ділить число на рівні частини, а чисельник показує їх кількість.',
      answer: numerator * part, data: { numerator, denominator, total }
    };
  }

  function makeDecimal(rng) {
    const firstHundredth = randInt(rng, 1, 9);
    const secondHundredth = randInt(rng, 10 - firstHundredth, 9);
    const left = randInt(rng, 0, 49) * 100 + randInt(rng, 0, 9) * 10 + firstHundredth;
    const right = randInt(rng, 0, 49) * 100 + randInt(rng, 0, 9) * 10 + secondHundredth;
    return {
      id: 'decimal', type: 'decimal',
      prompt: `Обчисли: ${formatHundredths(left)} + ${formatHundredths(right)}.`,
      hint: 'Запиши коми одну під одною та додавай соті до сотих.',
      diagnostic: 'Перевір перенесення із сотих і місце десяткової коми.',
      answer: left + right, data: { left, right }
    };
  }

  function makeRectangle(rng) {
    const width = randInt(rng, 3, 20);
    let height = randInt(rng, 3, 19);
    if (height >= width) height += 1;
    return {
      id: 'rectangle', type: 'rectangle',
      prompt: `Прямокутник має сторони ${width} см і ${height} см. Знайди периметр і площу.`,
      hint: 'Периметр — сума чотирьох сторін; площа — добуток довжини й ширини.',
      diagnostic: 'Перевір обидва поля: периметр і площу обчислюють за різними правилами.',
      answer: { perimeter: 2 * (width + height), area: width * height }, data: { width, height }
    };
  }

  function makeEquation(rng) {
    const multiplier = randInt(rng, 2, 9);
    const answer = randInt(rng, 2, 20);
    const offset = randInt(rng, 1, 30);
    const result = multiplier * answer + offset;
    return {
      id: 'equation', type: 'integer',
      prompt: `Розв’яжи рівняння: ${multiplier}x + ${offset} = ${result}.`,
      hint: `Спочатку відніми ${offset}, а потім поділи результат на ${multiplier}.`,
      diagnostic: 'Перевір обернені дії: спочатку віднімання, потім ділення.',
      answer, data: { multiplier, offset, result }
    };
  }

  function generateItems(seed) {
    const normalizedSeed = normalizeSeed(seed);
    const rng = xorshift32(normalizedSeed);
    return Object.freeze({
      seed: normalizedSeed,
      items: Object.freeze([
        makeOperations(rng), makeDivisibility(rng), makeFraction(rng),
        makeDecimal(rng), makeRectangle(rng), makeEquation(rng)
      ].map(Object.freeze))
    });
  }

  function inspectResponse(item, raw) {
    if (!item) return { kind: 'invalid' };
    if (item.type === 'set') {
      if (!Array.isArray(raw) || raw.length === 0) return { kind: 'empty' };
      const parsed = raw.map(parseInteger);
      if (parsed.some((value) => value === null) || new Set(parsed).size !== parsed.length) return { kind: 'invalid' };
      const actual = [...parsed].sort((a, b) => a - b);
      const expected = [...item.answer].sort((a, b) => a - b);
      return { kind: JSON.stringify(actual) === JSON.stringify(expected) ? 'correct' : 'wrong' };
    }
    if (item.type === 'rectangle') {
      const perimeterText = String(raw?.perimeter ?? '').trim();
      const areaText = String(raw?.area ?? '').trim();
      if (!perimeterText) return { kind: 'empty', field: 'perimeter' };
      if (!areaText) return { kind: 'empty', field: 'area' };
      const perimeter = parseInteger(perimeterText);
      const area = parseInteger(areaText);
      if (perimeter === null) return { kind: 'invalid', field: 'perimeter' };
      if (area === null) return { kind: 'invalid', field: 'area' };
      if (perimeter !== item.answer.perimeter) return { kind: 'wrong', field: 'perimeter' };
      if (area !== item.answer.area) return { kind: 'wrong', field: 'area' };
      return { kind: 'correct' };
    }
    const text = String(raw ?? '').trim();
    if (!text) return { kind: 'empty' };
    const value = item.type === 'decimal' ? parseHundredths(text) : parseInteger(text);
    if (value === null) return { kind: 'invalid' };
    return { kind: value === item.answer ? 'correct' : 'wrong' };
  }

  return { DIVISORS, normalizeSeed, xorshift32, randInt, parseInteger, parseHundredths, formatHundredths, generateItems, inspectResponse };
});