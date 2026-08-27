'use strict';

const assert = require('node:assert/strict');
const catalog = require('../assets/catalog.js');

const registry = [
  { id: 'review', label: 'Повторення', group: 'purpose' },
  { id: 'fractions', label: 'Звичайні дроби', group: 'topic' },
  { id: 'geometry', label: 'Геометрія', group: 'topic' },
  { id: 'game', label: 'Гра', group: 'format' }
];
const activities = [
  { id: 'fractions', subject: 'math', grades: [5, 6], tags: ['fractions', 'game'] },
  { id: 'review', subject: 'math', grades: [6], tags: ['review', 'fractions', 'geometry', 'game'] },
  { id: 'cs', subject: 'computer-science', grades: [6], tags: ['game'] }
];

assert.deepEqual(
  catalog.filterActivities(activities, { subject: 'math', grades: new Set(), tags: new Set() }).map((item) => item.id),
  ['fractions', 'review']
);
assert.deepEqual(
  catalog.filterActivities(activities, { subject: 'math', grades: new Set([5, 7]), tags: new Set() }).map((item) => item.id),
  ['fractions'],
  'grade filters use OR semantics'
);
assert.deepEqual(
  catalog.filterActivities(activities, { subject: 'math', grades: new Set(), tags: new Set(['review', 'fractions']) }).map((item) => item.id),
  ['review'],
  'tag filters use AND semantics'
);
assert.deepEqual(
  catalog.parseUrlState('?subject=math&grades=6,5,6&tags=fractions,review,bad', activities, registry),
  { subject: 'math', grades: new Set([6, 5]), tags: new Set(['fractions', 'review']) }
);
assert.deepEqual(
  catalog.parseUrlState('?subject=math&subject=computer-science&grades=6', activities, registry),
  { subject: null, grades: new Set(), tags: new Set() },
  'duplicate parameters fail closed'
);
assert.equal(
  catalog.canonicalQuery({ subject: 'math', grades: new Set([6, 5]), tags: new Set(['fractions', 'review']) }, registry),
  'subject=math&grades=5%2C6&tags=review%2Cfractions'
);
assert.equal(catalog.emptyMessage(0, false), 'Поки що немає завдань із цього предмета');
assert.equal(catalog.emptyMessage(0, true), 'Немає завдань для такого поєднання. Очисти один або кілька фільтрів.');
assert.deepEqual(catalog.availableTags('computer-science', activities, registry).map((tag) => tag.id), ['game']);
assert.deepEqual(catalog.availableTags('math', activities, registry).map((tag) => tag.id), ['review', 'fractions', 'geometry', 'game']);
console.log('PASS: catalog grade/tag filtering and URL state');
