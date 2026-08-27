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
  const RECORD_KEYS = ['grades', 'id', 'path', 'subject', 'summary', 'title'];

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
    clearFilters: document.querySelector('#clear-filters'),
    resultCount: document.querySelector('#result-count'),
    grid: document.querySelector('#activity-grid'),
    empty: document.querySelector('#empty-state'),
    retry: document.querySelector('#retry-button'),
    back: document.querySelector('#back-button')
  };

  let activities = [];
  let state = { subject: null, grades: new Set() };
  let hasAnnouncedResults = false;

  function hasExactKeys(value, expected) {
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
  }

  function validText(value, maximum) {
    return typeof value === 'string' && value.length >= 1 && value.length <= maximum && value === value.trim() && !CONTROL_PATTERN.test(value);
  }

  function validateManifest(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || !hasExactKeys(data, ['activities', 'schemaVersion'])) {
      throw new Error('Invalid manifest envelope');
    }
    if (data.schemaVersion !== 1 || !Array.isArray(data.activities)) throw new Error('Unsupported manifest');

    const ids = new Set();
    const paths = new Set();
    let previousKey = null;
    data.activities.forEach((activity) => {
      if (!activity || typeof activity !== 'object' || Array.isArray(activity) || !hasExactKeys(activity, RECORD_KEYS)) throw new Error('Invalid activity record');
      if (!validText(activity.id, 64) || !ID_PATTERN.test(activity.id)) throw new Error('Invalid activity id');
      if (!validText(activity.title, 80) || !validText(activity.summary, 180)) throw new Error('Invalid activity text');
      if (!SUBJECT_ORDER.includes(activity.subject)) throw new Error('Invalid subject');
      if (!Array.isArray(activity.grades) || activity.grades.length < 1 || activity.grades.length > 7) throw new Error('Invalid grades');
      if (!activity.grades.every((grade, index) => Number.isInteger(grade) && grade >= 5 && grade <= 11 && (index === 0 || grade > activity.grades[index - 1]))) throw new Error('Invalid grade ordering');
      if (typeof activity.path !== 'string' || activity.path.length > 160) throw new Error('Invalid path');
      const pathMatch = activity.path.match(PATH_PATTERN);
      if (!pathMatch || pathMatch[1] !== activity.subject || pathMatch[3] !== activity.id || !activity.grades.includes(Number(pathMatch[2]))) throw new Error('Invalid path metadata');
      if (ids.has(activity.id) || paths.has(activity.path)) throw new Error('Duplicate activity');
      ids.add(activity.id);
      paths.add(activity.path);
      const sortKey = [SUBJECT_ORDER.indexOf(activity.subject), Number(pathMatch[2]), activity.id];
      if (previousKey && compareKeys(previousKey, sortKey) >= 0) throw new Error('Invalid activity order');
      previousKey = sortKey;
    });
    return data.activities;
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
    const params = new URLSearchParams(window.location.search);
    const subject = SUBJECT_ORDER.includes(params.get('subject')) ? params.get('subject') : null;
    const grades = new Set();
    const rawGrades = params.get('grades');
    if (rawGrades) {
      rawGrades.split(',').forEach((value) => {
        const grade = Number(value);
        if (Number.isInteger(grade) && grade >= 5 && grade <= 11) grades.add(grade);
      });
    }
    return { subject, grades };
  }

  function canonicalUrl() {
    const params = new URLSearchParams();
    if (state.subject) params.set('subject', state.subject);
    const grades = [...state.grades].sort((a, b) => a - b);
    if (state.subject && grades.length) params.set('grades', grades.join(','));
    const query = params.toString();
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

  function renderChooser(focus = false) {
    state = { subject: null, grades: new Set() };
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
    hasAnnouncedResults = false;
    showOnly(elements.catalog);
    renderResults(false);
    if (focus) elements.catalogTitle.focus();
  }

  function renderResults(announce) {
    const matches = activities.filter((activity) => activity.subject === state.subject && (state.grades.size === 0 || activity.grades.some((grade) => state.grades.has(grade))));
    elements.grid.replaceChildren();
    matches.forEach((activity) => elements.grid.append(createCard(activity)));
    elements.empty.hidden = matches.length !== 0;
    elements.clearFilters.disabled = state.grades.size === 0;
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
    const link = document.createElement('a');
    link.className = 'activity-link';
    link.href = activity.path;
    link.textContent = `Відкрити «${activity.title}»`;
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    link.append(arrow);
    article.append(heading, summary, grades, link);
    return article;
  }

  function chooseSubject(subject) {
    state = { subject, grades: new Set() };
    updateUrl('push');
    renderCatalog(true);
  }

  async function loadCatalog() {
    showOnly(elements.loading);
    try {
      const response = await fetch('./activities.json', { cache: 'no-cache', credentials: 'omit' });
      if (!response.ok) throw new Error('Manifest request failed');
      activities = validateManifest(await response.json());
      state = parseUrl();
      buildGradeOptions();
      if (state.subject) renderCatalog(false); else renderChooser(false);
    } catch (error) {
      console.error('Catalog load failed:', error instanceof Error ? error.message : 'unknown error');
      activities = [];
      showOnly(elements.error);
    }
  }

  document.querySelectorAll('[data-subject]').forEach((button) => button.addEventListener('click', () => chooseSubject(button.dataset.subject)));
  elements.back.addEventListener('click', () => {
    state = { subject: null, grades: new Set() };
    updateUrl('push');
    renderChooser(true);
  });
  elements.clearFilters.addEventListener('click', () => {
    state.grades.clear();
    elements.gradeOptions.querySelectorAll('input').forEach((input) => { input.checked = false; });
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
