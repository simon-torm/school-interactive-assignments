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

  function primeFactors(value) {
    const factors = [];
    let rest = value;
    for (let divisor = 2; divisor * divisor <= rest; divisor += 1) {
      while (rest % divisor === 0) { factors.push(divisor); rest /= divisor; }
    }
    if (rest > 1) factors.push(rest);
    return factors;
  }

  function multisetIntersection(left, right) {
    const remaining = [...right], common = [];
    left.forEach((factor) => { const index = remaining.indexOf(factor); if (index >= 0) { common.push(factor); remaining.splice(index, 1); } });
    return common;
  }

  function multisetUnion(left, right) {
    const union = [...left], remaining = [...left];
    right.forEach((factor) => { const index = remaining.indexOf(factor); if (index >= 0) remaining.splice(index, 1); else union.push(factor); });
    return union.sort((a, b) => a - b);
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

  function fractionToken(numerator, denominator) {
    return { kind: 'fraction', numerator, denominator };
  }

  function mixedToken(whole, numerator, denominator) {
    return { kind: 'mixed', whole, fraction: fractionToken(numerator, denominator) };
  }

  function gcdByTrial(a, b) {
    let found = 1;
    for (let divisor = 1; divisor <= Math.min(a, b); divisor += 1) if (a % divisor === 0 && b % divisor === 0) found = divisor;
    return found;
  }

  function lcmBySearch(a, b) {
    for (let multiple = Math.max(a, b); multiple <= a * b; multiple += 1) if (multiple % a === 0 && multiple % b === 0) return multiple;
    throw new Error('LCM oracle exhausted');
  }

  function oracleFor(type, data) {
    if (type === 'naturalOrder') return [...data.values].sort((a, b) => a - b);
    if (type === 'precedence') return data.a + data.b * data.c - data.d / data.e;
    if (type === 'remainder') return { quotient: Math.floor(data.N / data.d), remainder: data.N % data.d };
    if (type === 'divisibility') return [2, 3, 5, 9, 10].filter((rule) => data.n % rule === 0);
    if (type === 'gcdLcm') return { gcd: gcdByTrial(data.A, data.B), lcm: lcmBySearch(data.A, data.B) };
    if (type === 'fractionCompare') return data.a * data.d > data.b * data.d ? '>' : '<';
    if (type === 'fractionOf') return Array(data.n).fill(data.T / data.d).reduce((sum, value) => sum + value, 0);
    if (type === 'mixedFraction') return { whole: 1, numerator: data.a + data.b - data.d, denominator: data.d };
    if (type === 'decimalCompare') return data.x > data.y ? '>' : '<';
    if (type === 'decimalRound') return Math.floor((data.cents + 5) / 10) * 10;
    if (type === 'decimalAdd') return data.x + data.y;
    if (type === 'decimalSubtract') return data.x - data.y;
    if (type === 'decimalMultiply') return Array(data.m).fill(data.x).reduce((sum, value) => sum + value, 0);
    if (type === 'decimalDivide') return data.x / data.d;
    if (type === 'average') return (data.p + data.q + data.r) / 3;
    if (type === 'rectangle') return { perimeter: data.a + data.b + data.a + data.b, area: Array(data.a).fill(data.b).reduce((sum, value) => sum + value, 0) };
    if (type === 'equation') return (data.b - data.a) / data.m;
    throw new Error(`unknown oracle type: ${type}`);
  }

  function prompt(id, strand, type, question, result, hints, solution, data, errorRules = { incorrect: 'Відповідь поки не відповідає умові.' }) {
    const mechanics = {
      naturalOrder: 'crate-sort', precedence: 'operation-slots', remainder: 'equal-crates', divisibility: 'gear-toggles',
      gcdLcm: 'prime-factor-workbench', fractionCompare: 'fraction-bars', fractionOf: 'equal-group-trays', mixedFraction: 'piece-to-whole',
      decimalCompare: 'place-value-rack', decimalRound: 'rounding-strip', decimalAdd: 'column-add', decimalSubtract: 'column-subtract',
      decimalMultiply: 'batch-bins', decimalDivide: 'division-channels', average: 'water-balance', rectangle: 'formula-routing', equation: 'balance-boxes'
    };
    const scaffoldByType = {
      precedence: `Заповни два проміжні вікна: ${data.b} × ${data.c} = □ і ${data.d} ÷ ${data.e} = □.`,
      remainder: `Перевір модель ${data.d} × □ + □ = ${data.N}, де остача менша за ${data.d}.`,
      divisibility: `Зістав останню цифру ${String(data.n).slice(-1)} та суму цифр із кожною ознакою окремо.`,
      decimalCompare: 'Підсвіти перший розряд, у якому цифри відрізняються.',
      average: 'Урівноваж три стовпчики, зберігаючи їхню загальну кількість сотих.',
      rectangle: `Постав формулу 2·(${data.a}+${data.b}) до огорожі, а ${data.a}·${data.b} — до ґрунту.`,
      equation: `На терезах спершу прибери ${data.a} окремих ламп, а решту поділи на ${data.m} коробок.`
    };
    const progressiveHints = hints.length === 2 ? [...hints, scaffoldByType[type] || 'Познач один наступний крок у візуальній моделі, не обчислюючи всю відповідь одразу.'] : hints;
    const oracle = (instance) => oracleFor(type, instance);
    const validate = (instance) => Boolean(instance && JSON.stringify(oracle(instance)) === JSON.stringify(result.value));
    return { id, strand, type, question, answer: result, hints: progressiveHints, solution, data, errorRules, difficultyClass: type, mechanicData: { kind: mechanics[type] }, validate, oracle };
  }

  function naturalOrder(rng, id = 'natural-order') {
    function sameLeadingPair(digits) {
      const place = 10 ** (digits - 1), lead = randInt(rng, 1, 9);
      const left = lead * place + randInt(rng, 0, place - 1);
      let right = left;
      for (let attempt = 0; right === left && attempt < 64; attempt += 1) right = lead * place + randInt(rng, 0, place - 1);
      if (right === left) throw new Error('natural ordering pair exhausted');
      return [left, right];
    }
    const list = sameLeadingPair(5).concat(sameLeadingPair(6));
    for (let position = list.length - 1; position > 0; position -= 1) {
      const target = randInt(rng, 0, position);
      [list[position], list[target]] = [list[target], list[position]];
    }
    const sorted = [...list].sort((a, b) => a - b);
    if (list.every((value, position) => value === sorted[position])) [list[0], list[1]] = [list[1], list[0]];
    const display = sorted.join(' < ');
    const pair = sorted.filter((value) => String(value).length === 5);
    const leftDigits = String(pair[0]), rightDigits = String(pair[1]);
    const index = [...leftDigits].findIndex((digit, position) => digit !== rightDigits[position]);
    const firstDifferingPlace = { left: Number(leftDigits[index]), right: Number(rightDigits[index]), index };
    return prompt(id, 'natural', 'naturalOrder', `Розташуй числа від найменшого до найбільшого: ${list.join('; ')}.`, answer(sorted, display, 'order'), ['Число з більшою кількістю цифр є більшим.', 'Для чисел однакової довжини порівнюй цифри від найвищого розряду.', `У п’ятицифровій парі перші різні цифри: ${firstDifferingPlace.left} і ${firstDifferingPlace.right}.`], `Правильний порядок: ${display}.`, { values: list, firstDifferingPlace }, { incorrectOrder: 'Дві скрині стоять у неправильному взаємному порядку.', invalid: 'Розмісти кожну з чотирьох скринь рівно один раз.' });
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
    const candidates = [];
    for (let value = 2; value <= 120; value += 1) if (primeFactors(value).length >= 4 && primeFactors(value).length <= 8) candidates.push(value);
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const A = candidates[randInt(rng, 0, candidates.length - 1)], B = candidates[randInt(rng, 0, candidates.length - 1)];
      if (A === B || gcd(A, B) === 1) continue;
      const factorsA = primeFactors(A), factorsB = primeFactors(B);
      const commonFactors = multisetIntersection(factorsA, factorsB), lcmFactors = multisetUnion(factorsA, factorsB);
      if (!commonFactors.length || lcmFactors.length === factorsA.length || lcmFactors.length === factorsB.length) continue;
      const value = { gcd: commonFactors.reduce((product, factor) => product * factor, 1), lcm: lcmFactors.reduce((product, factor) => product * factor, 1) };
      const display = `НСД ${value.gcd}; НСК ${value.lcm}`;
      return prompt(id, 'divisibility', 'gcdLcm', `Знайди НСД і НСК чисел ${A} та ${B}.`, answer(value, display, 'gcdLcm'), ['Розклади обидва числа на повторювані прості множники.', 'Для НСД візьми спільні копії; для НСК доповни повний розклад одного числа відсутніми копіями другого.', `Почни з найменшого простого дільника 2, 3 або 5, який підходить до ${A} чи ${B}.`], `${A} = ${factorsA.join('·')}; ${B} = ${factorsB.join('·')}. Спільні копії ${commonFactors.join('·')} дають НСД ${value.gcd}; повний набір ${lcmFactors.join('·')} дає НСК ${value.lcm}. Відповідь: ${display}.`, { A, B, factorsA, factorsB, commonFactors, lcmFactors }, { invalidFactor: 'Одна з вибраних плиток не ділить відповідне число.', commonMismatch: 'Кільце НСД містить множник, якого немає в обох рядах.', lcmMissing: 'У шестерні НСК бракує простої копії з одного розкладу.' });
    }
    throw new Error('GCD/LCM exhausted');
  }

  function fractionCompare(rng, id = 'fraction-compare') {
    const d = randInt(rng, 3, 12);
    let a = randInt(rng, 1, d - 1), b = randInt(rng, 1, d - 1);
    for (let attempt = 0; a === b && attempt < 64; attempt += 1) b = randInt(rng, 1, d - 1);
    if (a === b) throw new Error('fraction comparison exhausted');
    const value = a > b ? '>' : '<';
    return prompt(id, 'fractions', 'fractionCompare', ['Постав знак < або >: ', fractionToken(a, d), ' ___ ', fractionToken(b, d), '.'], answer(value, value, 'choice'), ['За однакових знаменників частини мають однаковий розмір.', 'Порівняй кількість вибраних частин — чисельники.', `Зосередься на чисельниках ${a} і ${b}; знаменник не змінюй.`], ['Знаменники однакові, а ', String(a), ` ${value} `, String(b), ', тому ', fractionToken(a, d), ` ${value} `, fractionToken(b, d), '.'], { a, b, d }, { wrongRelation: 'Обраний знак спрямований до меншої зафарбованої частини.', invalid: 'Обери один знак між двома смугами.' });
  }

  function fractionOf(rng, id = 'fraction-of') {
    const d = randInt(rng, 2, 10), n = randInt(rng, 1, d - 1), k = randInt(rng, 3, 20), T = d * k, value = n * k;
    return prompt(id, 'fractions', 'fractionOf', ['Знайди ', fractionToken(n, d), ` від числа ${T}.`], answer(value), ['Знаменник показує кількість рівних груп.', `Знайди одну групу дією ${T} ÷ ${d}.`, `Активуй ${n} рівні групи, не змінюючи їх розміру.`], `${T} ÷ ${d} = ${k}; ${k} × ${n} = ${value}.`, { d, n, k, T }, { unequalGroups: 'Ліхтарі розподілені на нерівні групи.', wrongGroups: `Кількість вибраних груп не дорівнює чисельнику ${n}.` });
  }

  function mixedFraction(rng, id = 'mixed-fraction') {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const d = randInt(rng, 3, 12), a = randInt(rng, 1, d - 1), b = randInt(rng, 1, d - 1), remainder = a + b - d;
      if (remainder <= 0 || a + b >= 2 * d || gcd(remainder, d) !== 1) continue;
      const value = { whole: 1, numerator: remainder, denominator: d };
      const display = mixedToken(1, remainder, d);
      return prompt(id, 'fractions', 'mixedFraction', ['Додай і запиши мішаним числом у найпростішому вигляді: ', fractionToken(a, d), ' + ', fractionToken(b, d), '.'], answer(value, display, 'mixed'), ['За однакових знаменників додай чисельники, а знаменник залиш.', `Збери ${d} частинок в одну цілу.` , 'Після цілого залиш правильний нескоротний дріб.'], [fractionToken(a, d), ' + ', fractionToken(b, d), ' = ', fractionToken(a + b, d), ' = ', display, '.'], { a, b, d }, { denominatorChanged: 'Знаменник має залишитися таким самим.', improperRemainder: 'Після виділення цілого залишок має бути меншим за знаменник.', piecesMismatch: 'Клітинки не відповідають зібраним частинкам.' });
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
    const cents = randInt(rng, 1, 999) * 10 + randInt(rng, 0, 9), value = Math.floor((cents + 5) / 10) * 10;
    return prompt(id, 'decimals', 'decimalRound', `Округли ${formatHundredths(cents, true)} до десятих. Якщо сота 5–9, збільш десяту на 1.`, answer(value, formatHundredths(value, true), 'decimal'), ['Подивись на цифру сотих.', 'Цифри 0–4 залишають десяті без зміни, а 5–9 збільшують їх на 1.', `Цифра сотих — ${cents % 10}; обери сусідню десяту за цим правилом.`], `${formatHundredths(cents, true)} ≈ ${formatHundredths(value, true)} до десятих.`, { cents });
  }

  function decimalOperation(rng, type, id) {
    let x, y, m, d, value, question, firstStep, mechanics = {};
    if (type === 'decimalAdd') {
      for (let attempt = 0; attempt < 64; attempt += 1) {
        x = randInt(rng, 10, 490) * 10 + randInt(rng, 5, 9);
        y = randInt(rng, 10, 490) * 10 + randInt(rng, 10 - (x % 10), 9);
        if (x + y <= 9999) break;
      }
      value = x + y; question = `Обчисли: ${formatHundredths(x, true)} + ${formatHundredths(y, true)}.`; firstStep = 'Додавай соті до сотих, десяті до десятих.';
      mechanics = { carry: { required: true, columns: ['hundredths'] } };
    } else if (type === 'decimalSubtract') {
      const needsBorrow = randInt(rng, 0, 1) === 1;
      const xUnit = needsBorrow ? randInt(rng, 0, 4) : randInt(rng, 5, 9);
      const yUnit = needsBorrow ? randInt(rng, xUnit + 1, 9) : randInt(rng, 0, xUnit);
      x = randInt(rng, 200, 999) * 10 + xUnit;
      y = randInt(rng, 10, Math.floor((x - 100) / 10)) * 10 + yUnit;
      value = x - y;
      question = `Обчисли: ${formatHundredths(x, true)} − ${formatHundredths(y, true)}.`;
      firstStep = needsBorrow ? 'Вирівняй коми; у сотих потрібно позичити одну десяту.' : 'Вирівняй коми; віднімай соті напряму.';
      mechanics = { borrow: { required: needsBorrow, columns: needsBorrow ? ['hundredths'] : [] } };
    } else if (type === 'decimalMultiply') {
      m = randInt(rng, 2, 9);
      for (let attempt = 0; attempt < 64; attempt += 1) {
        x = randInt(rng, 1, Math.min(250, Math.floor(999 / m))) * 10 + randInt(rng, Math.ceil(10 / m), 9);
        value = x * m;
        if (value <= 9999) break;
      }
      question = `Обчисли: ${formatHundredths(x, true)} × ${m}.`; firstStep = `Помнож кількість сотих на ${m}.`;
      mechanics = { carry: { required: true, columns: ['hundredths'] } };
    } else {
      d = randInt(rng, 2, 9); value = randInt(rng, 10, Math.min(2500, Math.floor(9999 / d))); x = value * d;
      question = `Обчисли: ${formatHundredths(x, true)} ÷ ${d}.`; firstStep = `Поділи кількість сотих на ${d}.`;
    }
    if (!Number.isInteger(value) || value < 0 || value > 9999) throw new Error(`${type} exhausted`);
    const display = formatHundredths(value, true);
    const result = prompt(id, 'decimals', type, question, answer(value, display, 'decimal'), [firstStep, 'Працюй з однойменними розрядами справа наліво.', `Подай усі числа в сотих і перевір проміжний крок.`], `Точний результат: ${display}.`, { x, y, m, d });
    Object.assign(result.mechanicData, mechanics);
    return result;
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
    const display = `P = ${value.perimeter} см; S = ${value.area} см²`;
    return prompt(id, 'geometry', 'rectangle', `Прямокутник має сторони ${a} см і ${b} см. Знайди периметр у см та площу в см².`, answer(value, display, 'rectangle'), ['Периметр — сума чотирьох сторін; площа — добуток довжини й ширини.', `P = 2 × (${a} + ${b}); S = ${a} × ${b}.`], `P = 2 × (${a} + ${b}); S = ${a} × ${b}. Відповідь: ${display}.`, { a, b });
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
    return !state.correct && !state.solutionRevealed && (state.wrongChecks >= 3 || state.hintsUsed >= 3);
  }

  function reduceAttempt(state, event) {
    if (state.correct || state.solutionRevealed) return { ...state };
    if (event === 'hint') return { ...state, hintsUsed: Math.min(3, state.hintsUsed + 1) };
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
    const consequential = ['operation-slots', 'column-add', 'column-subtract', 'batch-bins', 'division-channels', 'water-balance', 'balance-boxes'].includes(item.mechanicData.kind);
    if (consequential && (!raw || typeof raw !== 'object' || raw.mechanicComplete !== true)) return false;
    const scalar = consequential ? raw.value : raw;
    if (kind === 'integer') return parseInteger(scalar) === item.answer.value;
    if (kind === 'decimal') return parseHundredths(scalar) === item.answer.value;
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
    if (kind === 'remainder') return raw?.grouped === true && parseInteger(raw.quotient) === item.answer.value.quotient && parseInteger(raw.remainder) === item.answer.value.remainder;
    if (kind === 'gcdLcm') {
      const sameFactors = (actual, expected) => Array.isArray(actual) && actual.map(Number).sort((a, b) => a - b).join(',') === expected.join(',');
      return parseInteger(raw.gcd) === item.answer.value.gcd && parseInteger(raw.lcm) === item.answer.value.lcm &&
        sameFactors(raw.factorsA, item.data.factorsA) && sameFactors(raw.factorsB, item.data.factorsB) &&
        sameFactors(raw.commonFactors, item.data.commonFactors) && sameFactors(raw.lcmFactors, item.data.lcmFactors);
    }
    if (kind === 'mixed') return parseInteger(raw.whole) === item.answer.value.whole && parseInteger(raw.numerator) === item.answer.value.numerator && parseInteger(raw.denominator) === item.answer.value.denominator && parseInteger(raw.piecesMoved) === item.data.d;
    if (kind === 'rectangle') return raw?.routed === true && parseInteger(raw.perimeter) === item.answer.value.perimeter && parseInteger(raw.area) === item.answer.value.area;
    return false;
  }

  function diagnoseResponse(item, raw) {
    const rules = item.errorRules || {};
    const values = raw && typeof raw === 'object' ? Object.values(raw) : [raw];
    const empty = !values.length || values.some((value) => Array.isArray(value) ? !value.length : String(value ?? '').trim() === '');
    if (empty) return rules.invalid || rules.invalidFactor || 'Заповни або обери всі потрібні частини відповіді.';
    const sameFactors = (actual, expected) => Array.isArray(actual) && actual.map(Number).sort((a, b) => a - b).join(',') === expected.join(',');
    if (item.answer.kind === 'gcdLcm') {
      if (!sameFactors(raw.factorsA, item.data.factorsA) || !sameFactors(raw.factorsB, item.data.factorsB)) return rules.invalidFactor;
      if (!sameFactors(raw.commonFactors, item.data.commonFactors)) return rules.commonMismatch;
      if (!sameFactors(raw.lcmFactors, item.data.lcmFactors)) return rules.lcmMissing;
    }
    if (item.answer.kind === 'mixed') {
      if (parseInteger(raw.denominator) !== item.data.d) return rules.denominatorChanged;
      if (parseInteger(raw.numerator) >= parseInteger(raw.denominator)) return rules.improperRemainder;
      if (parseInteger(raw.piecesMoved) !== item.data.d) return rules.piecesMismatch;
    }
    if (item.answer.kind === 'order') return rules.incorrectOrder;
    if (item.answer.kind === 'choice') return rules.wrongRelation || rules.incorrect;
    if (item.answer.kind === 'rectangle' && raw.routed !== true) return rules.formulaRouting || rules.incorrect;
    return rules.incorrect || Object.values(rules)[0] || 'Подана відповідь не узгоджується з математичною моделлю.';
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

  return { normalizeSeed, xorshift32, randInt, parseInteger, parseHundredths, formatHundredths, fractionToken, mixedToken, generateExpedition, classifyAttempt, initialAttempt, canReveal, reduceAttempt, isCorrect, diagnoseResponse, fixedExamples };
});
