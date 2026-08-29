(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Grade4LighthouseMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ZERO_SEED = 0x6d2b79f5;
  const UINT_RANGE = 0x100000000;

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

  function parseWhole(raw) {
    const text = String(raw ?? '').trim();
    if (!/^\d+$/.test(text) && !/^\d{1,3}(?:[ \u00a0\u202f]\d{3})+$/.test(text)) return null;
    const value = Number(text.replace(/[ \u00a0\u202f]/g, ''));
    return Number.isSafeInteger(value) ? value : null;
  }

  function formatWhole(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function makePlaceValue(rng) {
    const places = [100000, 10000, 1000, 100, 10, 1];
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const digits = [randInt(rng, 1, 9), ...Array.from({ length: 5 }, () => randInt(rng, 0, 9))];
      const terms = digits.map((digit, index) => digit * places[index]).filter(Boolean);
      if (terms.length < 4 || terms.length > 5) continue;
      const answer = terms.reduce((sum, value) => sum + value, 0);
      return {
        id: 'place-value', type: 'integer',
        prompt: `Утвори число із розрядних доданків: ${terms.map(formatWhole).join(' + ')}.`,
        hints: [
          'Кожен доданок показує цифру в певному розряді: сотнях тисяч, десятках тисяч і далі.',
          'Розташуй розряди від найбільшого до одиниць; пропущений розряд запиши цифрою 0.'
        ],
        diagnostic: 'Перевір місце кожної цифри: у пропущеному розряді має стояти 0.',
        answer, data: { terms }
      };
    }
    throw new Error('place value exhausted');
  }

  function makeOperations(rng) {
    const a = randInt(rng, 1000, 10000);
    const b = randInt(rng, 10, 99);
    const c = randInt(rng, 2, 9);
    const e = randInt(rng, 2, 9);
    const quotient = randInt(rng, 2, 20);
    const d = e * quotient;
    return {
      id: 'operations', type: 'integer',
      prompt: `Обчисли: ${formatWhole(a)} + ${b} × ${c} − ${d} ÷ ${e}.`,
      hints: [
        'Спочатку виконай множення і ділення, а вже потім додавання і віднімання.',
        `Окремо обчисли ${b} × ${c} і ${d} ÷ ${e}, тоді підстав результати у вираз.`
      ],
      diagnostic: 'Перевір порядок дій: множення і ділення виконують раніше за додавання і віднімання.',
      answer: a + b * c - quotient,
      data: { a, b, c, d, e }
    };
  }

  function makeFraction(rng) {
    const denominator = randInt(rng, 2, 10);
    const numerator = randInt(rng, 1, denominator - 1);
    const unit = randInt(rng, 2, 200);
    const total = denominator * unit;
    return {
      id: 'fraction', type: 'integer',
      promptParts: ['Знайди ', { numerator, denominator }, ` від числа ${formatWhole(total)}.`],
      hints: [
        'Знаменник показує, на скільки рівних частин треба поділити число.',
        `Спочатку поділи ${formatWhole(total)} на ${denominator}, а потім помнож результат на ${numerator}.`
      ],
      diagnostic: 'Перевір дві дії: поділ на знаменник, потім множення на чисельник.',
      answer: numerator * unit,
      data: { numerator, denominator, total }
    };
  }

  function makeMovement(rng) {
    const speed = randInt(rng, 20, 90);
    const time = randInt(rng, 2, 9);
    return {
      id: 'movement', type: 'integer',
      prompt: `Катер рухається зі швидкістю ${speed} км/год протягом ${time} год. Скільки кілометрів пройде катер?`,
      hints: [
        'Щоб знайти шлях, треба швидкість помножити на час руху.',
        `Склади добуток ${speed} × ${time}; відповідь запиши в кілометрах.`
      ],
      diagnostic: 'Перевір залежність: шлях дорівнює швидкості, помноженій на час.',
      answer: speed * time,
      data: { speed, time }
    };
  }

  function makeRectangle(rng) {
    const width = randInt(rng, 3, 30);
    let height = randInt(rng, 3, 29);
    if (height >= width) height += 1;
    return {
      id: 'rectangle', type: 'rectangle',
      prompt: `Прямокутна ділянка має сторони ${width} м і ${height} м. Знайди її периметр і площу.`,
      hints: [
        'Периметр — довжина межі фігури, а площа — розмір її поверхні.',
        `Для периметра додай ${width} і ${height} та помнож на 2; для площі перемнож ці сторони.`
      ],
      diagnostic: 'Перевір обидва поля: периметр і площу знаходять за різними правилами.',
      answer: { perimeter: 2 * (width + height), area: width * height },
      data: { width, height }
    };
  }

  function makeEquation(rng) {
    const kind = ['addend', 'minuend', 'factor', 'dividend'][randInt(rng, 0, 3)];
    let answer;
    let known;
    let result;
    let expression;
    let hints;
    let diagnostic;

    if (kind === 'addend') {
      answer = randInt(rng, 2, 99);
      known = randInt(rng, 10, 500);
      result = answer + known;
      expression = `x + ${known} = ${result}`;
      hints = ['Невідомий доданок знаходять відніманням від суми відомого доданка.', `Від ${result} відніми ${known}, а потім перевір відповідь додаванням.`];
      diagnostic = 'Перевір правило знаходження невідомого доданка та виконай підстановку.';
    } else if (kind === 'minuend') {
      known = randInt(rng, 2, 49);
      result = randInt(rng, 2, 49);
      answer = known + result;
      expression = `x − ${known} = ${result}`;
      hints = ['Невідоме зменшуване знаходять додаванням різниці й від’ємника.', `До ${result} додай ${known}, а потім перевір відповідь відніманням.`];
      diagnostic = 'Перевір правило знаходження невідомого зменшуваного та виконай підстановку.';
    } else if (kind === 'factor') {
      known = randInt(rng, 2, 9);
      answer = randInt(rng, 2, 99);
      result = known * answer;
      expression = `${known} × x = ${result}`;
      hints = ['Невідомий множник знаходять діленням добутку на відомий множник.', `Поділи ${result} на ${known}, а потім перевір відповідь множенням.`];
      diagnostic = 'Перевір правило знаходження невідомого множника та виконай підстановку.';
    } else {
      known = randInt(rng, 2, 9);
      result = randInt(rng, 2, Math.floor(99 / known));
      answer = known * result;
      expression = `x ÷ ${known} = ${result}`;
      hints = ['Невідоме ділене знаходять множенням частки на дільник.', `Помнож ${result} на ${known}, а потім перевір відповідь діленням.`];
      diagnostic = 'Перевір правило знаходження невідомого діленого та виконай підстановку.';
    }

    return {
      id: 'equation', type: 'integer',
      prompt: `Розв’яжи рівняння: ${expression}.`,
      hints, diagnostic, answer, data: { kind, known, result }
    };
  }

  function generateItems(seed) {
    const normalizedSeed = normalizeSeed(seed);
    const rng = xorshift32(normalizedSeed);
    return Object.freeze({
      seed: normalizedSeed,
      items: Object.freeze([
        makePlaceValue(rng), makeOperations(rng), makeFraction(rng),
        makeMovement(rng), makeRectangle(rng), makeEquation(rng)
      ].map(Object.freeze))
    });
  }

  function inspectResponse(item, raw) {
    if (!item) return { kind: 'invalid' };
    if (item.type === 'rectangle') {
      const perimeterText = String(raw?.perimeter ?? '').trim();
      const areaText = String(raw?.area ?? '').trim();
      if (!perimeterText) return { kind: 'empty', field: 'perimeter' };
      if (!areaText) return { kind: 'empty', field: 'area' };
      const perimeter = parseWhole(perimeterText);
      const area = parseWhole(areaText);
      if (perimeter === null) return { kind: 'invalid', field: 'perimeter' };
      if (area === null) return { kind: 'invalid', field: 'area' };
      if (perimeter !== item.answer.perimeter) return { kind: 'wrong', field: 'perimeter' };
      if (area !== item.answer.area) return { kind: 'wrong', field: 'area' };
      return { kind: 'correct' };
    }
    const text = String(raw ?? '').trim();
    if (!text) return { kind: 'empty' };
    const value = parseWhole(text);
    if (value === null) return { kind: 'invalid' };
    return { kind: value === item.answer ? 'correct' : 'wrong' };
  }

  return { normalizeSeed, xorshift32, randInt, parseWhole, formatWhole, generateItems, inspectResponse };
});
