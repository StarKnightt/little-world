// usage: BASE=http://localhost:4173/little-world/ node tools/polish-test.mjs [outDir]
// Headless checks for the elderly-first features: big view, family share link, no-WebGPU fallback, speech.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173/little-world/';
const OUT = process.argv[2] ?? 'shots';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, ok, extra = '') => results.push({ name, ok: !!ok, extra });

async function open(kind, url, { noGpu = false } = {}) {
  const mobile = kind === 'mobile';
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  if (noGpu) await ctx.addInitScript(() => { delete Navigator.prototype.gpu; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1);
  return { ctx, page, errors, fcp };
}

for (const kind of ['desktop', 'mobile']) {
  // 1. demo island, big view
  const a = await open(kind, `${BASE}?demo=reset&t=08:05`);
  check(`${kind}: first contentful paint`, a.fcp > 0, `${Math.round(a.fcp)} ms`);
  await a.page.waitForTimeout(2500);
  await a.page.screenshot({ path: `${OUT}/${kind}-today.png` });
  await a.page.click('#nowBtn');
  await a.page.waitForTimeout(500);
  const title = await a.page.textContent('#nowTitle');
  const kicker = await a.page.textContent('#nowKicker');
  check(`${kind}: big view shows one task`, title && kicker, `${kicker} / ${title}`);
  const doneBox = await a.page.locator('#nowDone').boundingBox();
  check(`${kind}: done button is a big target`, doneBox && doneBox.height >= 72, `${doneBox?.height}px tall`);
  await a.page.screenshot({ path: `${OUT}/${kind}-bigview.png` });
  await a.page.click('#nowDone');
  await a.page.waitForTimeout(400);
  check(`${kind}: undo offered after done`, await a.page.isVisible('#nowUndo'));
  check(`${kind}: speech available`, await a.page.evaluate(() => 'speechSynthesis' in window));
  await a.page.click('#nowClose');

  // 2. family share link
  await a.page.click('[data-tab="today"], #tabToday').catch(() => {});
  await a.page.click('#shareBtn');
  await a.page.waitForSelector('#qr svg', { timeout: 5000 });
  await a.page.waitForTimeout(300);
  await a.page.screenshot({ path: `${OUT}/${kind}-share.png` });
  await a.page.click('#shareCopy');
  const link = await a.page.evaluate(() => navigator.clipboard.readText());
  check(`${kind}: share link uses the # fragment`, /#r=z/.test(link), `${link.length} chars`);
  check(`${kind}: no console errors (demo + share)`, a.errors.length === 0, a.errors.join(' | '));
  await a.ctx.close();

  const b = await open(kind, link.replace(/^https?:\/\/[^/]+\/little-world\//, BASE));
  await b.page.waitForSelector('#incoming:not([hidden])', { timeout: 5000 });
  const items = await b.page.locator('#incomingList li').count();
  check(`${kind}: incoming routine listed`, items >= 3, `${items} tasks`);
  await b.page.screenshot({ path: `${OUT}/${kind}-incoming.png` });
  await b.page.click('#incomingUse');
  await b.page.waitForTimeout(600);
  const st = await b.page.evaluate(() => ({ src: window.__lw.state.routine?.source, big: !document.getElementById('now').hidden, hash: location.hash }));
  check(`${kind}: imported, big view opened, hash cleared`, st.src === 'shared' && st.big && !st.hash, JSON.stringify(st));
  await b.page.reload();
  await b.page.waitForTimeout(800);
  check(`${kind}: big view reopens after reload`, await b.page.isVisible('#now'));
  check(`${kind}: no console errors (receiver)`, b.errors.length === 0, b.errors.join(' | '));
  await b.ctx.close();

  // 3. no WebGPU
  const c = await open(kind, BASE, { noGpu: true });
  await c.page.waitForTimeout(800);
  const sub = await c.page.textContent('#ownSub');
  check(`${kind}: no-WebGPU message on welcome`, /can't run Gemma/.test(sub ?? ''), sub);
  await c.page.click('#startDemo');
  await c.page.waitForTimeout(1500);
  check(`${kind}: demo works without WebGPU`, await c.page.evaluate(() => window.__lw.state.routine?.source === 'demo'));
  await c.page.screenshot({ path: `${OUT}/${kind}-nogpu.png` });
  check(`${kind}: no console errors (no WebGPU)`, c.errors.length === 0, c.errors.join(' | '));
  await c.ctx.close();
}

await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? `  (${r.extra})` : ''}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
