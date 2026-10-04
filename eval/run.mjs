// Drives eval.html in real Chrome with WebGPU and writes eval/results-*.json.
// usage: node eval/run.mjs <modelId> <constrained:1|0> [limit] [baseUrl]
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const [modelId = 'gemma3-1b-it-q4f16_1-MLC', mode = 'grammar', limit = '20', tag = ''] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173';
const chatOpts = process.env.CHAT_OPTS ? JSON.parse(process.env.CHAT_OPTS) : undefined;
const profile = process.env.PROFILE ?? '.cache/chrome-profile';
mkdirSync('.cache', { recursive: true });
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chrome',
  headless: process.env.HEADED ? false : true,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist'],
  viewport: { width: 900, height: 700 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${base}/eval.html`);
await page.waitForFunction(() => 'runEval' in window);
const res = await page.evaluate(([m, c, l, o]) => window.runEval(m, c, Number(l), o), [modelId, mode, limit, chatOpts]);
const rows = res.rows;
const n = rows.length;
const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
const summary = {
  modelId,
  mode,
  chatOpts,
  gpu: res.gpu,
  loadMs: Math.round(res.loadMs),
  cases: n,
  validFirstTry: rows.filter((r) => r.ok && r.attempts === 1).length,
  validAfterRepair: rows.filter((r) => r.ok).length,
  countExact: rows.filter((r) => r.countOk).length,
  timeHits: `${sum((r) => r.timeHits)}/${sum((r) => r.expected)}`,
  foodHits: `${sum((r) => r.foodHits)}/${sum((r) => r.foodTotal)}`,
  extraTasks: sum((r) => r.extra),
  modelOnlyTimeHits: `${sum((r) => r.modelOnly?.timeHits ?? 0)}/${sum((r) => r.expected)}`,
  modelOnlyFoodHits: `${sum((r) => r.modelOnly?.foodHits ?? 0)}/${sum((r) => r.foodTotal)}`,
  quoteFixes: sum((r) => r.fixes ?? 0),
  avgDecodeTps: +(sum((r) => r.stats.decodeTps) / n).toFixed(1),
  avgPrefillTps: +(sum((r) => r.stats.prefillTps) / n).toFixed(1),
  avgMs: Math.round(sum((r) => r.stats.ms) / n),
};
console.log(JSON.stringify(summary, null, 2));
writeFileSync(`eval/results-${modelId}-${mode}${tag ? '-' + tag : ''}.json`, JSON.stringify({ summary, rows }, null, 2));
await ctx.close();
