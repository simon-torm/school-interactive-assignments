'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const scene = require('../activities/math/06-grade5-lighthouse/lighthouse-scene.js');

class ClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

function makeHarness({ reduced = false } = {}) {
  const current = { src: 'lighthouse-0.webp', classList: new ClassList() };
  const next = { src: 'lighthouse-0.webp', classList: new ClassList() };
  const attributes = new Map([['aria-label', '']]);
  const scheduled = [];
  const cancelled = [];
  const loaded = [];
  const root = {
    dataset: {},
    querySelector(selector) {
      if (selector === '.scene-image-current') return current;
      if (selector === '.scene-image-next') return next;
      return null;
    },
    getAttribute(name) { return attributes.get(name) || null; },
    setAttribute(name, value) { attributes.set(name, String(value)); }
  };
  const controller = scene.createController(root, {
    reducedMotion: () => reduced,
    preload: async (source) => { loaded.push(source); },
    schedule: (callback) => { scheduled.push(callback); return scheduled.length; },
    cancel: (id) => { cancelled.push(id); }
  });
  return { root, current, next, scheduled, cancelled, loaded, controller, label: () => attributes.get('aria-label') };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

async function main() {
  assert.equal(scene.normalizeStage(-2), 0);
  assert.equal(scene.normalizeStage(1.9), 1);
  assert.equal(scene.normalizeStage(99), 6);
  for (let stage = 0; stage <= 6; stage += 1) {
    assert.equal(scene.stagePath(stage), `lighthouse-${stage}.webp`);
    assert.match(scene.stageLabel(stage), new RegExp(`стан ${stage} із 6`));
  }

  const harness = makeHarness();
  harness.controller.render({ stage: 0 });
  assert.equal(harness.current.src, 'lighthouse-0.webp');
  assert.equal(harness.root.dataset.stage, '0');
  assert.match(harness.label(), /стан 0 із 6/);
  assert.ok(harness.loaded.includes('lighthouse-1.webp'), 'the next state is preloaded');

  harness.controller.render({ stage: 1 });
  await flushPromises();
  assert.equal(harness.next.src, 'lighthouse-1.webp');
  assert.equal(harness.next.classList.contains('is-visible'), true, 'next layer crossfades over current');
  assert.equal(harness.scheduled.length, 1, 'one promotion is scheduled');
  assert.equal(harness.root.dataset.stage, '1', 'accessible state follows game state immediately');
  assert.match(harness.label(), /стан 1 із 6/);

  harness.controller.render({ stage: 1 });
  harness.controller.render({ stage: 2 });
  await flushPromises();
  assert.equal(harness.scheduled.length, 1, 'repeated or rapid renders cannot start a second concurrent transition');
  harness.scheduled.shift()();
  await flushPromises();
  assert.equal(harness.current.src, 'lighthouse-1.webp', 'completed layer is promoted without a blank frame');
  assert.equal(harness.next.src, 'lighthouse-2.webp', 'queued newer state starts after promotion');
  assert.equal(harness.scheduled.length, 1);
  harness.scheduled.shift()();
  await flushPromises();
  assert.equal(harness.current.src, 'lighthouse-2.webp');
  assert.equal(harness.next.classList.contains('is-visible'), false);

  harness.controller.render({ stage: 3 });
  await flushPromises();
  harness.controller.render({ stage: 0 });
  assert.equal(harness.current.src, 'lighthouse-0.webp', 'reset/failure returns immediately and deterministically to state 0');
  assert.equal(harness.next.src, 'lighthouse-0.webp');
  assert.equal(harness.next.classList.contains('is-visible'), false);
  assert.ok(harness.cancelled.length >= 1, 'reset cancels an active promotion');

  const reduced = makeHarness({ reduced: true });
  reduced.controller.render({ stage: 4 });
  assert.equal(reduced.current.src, 'lighthouse-4.webp');
  assert.equal(reduced.scheduled.length, 0, 'reduced motion switches without a crossfade');

  const root = path.join(__dirname, '../activities/math/06-grade5-lighthouse');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'lighthouse-scene.css'), 'utf8');
  assert.equal((html.match(/class="scene-image scene-image-(?:current|next)"/g) || []).length, 2, 'scene uses exactly two image layers');
  assert.doesNotMatch(`${html}\n${css}`, /window-light|lantern-light|class="beam"|lighthouse-base\.webp/, 'obsolete synthetic lighting is absent');
  assert.match(css, /opacity\s+\.52s/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/);
  for (const property of [...css.matchAll(/transition:\s*([^;]+)/g)].flatMap((match) => match[1].split(',').map((entry) => entry.trim().split(/\s+/)[0]))) {
    assert.ok(['opacity', 'none'].includes(property), `only opacity may animate: ${property}`);
  }

  let aggregate = 0;
  for (let stage = 0; stage <= 6; stage += 1) {
    const asset = path.join(root, scene.stagePath(stage));
    assert.equal(fs.existsSync(asset), true, `state ${stage} local WebP exists`);
    const size = fs.statSync(asset).size;
    assert.ok(size <= 300 * 1024, `state ${stage} is at most 300KB`);
    aggregate += size;
  }
  assert.ok(aggregate <= 1500 * 1024, 'seven-state payload is at most 1.5MB');

  console.log('PASS: image states 0–6, preload/crossfade queue, reset, reduced motion, assets and obsolete-overlay removal');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});