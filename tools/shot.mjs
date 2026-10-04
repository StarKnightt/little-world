// usage: node tools/shot.mjs <url> <out.png> [width] [height] [waitMs]
import { chromium } from 'playwright';

const [url, out, w = '1440', h = '900', wait = '2500'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const mobile = Number(w) < 700;
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log(JSON.stringify({ out, loadMs: Date.now() - t0, fcp: Math.round(fcp), errors }, null, 1));
await browser.close();
