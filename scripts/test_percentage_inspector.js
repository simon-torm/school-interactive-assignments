'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const activityPath = path.join(__dirname, '../activities/math/06-percentage-inspector/index.html');
const html = fs.readFileSync(activityPath, 'utf8');
const scriptMatch = html.match(/<script>\s*\(function\(\)\{([\s\S]*?)\}\)\(\);\s*<\/script>/);
assert.ok(scriptMatch, 'Percentage Inspector inline application script is extractable');
const source = scriptMatch[1];
const coreStart = source.indexOf('function randInt(');
const coreEnd = source.indexOf('/* ================= game state ================= */');
assert.ok(coreStart >= 0 && coreEnd > coreStart, 'generator core boundaries exist');
const generatorCore = `${source.slice(coreStart, coreEnd)}\nglobalThis.__core = { GENS, FRACS, WHOLES, PCTS, POOLS };`;

function seededMath(initialSeed) {
  const math = Object.create(Math);
  let value = initialSeed >>> 0;
  math.setSeed = (seed) => { value = seed >>> 0; };
  math.random = () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
  return math;
}

const math = seededMath(0);
const context = { Math: math };
vm.runInNewContext(generatorCore, context, { filename: 'percentage-inspector-generator-core.js' });
const core = context.__core;
const kinds = ['discount', 'claim', 'compare', 'whole', 'label'];

function plain(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function oracle(item) {
  const facts = item.facts;
  assert.ok(facts && typeof facts === 'object', `${item.kind}: exposes source facts for an independent oracle`);
  if (item.kind === 'discount') return facts.askPay ? facts.whole - facts.whole * facts.percent / 100 : facts.whole * facts.percent / 100;
  if (item.kind === 'claim') return (facts.whole - facts.newPrice) / facts.whole * 100;
  if (item.kind === 'compare') return Math.abs(
    facts.wholeA * (100 - facts.percentA) / 100 - facts.wholeB * (100 - facts.percentB) / 100
  );
  if (item.kind === 'whole') return facts.part * 100 / facts.percent;
  if (item.kind === 'label') return facts.source === 'fraction'
    ? facts.numerator * 100 / facts.denominator
    : Math.round(facts.decimal * 100 * 1e9) / 1e9;
  throw new Error(`unknown kind ${item.kind}`);
}

function verify(item, tier, label) {
  assert.equal(item.kind, label.split(':')[2], `${label}: requested generator family`);
  assert.ok(Number.isInteger(item.answer) && item.answer > 0 && item.answer <= 99999, `${label}: integer keypad-compatible answer`);
  assert.equal(item.answer, oracle(item), `${label}: independent answer oracle`);
  assert.ok(Array.isArray(item.ladder) && item.ladder.length >= 1, `${label}: non-empty hint ladder`);
  assert.ok(item.ladder.every((step) => typeof step === 'string' && plain(step).length > 4), `${label}: useful hint steps`);
  assert.ok(typeof item.solution === 'string' && plain(item.solution).length > 5, `${label}: solution exists`);

  if (item.kind === 'discount') {
    assert.equal(item.facts.cut, item.facts.whole * item.facts.percent / 100, `${label}: exact discount`);
  } else if (item.kind === 'claim') {
    assert.equal(item.judge.correct, item.facts.honest, `${label}: honesty judgment`);
    assert.equal(item.isLie, !item.facts.honest, `${label}: lie counter flag`);
    assert.equal(item.facts.claimedPercent === item.facts.percent, item.facts.honest, `${label}: displayed claim consistency`);
  } else if (item.kind === 'compare') {
    const finalA = item.facts.wholeA * (100 - item.facts.percentA) / 100;
    const finalB = item.facts.wholeB * (100 - item.facts.percentB) / 100;
    assert.equal(item.facts.finalA, finalA, `${label}: offer A final price`);
    assert.equal(item.facts.finalB, finalB, `${label}: offer B final price`);
    assert.notEqual(finalA, finalB, `${label}: comparison has a unique winner`);
    assert.equal(item.judge.correct, finalA < finalB ? 'A' : 'B', `${label}: comparison winner`);
    assert.ok(item.answer <= 400, `${label}: comparison remains mentally manageable`);
  } else if (item.kind === 'whole') {
    assert.equal(item.facts.part, item.facts.whole * item.facts.percent / 100, `${label}: part is derived from whole`);
  } else if (item.kind === 'label') {
    assert.ok(item.facts.source === 'fraction' || item.facts.source === 'decimal', `${label}: known label representation`);
    if (item.facts.source === 'fraction') {
      assert.match(item.sign, /class="fraction"/, `${label}: displayed source uses stacked fraction markup`);
      assert.match(item.solution, /class="fraction"/, `${label}: solution uses stacked fraction markup`);
      assert.doesNotMatch(`${item.sign}\n${item.solution}\n${item.checkBack(17)}`, /\b\d+\s*\/\s*\d+\b/, `${label}: no learner-facing slash fraction`);
    }
  }

  assert.ok(tier >= 1 && tier <= 4, `${label}: tier remains bounded`);
}

for (let seed = 0; seed < 2500; seed += 1) {
  math.setSeed(seed);
  const first = [];
  for (let tier = 1; tier <= 4; tier += 1) {
    for (const kind of kinds) {
      const item = core.GENS[kind](tier);
      verify(item, tier, `${seed}:${tier}:${kind}`);
      first.push(item);
    }
  }
  if (seed < 50) {
    math.setSeed(seed);
    const replay = [];
    for (let tier = 1; tier <= 4; tier += 1) {
      for (const kind of kinds) replay.push(core.GENS[kind](tier));
    }
    assert.equal(JSON.stringify(first), JSON.stringify(replay), `${seed}: deterministic replay`);
  }
}

assert.equal((html.match(/class="catalog-link"/g) || []).length, 1, 'exactly one catalog return link');
assert.match(html, /<a class="catalog-link"[^>]*href="\.\.\/\.\.\/\.\.\/"[^>]*>.*До каталогу<\/a>/s, 'catalog link targets the repository root');
assert.match(source, /\$\('catalog-link'\)\.hidden = name === 'play'/, 'catalog link never overlaps active game controls');
assert.match(html, /@media \(prefers-reduced-motion: reduce\)/, 'reduced-motion support');
assert.match(html, /prefers-color-scheme: dark/, 'automatic dark theme');
assert.match(html, /class="fraction" role="math" aria-label="2 поділити на 5"/, 'cheat sheet uses an accessible stacked fraction');
assert.doesNotMatch(html, /<form\b/i, 'no forms or learner-data submission');
assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/, 'no network primitives');
assert.doesNotMatch(html, /<(?:script|link|img)\b[^>]*(?:src|href)=["']https?:\/\//i, 'no remote runtime assets');
assert.match(source, /G\.tier = Math\.min\(4, G\.tier\+1\)/, 'adaptation caps the highest tier');
assert.match(source, /G\.tier = Math\.max\(1, G\.tier-1\)/, 'adaptation floors the lowest tier');
assert.match(source, /catch\(e\)\{ return null; \}/, 'localStorage failures fall back safely');

console.log('PASS: five Percentage Inspector generators, independent oracle, replay, hints, fractions, privacy and adaptation across 50,000 seeded cases');
