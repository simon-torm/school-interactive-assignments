'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const activityRoot = path.join(__dirname, '../activities/math/06-grade5-lighthouse');
const css = fs.readFileSync(path.join(activityRoot, 'lighthouse-scene.css'), 'utf8');
const renderer = fs.readFileSync(path.join(activityRoot, 'lighthouse-scene.js'), 'utf8');
const game = require(path.join(activityRoot, 'game-model.js'));
const scene = require(path.join(activityRoot, 'lighthouse-scene.js'));

// Wave 4 stays CSS-native: the scene remains complete when no optional asset loads.
assert.doesNotMatch(css, /url\s*\(/i, 'scene must not depend on an image asset');
assert.doesNotMatch(`${css}\n${renderer}`, /https?:|fetch\s*\(|new\s+Image\s*\(/i, 'scene must make no remote or image request');

// Each existing scene element owns a distinct silhouette detail without extra DOM.
assert.match(css, /\.lighthouse-scene::before\s*\{[^}]*background:/s, 'scene has a CSS horizon layer');
assert.match(css, /\.lighthouse-scene \.tower::before\s*\{[^}]*background:/s, 'tower has a visible window layer');
assert.match(css, /\.lighthouse-scene \.tower::after\s*\{[^}]*background:/s, 'tower has a visible door layer');
assert.match(css, /\.lighthouse-scene \.lantern::before\s*\{[^}]*background:/s, 'lantern has a roof silhouette');
assert.match(css, /\.lighthouse-scene \.lantern::after\s*\{[^}]*background:/s, 'lantern has a gallery silhouette');
assert.match(css, /\.lighthouse-scene \.shore::before\s*\{[^}]*background:/s, 'shore has a foreground rock layer');
assert.match(css, /\.hero > \.lighthouse-scene\s*\{[^}]*bottom:\s*2rem/s, 'wide scene clears the shell overlap for crop safety');

// Motion remains composited and reduced motion resolves directly to the final frame.
for (const block of css.matchAll(/@keyframes[^\{]+\{([\s\S]*?)\n\}/g)) {
  const declarations = [...block[1].matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]);
  assert.ok(declarations.every((property) => ['opacity', 'transform'].includes(property)), `non-composited keyframe property: ${declarations.join(', ')}`);
}
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.harbor-access\s*\{[^}]*transition:\s*none/s);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.is-lit \.beam\s*\{[^}]*animation:\s*none/s);

function makeSceneRoot() {
  const classes = new Set();
  const parts = { '[data-scene-part="harbor-access"]': { dataset: {} } };
  const properties = new Map();
  let writes = 0;
  return {
    root: {
      dataset: {},
      classList: {
        toggle(name, force) {
          const present = classes.has(name);
          if (Boolean(force) !== present) {
            writes += 1;
            if (force) classes.add(name); else classes.delete(name);
          }
        }
      },
      style: {
        getPropertyValue(name) { return properties.get(name) || ''; },
        setProperty(name, value) { properties.set(name, String(value)); writes += 1; }
      },
      setAttribute(name, value) {
        if (this[name] !== String(value)) { this[name] = String(value); writes += 1; }
      },
      querySelector(selector) { return parts[selector] || null; }
    },
    classes,
    parts,
    properties,
    writes: () => writes
  };
}

// Every valid restoration snapshot reaches a stable renderer projection.
const ranges = game.COUNTS.map((maximum) => Array.from({ length: maximum + 1 }, (_, level) => level));
let snapshotCount = 0;
for (const harborPath of ranges[0]) for (const workshopGears of ranges[1]) {
  for (const fractionBridge of ranges[2]) for (const lightReservoir of ranges[3]) {
    for (const geometryGarden of ranges[4]) for (const controlConsole of ranges[5]) {
      const state = game.createState(snapshotCount + 1);
      state.restoration = { harborPath, workshopGears, fractionBridge, lightReservoir, geometryGarden, controlConsole };
      const harness = makeSceneRoot();
      scene.renderLighthouseScene(harness.root, game.selectWorld(state));
      assert.deepEqual(harness.root.dataset, {
        harborPath: String(harborPath), workshopGears: String(workshopGears), fractionBridge: String(fractionBridge),
        lightReservoir: String(lightReservoir), geometryGarden: String(geometryGarden), controlConsole: String(controlConsole),
        lit: 'false', beamSwept: 'false'
      });
      for (const [system, level] of Object.entries(state.restoration)) {
        assert.equal(harness.properties.get(`--${system.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}-level`), String(level));
      }
      const writes = harness.writes();
      scene.renderLighthouseScene(harness.root, game.selectWorld(state));
      assert.equal(harness.writes(), writes, 'rendering an identical snapshot is idempotent');
      snapshotCount += 1;
    }
  }
}
assert.equal(snapshotCount, 8064, 'all [3,2,3,7,2,6] restoration combinations are rendered');

const complete = game.createState(999);
complete.restoration = Object.fromEntries(game.SYSTEMS.map((system, index) => [system, game.COUNTS[index]]));
complete.finale = { lampLit: true, beamSwept: true };
const completeHarness = makeSceneRoot();
scene.renderLighthouseScene(completeHarness.root, game.selectWorld(complete));
assert.equal(completeHarness.classes.has('is-fully-restored'), true);
assert.equal(completeHarness.classes.has('is-lit'), true);
assert.equal(completeHarness.classes.has('has-swept-beam'), true);
assert.match(completeHarness.root['aria-label'], /усі шість систем мають видимі відновлені частини/i);

// Canonical lifecycle boundaries keep the projection isolated from replay and stale work.
let replay = game.createState(77);
for (let index = 0; index < game.COUNTS[0]; index += 1) {
  replay = game.enterChallenge(replay, index, `canonical-${index}`);
  replay = game.reduce(replay, { type: 'CHECK_CORRECT', id: `canonical-${index}` });
}
replay = game.enterChallenge(replay, 3, 'canonical-next');
const canonicalWorld = game.selectWorld(replay);
replay = game.reduce(replay, { type: 'START_PRACTICE_REPLAY', station: 0, id: 'practice-0' });
replay = game.reduce(replay, { type: 'CHECK_CORRECT', id: 'practice-0' });
assert.deepEqual(game.selectWorld(replay).restoration, canonicalWorld.restoration, 'practice replay is absent from the scene projection');

const fatal = game.reduce(replay, { type: 'FATAL', code: 'scene-check' });
assert.deepEqual(game.selectWorld(fatal).restoration, canonicalWorld.restoration, 'fatal state preserves the last canonical scene');
const restarted = game.reduce(fatal, { type: 'RESTART_SAME_SEED' });
assert.deepEqual(game.selectWorld(restarted).restoration, game.selectWorld(game.createState(77)).restoration, 'restart resets every scene consequence');

const finalePlaying = game.reduce(complete, { type: 'FINALE_PLAY' });
const staleFinaleTokens = { runToken: finalePlaying.runToken, challengeToken: finalePlaying.challengeToken };
const restartedFinale = game.reduce(finalePlaying, { type: 'RESTART_SAME_SEED' });
assert.deepEqual(
  game.reduce(restartedFinale, { type: 'FINALE_COMPLETE', ...staleFinaleTokens }),
  restartedFinale,
  'a stale finale callback cannot relight a restarted scene'
);

// Each counter controls a distinct non-colour visual geometry, not another progress widget.
for (const system of game.SYSTEMS) assert.match(css, new RegExp(`data-${system.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`), `${system} owns a scene selector`);
assert.match(css, /data-workshop-gears[^\n]*::after[\s\S]*?content:/, 'workshop levels change visible gear count');
assert.match(css, /data-fraction-bridge[\s\S]*?\.harbor-access::after[\s\S]*?width:/, 'bridge levels change span geometry');
assert.match(css, /data-light-reservoir[\s\S]*?\.lantern[\s\S]*?background-size:/, 'reservoir levels change a physical gauge length');
assert.match(css, /data-geometry-garden[^\n]*\.shore::after[\s\S]*?content:/, 'garden levels add visible plants');
assert.match(css, /data-control-console[\s\S]*?\.tower::before[\s\S]*?box-shadow:/, 'console levels add visible signal markers');
assert.doesNotMatch(css, /progress|counter|badge/i, 'principal scene does not introduce duplicate progress UI');

console.log('PASS: Lighthouse CSS scene layers and fallback contract');
