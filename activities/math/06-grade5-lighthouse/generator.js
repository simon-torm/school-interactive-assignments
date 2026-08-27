(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LighthouseMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ZERO_SEED = 0x6d2b79f5;
  const MAX_UINT = 0x100000000;

  function normalizeSeed(seed) {
    const value = Number(seed);
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) return ZERO_SEED;
    const normalized = value >>> 0;
    return normalized === 0 ? ZERO_SEED : normalized;
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

  function randInt(rng, min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) throw new RangeError('invalid integer range');
    const span = max - min + 1;
    const limit = Math.floor(MAX_UINT / span) * span;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const value = rng() >>> 0;
      if (value < limit) return min + (value % span);
    }
    throw new Error('random range exhausted');
  }

  function gcd(a, b) {
    let left = Math.abs(a);
    let right = Math.abs(b);
    while (right) [left, right] = [right, left % right];
    return left;
  }

  function formatHundredths(value, forceTwo = false) {
    const whole = Math.floor(value / 100);
    const cents = value % 100;
    if (forceTwo) return `${whole},${String(cents).padStart(2, '0')}`;
    if (cents === 0) return String(whole);
    if (cents % 10 === 0) return `${whole},${cents / 10}`;
    return `${whole},${String(cents).padStart(2, '0')}`;
  }

  function parseInteger(raw) {
    const text = String(raw ?? '').trim();
    if (!/^\d+$/.test(text)) return null;
    const value = Number(text);
    return Number.isSafeInteger(value) ? value : null;
  }

  function parseHundredths(raw) {
    const text = String(raw ?? '').trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const [whole, fraction = ''] = text.split('.');
    const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return Number.isSafeInteger(value) ? value : null;
  }

  function answer(value, display = String(value), kind = 'integer') {
    return { value, display, kind };
  }

  function prompt(id, strand, type, question, result, hints, solution, data) {
    return { id, strand, type, question, answer: result, hints, solution, data };
  }

  function naturalOrder(rng, id = 'natural-order') {
    const values = new Set();
    for (let attempt = 0; values.size < 4 && attempt < 64; attempt += 1) values.add(randInt(rng, 10000, 999999));
    if (values.size !== 4) throw new Error('natural ordering exhausted');
    const list = [...values];
    const sorted = [...list].sort((a, b) => a - b);
    const display = sorted.join(' < ');
    return prompt(id, 'natural', 'naturalOrder', `Розташуй числа від найменшого до найбільшого: ${list.join('; ')}.`, answer(sorted, display, 'order'), ['Порівнюй числа зліва направо: спочатку кількість цифр, потім найстарші розряди.', `Знайди найменше число, порівнявши розряд сотень тисяч: ___; далі повтори для решти.`], `Правильний порядок: ${display}.`, { values: list });
  }

  function precedence(rng, id = 'precedence') {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const e = randInt(rng, 2, 9), k = randInt(rng, 2, 12), d = e * k;
      const b = randInt(rng, 2, 20), c = randInt(rng, 2, 20), a = randInt(rng, 100, 500);
      const value = a + b * c - k;
      if (value >= 1 && value <= 999) {
        return prompt(id, 'natural', 'precedence', `Обчисли: ${a} + ${b} × ${c} − ${d} ÷ ${e}.`, answer(value), ['Множення і ділення виконуй перед додаванням і відніманням.', `Спочатку знайди ${b} × ${c} = ___ і ${d} ÷ ${e} = ___.`], `${b} × ${c} = ${b * c}; ${d} ÷ ${e} = ${k}; тому ${a} + ${b * c} − ${k} = ${value}.`, { a, b, c, d, e });
      }
    }
    throw new Error('precedence exhausted');
  }

  function remainderDivision(rng, id = 'remainder') {
    const d = randInt(rng, 3, 12), q = randInt(rng, 12, 60), r = randInt(rng, 1, d - 1), N = d * q + r;
    const value = { quotient: q, remainder: r };
    return prompt(id, 'natural', 'remainder', `Поділи ${N} на ${d}. Запиши частку й остачу.`, answer(value, `${q}, остача ${r}`, 'remainder'), ['Знайди найбільший добуток дільника, який не перевищує ділене.', `${d} × ___ < ${N}, а наступний добуток уже більший.`], `${N} = ${d} × ${q} + ${r}, отже частка ${q}, остача ${r}.`, { d, q, r, N });
  }

  function divisibility(rng, id = 'divisibility') {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const n = randInt(rng, 100, 999);
      const rules = [2, 3, 5, 9, 10].filter((rule) => n % rule === 0);
      if (rules.length >= 2 && rules.length <= 4) {
        return prompt(id, 'divisibility', 'divisibility', `Обери всі числа з набору 2, 3, 5, 9, 10, на які ділиться ${n} без остачі.`, answer(rules, rules.join(', '), 'set'), ['Перевір останню цифру та суму цифр числа.', `Остання цифра допомагає для 2, 5, 10; сума цифр ${String(n).split('').reduce((sum, digit) => sum + Number(digit), 0)} — для 3 і 9.`], `${n} ділиться без остачі на: ${rules.join(', ')}.`, { n });
      }
    }
    throw new Error('divisibility exhausted');
  }

  function gcdLcm(rng, id = 'gcd-lcm') {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const g = randInt(rng, 2, 12), u = randInt(rng, 2, 12), v = randInt(rng, 2, 12);
      if (u === v || gcd(u, v) !== 1) continue;
      const A = g * u, B = g * v;
      if (A > 120 || B > 120) continue;
      const value = { gcd: g, lcm: g * u * v };
      const display = `НСД ${value.gcd}; НСК ${value.lcm}`;
      return prompt(id, 'divisibility', 'gcdLcm', `Знайди НСД і НСК чисел ${A} та ${B}.`, answer(value, display, 'gcdLcm'), ['Для НСД шукай найбільший спільний дільник; для НСК — найменше спільне кратне.', `Поділи обидва числа на спільний множник: ${A} = ___ × ${u}, ${B} = ___ × ${v}.`], `${A} = ${g} × ${u}, ${B} = ${g} × ${v}; ${u} і ${v} взаємно прості. Відповідь: ${display}.`, { A, B, g, u, v });
    }
    throw new Error('GCD/LCM exhausted');
  }

  function fractionCompare(rng, id = 'fraction-compare') {
    const d = randInt(rng, 3, 12);
    let a = randInt(rng, 1, d - 1), b = randInt(rng, 1, d - 1);
    for (let attempt = 0; a === b && attempt < 64; attempt += 1) b = randInt(rng, 1, d - 1);
    if (a === b) throw new Error('fraction comparison exhausted');
    const value = a > b ? '>' : '<';
    return prompt(id, 'fractions', 'fractionCompare', `Постав знак < або >: ${a}/${d} ___ ${b}/${d}.`, answer(value, value, 'choice'), ['За однакових знаменників порівнюй чисельники.', `Порівняй ${a} і ${b}: ${a} ___ ${b}.`], `Знаменники однакові, а ${a} ${value} ${b}, тому ${a}/${d} ${value} ${b}/${d}.`, { a, b, d });
  }

  function fractionOf(rng, id = 'fraction-of') {
    const d = randInt(rng, 2, 10), n = randInt(rng, 1, d - 1), k = randInt(rng, 3, 20), T = d * k, value = n * k;
    return prompt(id, 'fractions', 'fractionOf', `Знайди ${n}/${d} від числа ${T}.`, answer(value), ['Спочатку поділи число на знаменник.', `${T} ÷ ${d} = ___; потім помнож результат на ${n}.`], `${T} ÷ ${d} = ${k}; ${k} × ${n} = ${value}.`, { d, n, k, T });
  }

  function mixedFraction(rng, id = 'mixed-fraction') {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const d = randInt(rng, 3, 12), a = randInt(rng, 1, d - 1), b = randInt(rng, 1, d - 1), remainder = a + b - d;
      if (remainder <= 0 || a + b >= 2 * d || gcd(remainder, d) !== 1) continue;
      const value = { whole: 1, numerator: remainder, denominator: d };
      const display = `1 ${remainder}/${d}`;
      return prompt(id, 'fractions', 'mixedFraction', `Додай і запиши мішаним числом у найпростішому вигляді: ${a}/${d} + ${b}/${d}.`, answer(value, display, 'mixed'), ['За однакових знаменників додай чисельники.', `${a} + ${b} = ___; виділи з отриманого дробу одну цілу частину.`], `${a}/${d} + ${b}/${d} = ${a + b}/${d} = ${display}.`, { a, b, d });
    }
    throw new Error('mixed fraction exhausted');
  }

  function decimalCompare(rng, id = 'decimal-compare') {
    let x = randInt(rng, 10, 9999), y = randInt(rng, 10, 9999);
    for (let attempt = 0; x === y && attempt < 64; attempt += 1) y = randInt(rng, 10, 9999);
    if (x === y) throw new Error('decimal comparison exhausted');
    const value = x > y ? '>' : '<';
    return prompt(id, 'decimals', 'decimalCompare', `Постав знак < або >: ${formatHundredths(x, true)} ___ ${formatHundredths(y, true)}.`, answer(value, value, 'choice'), ['Порівнюй цілі частини, потім десяті й соті.', `Запиши обидва числа із двома цифрами після коми та порівняй ${x} і ${y} сотих.`], `${formatHundredths(x, true)} ${value} ${formatHundredths(y, true)}.`, { x, y });
  }

  function decimalRound(rng, id = 'decimal-round') {
    const cents = randInt(rng, 10, 9999), value = Math.floor((cents + 5) / 10) * 10;
    return prompt(id, 'decimals', 'decimalRound', `Округли ${formatHundredths(cents, true)} до десятих. Якщо сота 5–9, збільш десяту на 1.`, answer(value, formatHundredths(value, true), 'decimal'), ['Подивись на цифру сотих.', `Цифра сотих — ${cents % 10}; виріши, чи змінюється цифра десятих.`], `${formatHundredths(cents, true)} ≈ ${formatHundredths(value, true)} до десятих.`, { cents });
  }

  function decimalOperation(rng, type, id) {
    let x, y, m, d, value, question, firstStep;
    if (type === 'decimalAdd') {
      for (let attempt = 0; attempt < 64; attempt += 1) { x = randInt(rng, 100, 4999); y = randInt(rng, 100, 4999); if (x + y <= 9999) break; }
      value = x + y; question = `Обчисли: ${formatHundredths(x, true)} + ${formatHundredths(y, true)}.`; firstStep = 'Додавай соті до сотих, десяті до десятих.';
    } else if (type === 'decimalSubtract') {
      for (let attempt = 0; attempt < 64; attempt += 1) { value = randInt(rng, 10, 4999); y = randInt(rng, 100, 4999); x = value + y; if (x <= 9999) break; }
      question = `Обчисли: ${formatHundredths(x, true)} − ${formatHundredths(y, true)}.`; firstStep = 'Вирівняй коми й віднімай однойменні розряди.';
    } else if (type === 'decimalMultiply') {
      m = randInt(rng, 2, 9); x = randInt(rng, 10, Math.min(2500, Math.floor(9999 / m))); value = x * m;
      question = `Обчисли: ${formatHundredths(x, true)} × ${m}.`; firstStep = `Помнож кількість сотих на ${m}.`;
    } else {
      d = randInt(rng, 2, 9); value = randInt(rng, 10, Math.min(2500, Math.floor(9999 / d))); x = value * d;
      question = `Обчисли: ${formatHundredths(x, true)} ÷ ${d}.`; firstStep = `Поділи кількість сотих на ${d}.`;
    }
    if (!Number.isInteger(value) || value < 0 || value > 9999) throw new Error(`${type} exhausted`);
    const display = formatHundredths(value, true);
    return prompt(id, 'decimals', type, question, answer(value, display, 'decimal'), [firstStep, `Подай усі числа в сотих: шукане значення — ___ сотих.`], `Точний результат: ${display}.`, { x, y, m, d });
  }

  function average(rng, id = 'average') {
    const m = randInt(rng, 200, 8000);
    const span = Math.min(m - 100, 9999 - m, 1000);
    const offset = randInt(rng, 1, span);
    const p = m - offset, q = m, r = m + offset;
    return prompt(id, 'decimals', 'average', `Знайди середнє арифметичне чисел ${formatHundredths(p, true)}; ${formatHundredths(q, true)}; ${formatHundredths(r, true)}.`, answer(m, formatHundredths(m, true), 'decimal'), ['Додай три числа й поділи суму на 3.', `Сума в сотих: ${p} + ${q} + ${r} = ___; потім поділи на 3.`], `${formatHundredths(p, true)} + ${formatHundredths(q, true)} + ${formatHundredths(r, true)} = ${formatHundredths(3 * m, true)}; ÷ 3 = ${formatHundredths(m, true)}.`, { p, q, r });
  }

  function rectangle(rng, id = 'rectangle') {
    let a = randInt(rng, 3, 20), b = randInt(rng, 3, 20);
    for (let attempt = 0; a === b && attempt < 64; attempt += 1) b = randInt(rng, 3, 20);
    if (a === b) throw new Error('rectangle exhausted');
    const value = { perimeter: 2 * (a + b), area: a * b };
    const display = `P = ${value.perimeter} cm; S = ${value.area} cm²`;
    return prompt(id, 'geometry', 'rectangle', `Прямокутник має сторони ${a} cm і ${b} cm. Знайди периметр у cm та площу в cm².`, answer(value, display, 'rectangle'), ['Периметр — сума чотирьох сторін; площа — добуток довжини й ширини.', `P = 2 × (${a} + ${b}); S = ${a} × ${b}.`], `P = 2 × (${a} + ${b}); S = ${a} × ${b}. Відповідь: ${display}.`, { a, b });
  }

  function equation(rng, id = 'equation') {
    const x = randInt(rng, 2, 20), m = randInt(rng, 2, 9), a = randInt(rng, 1, Math.min(30, 200 - m * x)), b = m * x + a;
    return prompt(id, 'equations', 'equation', `На ${m} однакових ящиках по x ламп і ще ${a} окремих ламп. Разом ${b} ламп. Розв’яжи рівняння ${m}x + ${a} = ${b}.`, answer(x), ['Спочатку відніми кількість окремих ламп.', `${b} − ${a} = ___; потім поділи на ${m}.`], `${b} − ${a} = ${m * x}; ${m * x} ÷ ${m} = ${x}, тому x = ${x}.`, { x, m, a, b });
  }

  function generateExpedition(seed) {
    const normalizedSeed = normalizeSeed(seed);
    const rng = xorshift32(normalizedSeed);
    const prompts = [
      naturalOrder(rng), precedence(rng), remainderDivision(rng),
      divisibility(rng), gcdLcm(rng),
      fractionCompare(rng), fractionOf(rng), mixedFraction(rng),
      decimalCompare(rng), decimalRound(rng), decimalOperation(rng, 'decimalAdd', 'decimal-add'), decimalOperation(rng, 'decimalSubtract', 'decimal-subtract'), decimalOperation(rng, 'decimalMultiply', 'decimal-multiply'), decimalOperation(rng, 'decimalDivide', 'decimal-divide'), average(rng),
      rectangle(rng), equation(rng)
    ];
    const finalPrompts = [
      precedence(rng, 'final-natural'), gcdLcm(rng, 'final-divisibility'), mixedFraction(rng, 'final-fractions'),
      decimalOperation(rng, 'decimalDivide', 'final-decimals'), rectangle(rng, 'final-geometry'), equation(rng, 'final-equations')
    ];
    return { seed: normalizedSeed, prompts, finalPrompts };
  }

  function classifyAttempt(state) {
    if (state.solutionRevealed) return 'revisit';
    if (state.correct && state.wrongChecks === 0 && state.hintsUsed === 0) return 'strength';
    if (state.correct) return 'developing';
    return null;
  }

  function initialAttempt() {
    return { correct: false, wrongChecks: 0, hintsUsed: 0, solutionRevealed: false };
  }

  function canReveal(state) {
    return !state.correct && !state.solutionRevealed && state.wrongChecks >= 4;
  }

  function reduceAttempt(state, event) {
    if (state.correct || state.solutionRevealed) return { ...state };
    if (event === 'hint') return { ...state, hintsUsed: Math.min(2, state.hintsUsed + 1) };
    if (event === 'wrong') return { ...state, wrongChecks: state.wrongChecks + 1 };
    if (event === 'correct') return { ...state, correct: true };
    if (event === 'reveal' && canReveal(state)) return { ...state, correct: true, solutionRevealed: true };
    return { ...state };
  }

  function parseSet(raw) {
    const values = Array.isArray(raw) ? raw : String(raw ?? '').split(/[;,\s]+/);
    const parsed = values.map(parseInteger);
    if (parsed.some((value) => value === null)) return null;
    return [...new Set(parsed)].sort((a, b) => a - b);
  }

  function isCorrect(item, raw) {
    const kind = item.answer.kind;
    if (kind === 'integer') return parseInteger(raw) === item.answer.value;
    if (kind === 'decimal') return parseHundredths(raw) === item.answer.value;
    if (kind === 'choice') return String(raw ?? '').trim() === item.answer.value;
    if (kind === 'set') {
      const parsed = parseSet(raw);
      return parsed !== null && JSON.stringify(parsed) === JSON.stringify([...item.answer.value].sort((a, b) => a - b));
    }
    if (kind === 'order') {
      const text = String(raw ?? '').trim();
      if (!/^\d+(?:\s*(?:,|<)\s*\d+){3}$/.test(text)) return false;
      const parsed = text.split(/\s*(?:,|<)\s*/).map(Number);
      return JSON.stringify(parsed) === JSON.stringify(item.answer.value);
    }
    if (kind === 'remainder') return parseInteger(raw.quotient) === item.answer.value.quotient && parseInteger(raw.remainder) === item.answer.value.remainder;
    if (kind === 'gcdLcm') return parseInteger(raw.gcd) === item.answer.value.gcd && parseInteger(raw.lcm) === item.answer.value.lcm;
    if (kind === 'mixed') return parseInteger(raw.whole) === item.answer.value.whole && parseInteger(raw.numerator) === item.answer.value.numerator && parseInteger(raw.denominator) === item.answer.value.denominator;
    if (kind === 'rectangle') return parseInteger(raw.perimeter) === item.answer.value.perimeter && parseInteger(raw.area) === item.answer.value.area;
    return false;
  }

  function fixedExamples() {
    return {
      naturalOrder: [40125, 40215, 42015, 42105], precedence: 240 + 18 * 6 - 72 / 8,
      remainder: { quotient: Math.floor(437 / 12), remainder: 437 % 12 },
      divisibility: [2, 3, 5, 9, 10].filter((rule) => 315 % rule === 0),
      gcdLcm: { gcd: gcd(24, 40), lcm: (24 * 40) / gcd(24, 40) },
      fractionCompare: 5 * 8 > 3 * 8 ? '>' : '<', fractionOf: (3 * 40) / 5,
      mixedFraction: { whole: 1, numerator: 4 + 5 - 7, denominator: 7 },
      decimalAdd: 1275 + 360, decimalMultiply: 720 * 4, decimalDivide: 1890 / 7,
      average: (420 + 510 + 600) / 3, rectangle: { perimeter: 2 * (8 + 5), area: 8 * 5 },
      equationA: (50 - 14) / 6, equationB: (31 - 7) / 3
    };
  }

  return { normalizeSeed, xorshift32, randInt, parseInteger, parseHundredths, formatHundredths, generateExpedition, classifyAttempt, initialAttempt, canReveal, reduceAttempt, isCorrect, fixedExamples };
});
