(() => {
  'use strict';

  const SUBJECTS = {
    math: { title: 'Математика', description: 'Досліджуй числа, форми та закономірності.', mark: 'π' },
    'computer-science': { title: 'Інформатика', description: 'Розвивай алгоритмічне мислення та цифрову творчість.', mark: '{ }' }
  };
  const SUBJECT_ORDER = ['math', 'computer-science'];
  const PATH_PATTERN = /^activities\/(math|computer-science)\/(0[5-9]|1[01])-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/$/;
  const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
  const RECORD_KEYS = ['grades', 'id', 'path', 'subject', 'summary', 'tags', 'title'];
  const TAG_KEYS = ['group', 'id', 'label'];
  const GROUPS = ['purpose', 'topic', 'format'];
  const GROUP_LABELS = { purpose: 'Мета', topic: 'Тема', format: 'Формат' };
  const LEGACY_PATH_GRADE_BY_ACTIVITY_ID = Object.freeze({
    'grade5-lighthouse': 5,
    'grade4-lighthouse': 5
  });

  function filterActivities(items, selected) {
    return items.filter((activity) => activity.subject === selected.subject
      && (selected.grades.size === 0 || activity.grades.some((grade) => selected.grades.has(grade)))
      && [...selected.tags].every((tag) => activity.tags.includes(tag)));
  }

  function availableTags(subject, items, registry) {
    const used = new Set(items.filter((activity) => activity.subject === subject).flatMap((activity) => activity.tags));
    return registry.filter((tag) => used.has(tag.id));
  }

  function parseUrlState(search, items, registry) {
    const params = new URLSearchParams(search);
    const unique = (key) => params.getAll(key).length === 1 ? params.get(key) : null;
    const rawSubject = unique('subject');
    const subject = SUBJECT_ORDER.includes(rawSubject) ? rawSubject : null;
    if (!subject) return { subject: null, grades: new Set(), tags: new Set() };
    const grades = new Set();
    const rawGrades = unique('grades');
    if (rawGrades) rawGrades.split(',').forEach((value) => {
      const grade = Number(value);
      if (/^\d+$/.test(value) && Number.isInteger(grade) && grade >= 5 && grade <= 11) grades.add(grade);
    });
    const validTags = new Set(availableTags(subject, items, registry).map((tag) => tag.id));
    const tags = new Set();
    const rawTags = unique('tags');
    if (rawTags) rawTags.split(',').forEach((tag) => { if (validTags.has(tag)) tags.add(tag); });
    return { subject, grades, tags };
  }

  function canonicalQuery(selected, registry) {
    const params = new URLSearchParams();
    if (!selected.subject) return '';
    params.set('subject', selected.subject);
    const grades = [...selected.grades].sort((left, right) => left - right);
    if (grades.length) params.set('grades', grades.join(','));
    const order = new Map(registry.map((tag, index) => [tag.id, index]));
    const tags = [...selected.tags].filter((tag) => order.has(tag)).sort((left, right) => order.get(left) - order.get(right));
    if (tags.length) params.set('tags', tags.join(','));
    return params.toString();
  }

  function emptyMessage(activityCount, filtersActive) {
    if (activityCount === 0 && !filtersActive) return 'Поки що немає завдань із цього предмета';
    return 'Немає завдань для такого поєднання. Очисти один або кілька фільтрів.';
  }

  const publicApi = { filterActivities, availableTags, parseUrlState, canonicalQuery, emptyMessage };
  if (typeof module !== 'undefined' && module.exports) module.exports = publicApi;
  if (typeof document === 'undefined') return;

  const elements = {
    loading: document.querySelector('#loading-view'),
    error: document.querySelector('#error-view'),
    chooser: document.querySelector('#chooser-view'),
    catalog: document.querySelector('#catalog-view'),
    chooserTitle: document.querySelector('#chooser-title'),
    catalogTitle: document.querySelector('#catalog-title'),
    catalogDescription: document.querySelector('#catalog-description'),
    subjectMark: document.querySelector('#subject-mark'),
    gradeOptions: document.querySelector('#grade-options'),
    tagOptions: document.querySelector('#tag-options'),
    clearFilters: document.querySelector('#clear-filters'),
    resultCount: document.querySelector('#result-count'),
    grid: document.querySelector('#activity-grid'),
    empty: document.querySelector('#empty-state'),
    emptyMessage: document.querySelector('#empty-message'),
    retry: document.querySelector('#retry-button'),
    back: document.querySelector('#back-button')
  };

  let activities = [];
  let tagRegistry = [];
  let state = { subject: null, grades: new Set(), tags: new Set() };
  let hasAnnouncedResults = false;

  function hasExactKeys(value, expected) {
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
  }

  function validText(value, maximum) {
    return typeof value === 'string' && value.length >= 1 && value.length <= maximum && value === value.trim() && !CONTROL_PATTERN.test(value);
  }

  function validateManifest(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || !hasExactKeys(data, ['activities', 'schemaVersion', 'tags'])) {
      throw new Error('Invalid manifest envelope');
    }
    if (data.schemaVersion !== 2 || !Array.isArray(data.tags) || data.tags.length < 1 || !Array.isArray(data.activities)) throw new Error('Unsupported manifest');

    const tagIds = new Set();
    const groupLabels = new Set();
    let previousTagKey = null;
    data.tags.forEach((tag) => {
      if (!tag || typeof tag !== 'object' || Array.isArray(tag) || !hasExactKeys(tag, TAG_KEYS)) throw new Error('Invalid tag record');
      if (!validText(tag.id, 64) || !ID_PATTERN.test(tag.id) || !validText(tag.label, 40) || !GROUPS.includes(tag.group)) throw new Error('Invalid tag metadata');
      const groupLabel = `${tag.group}\u0000${tag.label}`;
      if (tagIds.has(tag.id) || groupLabels.has(groupLabel)) throw new Error('Duplicate tag');
      const sortKey = [GROUPS.indexOf(tag.group), tag.id];
      if (previousTagKey && compareKeys(previousTagKey, sortKey) >= 0) throw new Error('Invalid tag order');
      previousTagKey = sortKey;
      tagIds.add(tag.id);
      groupLabels.add(groupLabel);
    });

    const ids = new Set();
    const paths = new Set();
    const usedTags = new Set();
    let previousKey = null;
    data.activities.forEach((activity) => {
      if (!activity || typeof activity !== 'object' || Array.isArray(activity) || !hasExactKeys(activity, RECORD_KEYS)) throw new Error('Invalid activity record');
      if (!validText(activity.id, 64) || !ID_PATTERN.test(activity.id)) throw new Error('Invalid activity id');
      if (!validText(activity.title, 80) || !validText(activity.summary, 180)) throw new Error('Invalid activity text');
      if (!SUBJECT_ORDER.includes(activity.subject)) throw new Error('Invalid subject');
      if (!Array.isArray(activity.grades) || activity.grades.length < 1 || activity.grades.length > 7) throw new Error('Invalid grades');
      if (!activity.grades.every((grade, index) => Number.isInteger(grade) && grade >= 5 && grade <= 11 && (index === 0 || grade > activity.grades[index - 1]))) throw new Error('Invalid grade ordering');
      if (!Array.isArray(activity.tags) || activity.tags.length < 1 || activity.tags.some((tag) => typeof tag !== 'string' || !tagIds.has(tag))) throw new Error('Invalid activity tags');
      const positions = activity.tags.map((tag) => data.tags.findIndex((item) => item.id === tag));
      if (new Set(activity.tags).size !== activity.tags.length || positions.some((position, index) => index > 0 && position <= positions[index - 1])) throw new Error('Invalid activity tag order');
      activity.tags.forEach((tag) => usedTags.add(tag));
      if (typeof activity.path !== 'string' || activity.path.length > 160) throw new Error('Invalid path');
      const pathMatch = activity.path.match(PATH_PATTERN);
      const pathGrade = pathMatch ? Number(pathMatch[2]) : null;
      const metadataGrade = LEGACY_PATH_GRADE_BY_ACTIVITY_ID[activity.id] ?? pathGrade;
      if (!pathMatch || pathMatch[1] !== activity.subject || pathMatch[3] !== activity.id || !activity.grades.includes(metadataGrade)) throw new Error('Invalid path metadata');
      if (ids.has(activity.id) || paths.has(activity.path)) throw new Error('Duplicate activity');
      ids.add(activity.id);
      paths.add(activity.path);
      const sortKey = [SUBJECT_ORDER.indexOf(activity.subject), Number(pathMatch[2]), activity.id];
      if (previousKey && compareKeys(previousKey, sortKey) >= 0) throw new Error('Invalid activity order');
      previousKey = sortKey;
    });
    if ([...tagIds].some((tag) => !usedTags.has(tag))) throw new Error('Unused tag');
    return { activities: data.activities, tags: data.tags };
  }

  function compareKeys(left, right) {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] < right[index]) return -1;
      if (left[index] > right[index]) return 1;
    }
    return 0;
  }

  function showOnly(view) {
    [elements.loading, elements.error, elements.chooser, elements.catalog].forEach((element) => {
      element.hidden = element !== view;
    });
  }

  function parseUrl() {
    return parseUrlState(window.location.search, activities, tagRegistry);
  }

  function canonicalUrl() {
    const query = canonicalQuery(state, tagRegistry);
    return `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  }

  function updateUrl(mode) {
    window.history[mode === 'push' ? 'pushState' : 'replaceState']({}, '', canonicalUrl());
  }

  function countLabel(count) {
    if (count === 1) return '1 завдання';
    if (count >= 2 && count <= 4) return `${count} завдання`;
    return `${count} завдань`;
  }

  function buildGradeOptions() {
    elements.gradeOptions.replaceChildren();
    for (let grade = 5; grade <= 11; grade += 1) {
      const wrapper = document.createElement('div');
      wrapper.className = 'grade-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `grade-${grade}`;
      input.value = String(grade);
      input.addEventListener('change', () => {
        if (input.checked) state.grades.add(grade); else state.grades.delete(grade);
        updateUrl('replace');
        renderResults(true);
      });
      const label = document.createElement('label');
      label.htmlFor = input.id;
      label.textContent = `${grade} клас`;
      wrapper.append(input, label);
      elements.gradeOptions.append(wrapper);
    }
  }

  function buildTagOptions() {
    elements.tagOptions.replaceChildren();
    const tags = availableTags(state.subject, activities, tagRegistry);
    GROUPS.forEach((group) => {
      const groupTags = tags.filter((tag) => tag.group === group);
      if (!groupTags.length) return;
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = GROUP_LABELS[group];
      fieldset.append(legend);
      const options = document.createElement('div');
      options.className = 'tag-group';
      groupTags.forEach((tag) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'tag-option';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = `tag-${tag.id}`;
        input.value = tag.id;
        input.checked = state.tags.has(tag.id);
        input.addEventListener('change', () => {
          if (input.checked) state.tags.add(tag.id); else state.tags.delete(tag.id);
          updateUrl('replace');
          renderResults(true);
        });
        const label = document.createElement('label');
        label.htmlFor = input.id;
        label.textContent = tag.label;
        wrapper.append(input, label);
        options.append(wrapper);
      });
      fieldset.append(options);
      elements.tagOptions.append(fieldset);
    });
  }

  function renderChooser(focus = false) {
    state = { subject: null, grades: new Set(), tags: new Set() };
    document.body.classList.remove('subject-computer-science');
    document.querySelectorAll('[data-count-for]').forEach((node) => {
      const count = activities.filter((activity) => activity.subject === node.dataset.countFor).length;
      node.textContent = countLabel(count);
    });
    showOnly(elements.chooser);
    if (focus) elements.chooserTitle.focus();
  }

  function renderCatalog(focus = false) {
    if (!state.subject) {
      renderChooser(focus);
      return;
    }
    const subject = SUBJECTS[state.subject];
    document.body.classList.toggle('subject-computer-science', state.subject === 'computer-science');
    elements.catalogTitle.textContent = subject.title;
    elements.catalogDescription.textContent = subject.description;
    elements.subjectMark.textContent = subject.mark;
    elements.gradeOptions.querySelectorAll('input').forEach((input) => {
      input.checked = state.grades.has(Number(input.value));
    });
    buildTagOptions();
    hasAnnouncedResults = false;
    showOnly(elements.catalog);
    renderResults(false);
    if (focus) elements.catalogTitle.focus();
  }

  function renderResults(announce) {
    const matches = filterActivities(activities, state);
    elements.grid.replaceChildren();
    matches.forEach((activity) => elements.grid.append(createCard(activity)));
    elements.empty.hidden = matches.length !== 0;
    const filtersActive = state.grades.size > 0 || state.tags.size > 0;
    const subjectCount = activities.filter((activity) => activity.subject === state.subject).length;
    elements.emptyMessage.textContent = emptyMessage(subjectCount, filtersActive);
    elements.clearFilters.disabled = !filtersActive;
    const message = `Знайдено: ${countLabel(matches.length)}`;
    if (announce || hasAnnouncedResults) elements.resultCount.textContent = message;
    else {
      elements.resultCount.setAttribute('aria-live', 'off');
      elements.resultCount.textContent = message;
      window.requestAnimationFrame(() => elements.resultCount.setAttribute('aria-live', 'polite'));
      hasAnnouncedResults = true;
    }
  }

  function createCard(activity) {
    const article = document.createElement('article');
    article.className = 'activity-card';
    const heading = document.createElement('h3');
    heading.textContent = activity.title;
    const summary = document.createElement('p');
    summary.textContent = activity.summary;
    const grades = document.createElement('div');
    grades.className = 'grade-chips';
    grades.setAttribute('aria-label', 'Класи');
    activity.grades.forEach((grade) => {
      const chip = document.createElement('span');
      chip.className = 'grade-chip';
      chip.textContent = `${grade} клас`;
      grades.append(chip);
    });
    const tags = document.createElement('div');
    tags.className = 'tag-chips';
    tags.setAttribute('aria-label', 'Теги');
    activity.tags.forEach((tagId) => {
      const metadata = tagRegistry.find((tag) => tag.id === tagId);
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = metadata.label;
      tags.append(chip);
    });
    const link = document.createElement('a');
    link.className = 'activity-link';
    link.href = activity.path;
    link.textContent = `Відкрити «${activity.title}»`;
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    link.append(arrow);
    article.append(heading, summary, grades, tags, link);
    return article;
  }

  function chooseSubject(subject) {
    state = { subject, grades: new Set(), tags: new Set() };
    updateUrl('push');
    renderCatalog(true);
  }

  async function loadCatalog() {
    showOnly(elements.loading);
    try {
      const response = await fetch('./activities-v2.json', { cache: 'no-cache', credentials: 'omit' });
      if (!response.ok) throw new Error('Manifest request failed');
      const manifest = validateManifest(await response.json());
      activities = manifest.activities;
      tagRegistry = manifest.tags;
      state = parseUrl();
      buildGradeOptions();
      updateUrl('replace');
      if (state.subject) renderCatalog(false); else renderChooser(false);
    } catch (error) {
      console.error('Catalog load failed:', error instanceof Error ? error.message : 'unknown error');
      activities = [];
      showOnly(elements.error);
    }
  }

  document.querySelectorAll('[data-subject]').forEach((button) => button.addEventListener('click', () => chooseSubject(button.dataset.subject)));
  elements.back.addEventListener('click', () => {
    state = { subject: null, grades: new Set(), tags: new Set() };
    updateUrl('push');
    renderChooser(true);
  });
  elements.clearFilters.addEventListener('click', () => {
    state.grades.clear();
    state.tags.clear();
    elements.gradeOptions.querySelectorAll('input').forEach((input) => { input.checked = false; });
    elements.tagOptions.querySelectorAll('input').forEach((input) => { input.checked = false; });
    updateUrl('replace');
    renderResults(true);
  });
  elements.retry.addEventListener('click', loadCatalog);
  window.addEventListener('popstate', () => {
    state = parseUrl();
    if (state.subject) renderCatalog(true); else renderChooser(true);
  });

  loadCatalog();
})();
