'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const catalog = fs.readFileSync(path.join(root, 'assets/catalog.js'), 'utf8');

const legacyManifest = readJson('activities.json');
const currentManifest = readJson('activities-v2.json');
const pathPattern = /^activities\/(math|computer-science)\/(0[5-9]|1[01])-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/$/;

assert.equal(legacyManifest.schemaVersion, 1, 'stable legacy manifest must remain V1 for browsers that still cache the V1 catalog script');
assert.deepEqual(Object.keys(legacyManifest).sort(), ['activities', 'schemaVersion']);
for (const record of legacyManifest.activities) {
  assert.deepEqual(Object.keys(record).sort(), ['grades', 'id', 'path', 'subject', 'summary', 'title'], 'legacy records must use the exact V1 key set');
  const match = record.path.match(pathPattern);
  assert.ok(match, 'legacy activity path must match the V1 catalog contract');
  assert.equal(match[1], record.subject, 'legacy path subject must match its record');
  assert.equal(match[3], record.id, 'legacy path slug must match its record');
  assert.ok(record.grades.includes(Number(match[2])), 'legacy record grades must include its numeric path prefix');
}
assert.equal(currentManifest.schemaVersion, 2, 'the current catalog manifest must be versioned separately');
assert.match(catalog, /fetch\('\.\/activities-v2\.json'/, 'the current catalog script must read only the V2 manifest');
const currentIds = new Set(currentManifest.activities.map((record) => record.id));
assert.ok(legacyManifest.activities.every((record) => currentIds.has(record.id)), 'every legacy activity must remain available to current clients');

console.log('PASS: legacy V1 and current V2 manifests keep cached catalog clients compatible');
