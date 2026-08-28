'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const scene = require('../activities/math/06-grade5-lighthouse/lighthouse-scene.js');

function makeRoot() {
  let writes = 0;
  const windows = Array.from({ length: 5 }, () => ({ dataset: {} }));
  const lantern = { dataset: {} };
  const beam = { dataset: {} };
  const attributes = new Map([['aria-label', '']]);
  return {
    windows, lantern, beam,
    root: {
      dataset: {},
      querySelectorAll(selector) { return selector === '.window-light' ? windows : []; },
      querySelector(selector) { return selector === '.lantern-light' ? lantern : selector === '.beam' ? beam : null; },
      getAttribute(name) { return attributes.get(name) || null; },
      setAttribute(name, value) { attributes.set(name, String(value)); writes += 1; }
    },
    label: () => attributes.get('aria-label'),
    writes: () => writes
  };
}

assert.equal(scene.normalizeStage(-2), 0);
assert.equal(scene.normalizeStage(1.9), 1);
assert.equal(scene.normalizeStage(99), 6);

for (const stage of [0, 1, 2, 3, 4, 5, 6]) {
  const harness = makeRoot();
  scene.render(harness.root, { stage });
  assert.equal(harness.root.dataset.stage, String(stage));
  assert.equal(harness.windows.filter((node) => node.dataset.lit === 'true').length, stage === 6 ? 5 : stage);
  assert.equal(harness.lantern.dataset.lit, String(stage === 6));
  assert.equal(harness.beam.dataset.lit, String(stage === 6));
  if (stage === 0) assert.match(harness.label(), /світяться 0 з 5 вікон; ліхтар ще не світить/);
  if (stage === 1) assert.match(harness.label(), /світяться 1 з 5 вікон; ліхтар ще не світить/);
  if (stage === 6) assert.match(harness.label(), /світяться всі 5 вікон; ліхтар і промінь світять/);
  const snapshot = JSON.stringify({ dataset: harness.root.dataset, windows: harness.windows, lantern: harness.lantern, beam: harness.beam, label: harness.label() });
  scene.render(harness.root, { stage });
  assert.equal(JSON.stringify({ dataset: harness.root.dataset, windows: harness.windows, lantern: harness.lantern, beam: harness.beam, label: harness.label() }), snapshot, `${stage}: idempotent projection`);
}

const root = path.join(__dirname, '../activities/math/06-grade5-lighthouse');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'lighthouse-scene.css'), 'utf8');
assert.equal((html.match(/class="window-light window-light-\d"/g) || []).length, 5);
for (let index = 1; index <= 5; index += 1) assert.match(css, new RegExp(`\\.window-light-${index} \\{ top:`));
assert.match(css, /\.window-light\[data-lit="true"\]/);
assert.match(css, /\.lantern-light\[data-lit="true"\]/);
assert.match(css, /\.beam\[data-lit="true"\]/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/);
for (const property of [...css.matchAll(/transition:\s*([^;]+)/g)].flatMap((match) => match[1].split(',').map((entry) => entry.trim().split(/\s+/)[0]))) {
  assert.ok(['opacity', 'transform', 'none'].includes(property), `only opacity/transform may animate: ${property}`);
}

console.log('PASS: scene stages 0–6, accessible names, overlays, idempotence and reduced motion');