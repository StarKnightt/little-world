// Records scripted demo clips with a CDP screencast, then assembles them with ffmpeg.
// usage: node tools/capture.mjs <scene: day|gemma> <outDir> [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [scene = 'day', outDir = '.cache/capture', base = process.env.BASE ?? 'http://localhost:5173'] = process.argv.slice(2);
const W = Number(process.env.W ?? 1280), H = Number(process.env.H ?? 720);
const frames = `${outDir}/${scene}-frames`;
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const ctx = await chromium.launchPersistentContext(process.env.PROFILE ?? '.cache/chrome-profile2', {
  channel: 'chrome',
  headless: true,
  viewport: { width: W, height: H },
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const cdp = await ctx.newCDPSession(page);
const shots = [];
cdp.on('Page.screencastFrame', async (f) => {
  shots.push({ data: f.data, t: f.metadata.timestamp });
  await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
const start = () => cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
const stop = () => cdp.send('Page.stopScreencast');
const wait = (ms) => page.waitForTimeout(ms);
const lw = (fn, arg) => page.evaluate(fn, arg);

async function scrub(from, to, ms, onMinute) {
  const steps = Math.round(ms / 33);
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const m = Math.round(from + (to - from) * e);
    await lw((m) => window.__lw.setPreview(m), m);
    if (onMinute) await onMinute(m);
    await wait(33);
  }
}

if (scene === 'day') {
  await page.goto(`${base}/?demo=reset&t=06:20`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}/?demo=reset&t=06:20`);
  await wait(2600);
  await start();
  await wait(1200);
  const doneAt = [[7 * 60 + 12, 0], [8 * 60 + 45, 1], [12 * 60 + 45, 2], [16 * 60 + 10, 3], [18 * 60 + 20, 4], [19 * 60 + 40, 5], [20 * 60 + 45, 6]];
  const marked = new Set();
  await scrub(6 * 60 + 20, 22 * 60 + 10, 12500, async (m) => {
    for (const [at, idx] of doneAt) {
      if (m >= at && !marked.has(idx)) {
        marked.add(idx);
        await lw((i) => window.__lw.toggleDone(window.__lw.state.routine.tasks[i].id), idx);
      }
    }
  });
  await wait(2600);
  await stop();
} else if (scene === 'gemma') {
  await page.goto(`${base}/?demo=reset&t=10:05`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}/?t=10:05`);
  await wait(1500);
  await start();
  await wait(700);
  await page.click('#startOwn');
  await wait(500);
  await page.fill('#desc', '');
  const text = 'Amma: BP tablet after breakfast. Sugar tablet before lunch and before dinner. Eye drops at 4 pm, both eyes. Calcium after dinner, not with tea.';
  await page.type('#desc', text, { delay: 18 });
  await wait(400);
  await page.click('#buildBtn');
  await page.waitForSelector('#preview:not([hidden])', { timeout: 180000 });
  await wait(2200);
  await page.click('#plantBtn');
  await wait(3800);
  await stop();
}

await wait(300);
shots.forEach((s, i) => writeFileSync(`${frames}/${String(i).padStart(5, '0')}.jpg`, Buffer.from(s.data, 'base64')));
// concat demuxer with real frame durations keeps the timing honest
const list = shots.map((s, i) => `file '${String(i).padStart(5, '0')}.jpg'\nduration ${((shots[i + 1]?.t ?? s.t + 0.04) - s.t).toFixed(4)}`).join('\n');
writeFileSync(`${frames}/list.txt`, list + `\nfile '${String(shots.length - 1).padStart(5, '0')}.jpg'\n`);
const mp4 = `${outDir}/${scene}.mp4`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${frames}/list.txt`, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', mp4]);
console.log(`${shots.length} frames -> ${mp4}`);
await ctx.close();
