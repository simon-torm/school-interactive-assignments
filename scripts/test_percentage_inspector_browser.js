'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = path.join(__dirname, '..');
const activityPath = '/activities/math/06-percentage-inspector/';
const engines = { chromium, webkit };
const viewports = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 390, height: 844 },
};

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function localServer() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
      const filePath = path.resolve(root, `.${relative}`);
      if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        response.writeHead(404, { 'Cache-Control': 'no-store' });
        response.end('Not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' });
      fs.createReadStream(filePath).pipe(response);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/` }));
  });
}

function watch(page, base) {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', (response) => {
    if (response.url().startsWith(base) && response.status() >= 400) errors.push(`response: ${response.status()} ${response.url()}`);
  });
  return errors;
}

async function assertNoHorizontalClip(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.document <= dimensions.viewport + 1, `${label}: no horizontal clipping (${dimensions.document}/${dimensions.viewport})`);
}

async function assertFractionGeometry(page, label) {
  const measurements = await page.evaluate(() => {
    const fraction = (numerator, denominator) =>
      `<span class="fraction" role="math" aria-label="${numerator} поділити на ${denominator}">` +
      `<span class="fraction-num" aria-hidden="true">${numerator}</span>` +
      '<span class="fraction-bar" aria-hidden="true"></span>' +
      `<span class="fraction-den" aria-hidden="true">${denominator}</span></span>`;
    const values = [[1, 4], [3, 20], [17, 20], [40, 100]];
    const row = (context, numerator, denominator, bold) =>
      `<span data-case="${context}-${numerator}-${denominator}" style="display:block;white-space:nowrap">` +
      `<span class="fraction-prefix">Перевір ${numerator} з ${denominator}: </span>` +
      `${bold ? '<b>' : ''}${fraction(numerator, denominator)}${bold ? '</b>' : ''}` +
      '<span> у цьому рядку.</span></span>';

    const rect = (node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const contexts = [
      { name: 'label', root: document.querySelector('#sign'), reveal: document.querySelector('#screen-play'), bold: true, wrap: (rows) => `<div class="label-lines">${rows}</div>` },
      { name: 'cheat', root: document.querySelector('#cheat .cheat-note:last-of-type'), reveal: document.querySelector('#cheat'), bold: true, wrap: (rows) => rows },
      { name: 'hint', root: document.querySelector('#hint-zone'), reveal: document.querySelector('#screen-play'), wrap: (rows) => `<div class="hint-step"><span class="n">1</span><span>${rows}</span></div>` },
      { name: 'feedback', root: document.querySelector('#pad-zone'), reveal: document.querySelector('#screen-play'), wrap: (rows) => `<div class="fb"><div class="fb-check">${rows}</div></div>` },
      { name: 'solution', root: document.querySelector('#pad-zone'), reveal: document.querySelector('#screen-play'), wrap: (rows) => `<div class="fb"><div class="fb-body">${rows}</div></div>` },
    ];
    const results = [];
    for (const context of contexts) {
      const original = { html: context.root.innerHTML, style: context.root.getAttribute('style'), hidden: context.reveal.hidden };
      context.reveal.hidden = false;
      context.root.style.cssText = 'position:fixed;left:0;top:0;width:480px;z-index:-1;opacity:0;pointer-events:none;';
      context.root.innerHTML = context.wrap(values.map(([numerator, denominator]) => row(context.name, numerator, denominator, context.bold)).join(''));
      for (const container of context.root.querySelectorAll('[data-case]')) {
        const fractionNode = container.querySelector('.fraction');
        results.push({
          name: container.dataset.case,
          fraction: rect(fractionNode),
          text: rect(container.querySelector('.fraction-prefix')),
          numerator: rect(fractionNode.querySelector('.fraction-num')),
          bar: rect(fractionNode.querySelector('.fraction-bar')),
          denominator: rect(fractionNode.querySelector('.fraction-den')),
        });
      }
      context.root.innerHTML = original.html;
      if (original.style === null) context.root.removeAttribute('style');
      else context.root.setAttribute('style', original.style);
      context.reveal.hidden = original.hidden;
    }
    return results;
  });

  assert.equal(measurements.length, 20, `${label}: four representative fractions render in all five fraction-producing UI contexts`);
  for (const measurement of measurements) {
    const prefix = `${label}/${measurement.name}`;
    const fractionCenter = (measurement.fraction.top + measurement.fraction.bottom) / 2;
    const textCenter = (measurement.text.top + measurement.text.bottom) / 2;
    assert.ok(Math.abs(fractionCenter - textCenter) <= 2, `${prefix}: fraction is vertically centered within two CSS pixels (${fractionCenter}/${textCenter})`);
    for (const [partName, part] of [['numerator', measurement.numerator], ['denominator', measurement.denominator]]) {
      const leftOverhang = part.left - measurement.bar.left;
      const rightOverhang = measurement.bar.right - part.right;
      assert.ok(Math.abs(leftOverhang - rightOverhang) <= 0.5, `${prefix}: ${partName} is horizontally centered on the bar`);
    }
    assert.ok(measurement.bar.width >= measurement.numerator.width && measurement.bar.width >= measurement.denominator.width,
      `${prefix}: bar spans the widest number`);
    const upperGap = measurement.bar.top - measurement.numerator.bottom;
    const lowerGap = measurement.denominator.top - measurement.bar.bottom;
    assert.ok(Math.abs(upperGap - lowerGap) <= 0.5, `${prefix}: numerator and denominator are vertically balanced around the bar`);
  }
}

async function openFromCatalog(page, base, label) {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#chooser-view:not([hidden])').waitFor();
  assert.equal(await page.locator('[data-count-for="math"]').textContent(), '6 завдань', `${label}: catalog count`);
  const headerBackground = await page.locator('.site-header').evaluate((node) => getComputedStyle(node).backgroundImage);
  assert.notEqual(headerBackground, 'none', `${label}: catalog styles applied`);
  await page.locator('[data-subject="math"]').click();
  await page.locator('label[for="grade-6"]').click();
  const card = page.locator('.activity-card', { hasText: 'Інспектор відсотків' });
  await card.waitFor();
  await Promise.all([
    page.waitForURL((url) => url.pathname.endsWith(activityPath)),
    card.locator('.activity-link').click(),
  ]);
  await page.locator('#screen-menu:not([hidden])').waitFor();
  assert.equal(await page.locator('h1').textContent(), 'Інспектор відсотків', `${label}: catalog card opens activity`);
  const background = await page.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor);
  assert.notEqual(background, 'rgba(0, 0, 0, 0)', `${label}: activity styles applied`);
  await assertNoHorizontalClip(page, label);
}

async function answerCurrentCase(page, controls) {
  const phase = await page.evaluate(() => window.__inspector.state().phase);
  if (phase === 'judge') {
    controls.judge = true;
    const correctIndex = await page.evaluate(() => {
      const current = window.__inspector.state().cur;
      return current.judge.options.findIndex((option) => option.val === current.judge.correct);
    });
    await page.locator('.judge .btn').nth(correctIndex).click();
  }
  await page.locator('#display').waitFor();
  const answer = await page.evaluate(() => window.__inspector.state().cur.answer);
  if (!controls.wrongRetry) {
    const wrong = answer === 1 ? 2 : answer - 1;
    await page.keyboard.type(String(wrong));
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.__inspector.state().phase), 'input', 'wrong first answer permits retry');
    controls.wrongRetry = true;
  }
  if (!controls.hints) {
    const hint = page.locator('#hint-btn');
    if (await hint.count()) {
      await hint.click();
      controls.hints = true;
    }
  }
  if (controls.keypad) {
    for (const digit of String(answer)) await page.locator('.key', { hasText: new RegExp(`^${digit}$`) }).click();
    await page.locator('.key-ok').click();
  } else {
    await page.keyboard.type(String(answer));
    await page.keyboard.press('Enter');
  }
  controls.keypad = !controls.keypad;
  await page.locator('#btn-next').waitFor();
}

async function exerciseFiniteFlow(page) {
  await page.locator('[data-len="10"]').click();
  await page.locator('#btn-start').click();
  const controls = { judge: false, wrongRetry: false, hints: false, keypad: true };
  for (let index = 0; index < 10; index += 1) {
    await answerCurrentCase(page, controls);
    await page.locator('#btn-next').click();
  }
  await page.locator('#screen-report:not([hidden])').waitFor();
  assert.equal(await page.locator('#rep-cases').textContent(), '10', 'ten-case shift reaches report');
  assert.ok(controls.wrongRetry && controls.hints, 'retry and hint paths exercised');
  await page.locator('#rep-again').click();
  await page.locator('#screen-play:not([hidden])').waitFor();
  await page.locator('#btn-quit').click();
  await page.locator('#screen-menu:not([hidden])').waitFor();

  await page.locator('[data-len="25"]').click();
  await page.locator('#btn-start').click();
  assert.match(await page.locator('#case-no').textContent(), /з 25$/, '25-case mode starts');
  await page.locator('#btn-quit').click();
  await page.locator('#screen-menu:not([hidden])').waitFor();

  await page.locator('[data-len="0"]').click();
  await page.locator('#btn-start').click();
  assert.equal(await page.locator('#case-no').textContent(), 'Справа 1', 'endless mode starts without a fixed total');
  for (let index = 0; index < 12 && !controls.judge; index += 1) {
    await answerCurrentCase(page, controls);
    await page.locator('#btn-next').click();
  }
  assert.ok(controls.judge, 'judge phase exercised in the browser');
}

async function verifyStorageFailure(browser, base, engineName) {
  const context = await browser.newContext({ viewport: viewports.mobile });
  await context.setExtraHTTPHeaders({ 'Cache-Control': 'no-cache', Pragma: 'no-cache' });
  await context.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('storage unavailable'); };
    Storage.prototype.setItem = () => { throw new Error('storage unavailable'); };
  });
  const page = await context.newPage();
  const errors = watch(page, base);
  await page.goto(new URL(activityPath, base).href, { waitUntil: 'networkidle' });
  await page.locator('#btn-start').click();
  const controls = { judge: false, wrongRetry: true, hints: true, keypad: false };
  await answerCurrentCase(page, controls);
  await page.locator('#btn-next').click();
  await page.locator('#btn-quit').click();
  await page.locator('#screen-report:not([hidden])').waitFor();
  assert.deepEqual(errors, [], `${engineName}: localStorage failure is contained`);
  await context.close();
}

async function runEngine(name, browserType, base, live) {
  const browser = await browserType.launch({ headless: true });
  try {
    for (const [viewportName, viewport] of Object.entries(viewports)) {
      for (const colorScheme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport, colorScheme, reducedMotion: 'reduce' });
        await context.setExtraHTTPHeaders({ 'Cache-Control': 'no-cache', Pragma: 'no-cache' });
        const page = await context.newPage();
        const errors = watch(page, base);
        const label = `${name}/${viewportName}/${colorScheme}${live ? '/live' : '/local'}`;
        await openFromCatalog(page, base, label);
        const scheme = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        assert.equal(scheme, colorScheme, `${label}: requested theme active`);
        assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true, `${label}: reduced motion active`);
        await assertFractionGeometry(page, label);
        if (viewportName === 'desktop' && colorScheme === 'light') await exerciseFiniteFlow(page);
        assert.deepEqual(errors, [], `${label}: zero console, request, and response failures`);
        await context.close();
      }
    }
    if (!live) await verifyStorageFailure(browser, base, name);
  } finally {
    await browser.close();
  }
}

(async () => {
  const liveBase = process.env.BASE_URL;
  const local = liveBase ? null : await localServer();
  const base = liveBase ? new URL(liveBase).href : local.base;
  const requested = (process.env.BROWSERS || 'chromium,webkit').split(',').map((value) => value.trim()).filter(Boolean);
  try {
    for (const name of requested) {
      assert.ok(engines[name], `supported browser engine: ${name}`);
      await runEngine(name, engines[name], base, Boolean(liveBase));
    }
    console.log(`PASS: ${requested.join(' + ')} catalog/activity desktop/mobile, light/dark, reduced-motion, keyboard/touch, retries, hints, reports, modes, storage fallback and network console checks (${liveBase ? 'live' : 'local'})`);
  } finally {
    if (local) await new Promise((resolve) => local.server.close(resolve));
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
