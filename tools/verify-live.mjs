// End to end check of the real model path on a deployed URL, including offline reload.
// usage: node tools/verify-live.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'https://starknightt.github.io/little-world/';
const ctx = await chromium.launchPersistentContext(process.env.PROFILE ?? '.cache/chrome-profile-live', {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
const report = {};
const t = () => Date.now();

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.goto(url);
await page.click('#startOwn');
await page.waitForFunction(() => !document.getElementById('gpuLine').textContent.includes('Checking'));
report.gpuLine = await page.textContent('#gpuLine');
let t0 = t();
await page.click('#buildBtn');
let last = '';
const poll = setInterval(async () => {
  const s = await page.textContent('#loadText').catch(() => '');
  if (s && s !== last && /(\d+)%\)/.test(s) && Number(s.match(/(\d+)%\)/)[1]) % 10 === 0) console.log(s);
  last = s;
}, 2000);
await page.waitForSelector('#preview:not([hidden])', { timeout: 30 * 60 * 1000 });
clearInterval(poll);
report.firstBuildMs = t() - t0;
report.stats = await page.textContent('#loadText');
report.preview = await page.$$eval('#previewList li', (lis) => lis.map((li) => `${li.querySelector('input').value} ${li.querySelector('span').textContent}`));
await page.click('#plantBtn');
await page.click('[data-tab="ask"]');
t0 = t();
await page.fill('#askInput', "What's next and do I take it with food?");
await page.click('#askForm button');
await page.waitForFunction(() => document.querySelector('.a small'), null, { timeout: 120000 });
report.askMs = t() - t0;
report.answer = await page.textContent('.a');

// offline: reload the app with no network, load Gemma from the browser cache, build again
await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('#tasks li', { timeout: 20000 });
report.offlineAppLoaded = true;
await page.click('[data-tab="describe"]');
t0 = t();
await page.fill('#desc', 'Eye drops at 10 am and 6 pm. Vitamin D after lunch.');
await page.click('#buildBtn');
await page.waitForSelector('#preview:not([hidden])', { timeout: 180000 });
report.offlineBuildMs = t() - t0;
report.offlinePreview = await page.$$eval('#previewList li', (lis) => lis.map((li) => `${li.querySelector('input').value} ${li.querySelector('span').textContent}`));
report.errors = errors;
console.log(JSON.stringify(report, null, 2));
await ctx.close();
