import { checkWebGPU, loadModel, parseRoutine, type Mode } from '../src/llm';
import { CASES, type Case } from './cases';
import type { RoutineSpec } from '../src/schema';

function score(c: Case, spec: RoutineSpec | undefined) {
  if (!spec) return { countOk: false, timeHits: 0, foodHits: 0, foodTotal: 0, extra: 0 };
  const got = spec.tasks.map((t) => ({ at: t.hour * 60 + t.minute, food: t.food, used: false }));
  let timeHits = 0;
  let foodHits = 0;
  let foodTotal = 0;
  for (const e of c.expect) {
    const m = got.filter((g) => !g.used && Math.abs(g.at - e.at) <= 30).sort((a, b) => Math.abs(a.at - e.at) - Math.abs(b.at - e.at))[0];
    if (e.food) foodTotal++;
    if (m) {
      m.used = true;
      timeHits++;
      if (e.food && m.food === e.food) foodHits++;
    }
  }
  return { countOk: got.length === c.expect.length, timeHits, foodHits, foodTotal, extra: got.filter((g) => !g.used).length };
}

const log = (s: string) => {
  document.getElementById('log')!.textContent += s + '\n';
  console.log(s);
};

(window as any).runEval = async (modelId: string, mode: Mode, limit = CASES.length, chatOpts?: unknown) => {
  if (chatOpts) (window as any).__LW_CHAT_OPTS = chatOpts;
  const gpu = await checkWebGPU();
  log(`gpu: ${JSON.stringify(gpu)}`);
  const tl = performance.now();
  let lastPct = -1;
  await loadModel(modelId, (r) => {
    const pct = Math.round(r.progress * 100);
    if (pct !== lastPct && pct % 10 === 0) log(`load ${pct}% ${r.text.slice(0, 80)}`);
    lastPct = pct;
  });
  const loadMs = performance.now() - tl;
  log(`loaded ${modelId} in ${Math.round(loadMs)} ms`);
  const rows = [];
  for (const c of CASES.slice(0, limit)) {
    const r = await parseRoutine(c.text, { mode });
    const s = score(c, r.spec);
    rows.push({ id: c.id, ok: r.ok, attempts: r.attempts, error: r.error, ...s, expected: c.expect.length, got: r.spec?.tasks.length ?? 0, stats: r.stats, raw: r.raw, spec: r.spec });
    log(`${c.id}: ok=${r.ok} attempts=${r.attempts} count=${s.countOk} time=${s.timeHits}/${c.expect.length} food=${s.foodHits}/${s.foodTotal} tps=${r.stats.decodeTps.toFixed(1)} ms=${Math.round(r.stats.ms)} ${r.error ?? ''}`);
  }
  return { modelId, mode, gpu, loadMs, rows };
};
log('ready');
