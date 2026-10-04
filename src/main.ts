import './style.css';
import { World, escapeHtml, type TaskState } from './world';
import { DEMO_SPEC, MEDICINE_SAMPLE, PLANT_SAMPLE } from './demo';
import { FOOD_LABEL, fmtTime, toRoutine, type Routine, type RoutineSpec, type Task } from './schema';
import { dayKey, load, save, wipe } from './store';
import { simpleAnswer } from './simple-qa';
import { glyphDataUrl } from './glyphs';
import type { GpuStatus, ParseResult } from './llm';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const state = load();
const world = new World($('stage'));
let gpu: GpuStatus | null = null;
let llm: typeof import('./llm') | null = null;
let modelReady = false;
let previewMin: number | null = params.get('t') ? parseClock(params.get('t')!) : null;
let pending: { spec: RoutineSpec; result: ParseResult; input: string } | null = null;

const MODEL_ID = 'gemma-2-2b-it-q4f16_1-MLC';
const MODEL_LABEL = 'Gemma 2 2B';
const MODEL_GB = '1.4 GB';

function parseClock(s: string) {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ---------- time ----------
function now() {
  const d = new Date();
  if (previewMin !== null) d.setHours(Math.floor(previewMin / 60), previewMin % 60, 0, 0);
  return d;
}
const minsOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
const at = (t: Task) => t.hour * 60 + t.minute;
const todayDone = () => (state.done[dayKey(new Date())] ??= {});

function taskState(t: Task, mins: number): TaskState {
  if (todayDone()[t.id]) return 'done';
  if (mins < at(t)) return 'upcoming';
  if (mins < at(t) + 60) return 'due';
  return 'late';
}

// ---------- routine ----------
function setRoutine(r: Routine | null) {
  state.routine = r;
  save(state);
  world.setRoutine(r);
  world.intro = 0;
  $('routineTitle').textContent = r ? r.title : 'your day, as a tiny island';
  renderTasks();
}

function demoRoutine() {
  return toRoutine(DEMO_SPEC, { source: 'demo', model: MODEL_LABEL, createdAt: Date.now(), input: MEDICINE_SAMPLE });
}

function toggleDone(id: string) {
  const d = todayDone();
  if (d[id]) delete d[id];
  else {
    d[id] = Date.now();
    world.celebrate(id);
    chime(true);
  }
  save(state);
  renderTasks();
}

function describe(t: Task) {
  return [t.dose, FOOD_LABEL[t.food], t.note].filter(Boolean).join(' · ');
}

function renderTasks() {
  const r = state.routine;
  const list = $('tasks');
  const mins = minsOf(now());
  $('emptyToday').hidden = !!r;
  list.innerHTML = '';
  if (!r) {
    $('nextUp').textContent = 'Nothing planned yet.';
    $('nextSub').textContent = '';
    $('count').textContent = '0/0';
    world.setStates({});
    return;
  }
  const states: Record<string, TaskState> = {};
  for (const t of r.tasks) {
    const s = taskState(t, mins);
    states[t.id] = s;
    const li = document.createElement('li');
    li.className = s;
    li.dataset.id = t.id;
    li.innerHTML = `<img alt="" src="${glyphDataUrl(t.icon)}" /><div><div class="t">${fmtTime(t.hour, t.minute)}${s === 'due' ? ' · now' : s === 'late' ? ' · still waiting' : ''}</div><div class="n">${escapeHtml(t.name)}</div><div class="d">${escapeHtml(describe(t))}</div></div><button class="done-btn" type="button">${s === 'done' ? 'Undo' : 'Done'}</button>`;
    li.querySelector('button')!.addEventListener('click', () => toggleDone(t.id));
    li.addEventListener('mouseenter', () => world.focusTask(t.id));
    li.addEventListener('mouseleave', () => world.focusTask(null));
    list.appendChild(li);
  }
  world.setStates(states);
  const done = r.tasks.filter((t) => states[t.id] === 'done').length;
  $('count').textContent = `${done}/${r.tasks.length}`;
  ($('ring') as unknown as SVGCircleElement).style.strokeDashoffset = String(97.4 * (1 - done / r.tasks.length));
  const due = r.tasks.filter((t) => states[t.id] === 'due' || states[t.id] === 'late');
  const next = r.tasks.find((t) => states[t.id] === 'upcoming');
  if (done === r.tasks.length) {
    $('nextUp').textContent = 'All done for today. Your island is in full bloom.';
    $('nextSub').textContent = '';
  } else if (due.length) {
    $('nextUp').textContent = `Now: ${due[0].name}${due[0].dose ? `, ${due[0].dose}` : ''}`;
    $('nextSub').textContent = [describe(due[0]), due.length > 1 ? `and ${due.length - 1} more waiting` : ''].filter(Boolean).join(' · ');
  } else if (next) {
    const inMin = at(next) - mins;
    $('nextUp').textContent = `Next: ${next.name} at ${fmtTime(next.hour, next.minute)}`;
    $('nextSub').textContent = `in ${inMin >= 60 ? `${Math.floor(inMin / 60)} h ${inMin % 60} min` : `${inMin} min`}${describe(next) ? ' · ' + describe(next) : ''}`;
  }
}

// ---------- reminders ----------
let audio: AudioContext | null = null;
function chime(happy = false) {
  try {
    audio ??= new AudioContext();
    const notes = happy ? [784, 1175] : [659, 880];
    notes.forEach((f, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t0 = audio!.currentTime + i * 0.14;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.08, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      o.connect(g).connect(audio!.destination);
      o.start(t0);
      o.stop(t0 + 1);
    });
  } catch {
    /* audio is optional */
  }
}

let toastTimer = 0;
function toast(msg: string, ms = 5200) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
}

function checkReminders() {
  const r = state.routine;
  if (!r || previewMin !== null) return;
  const d = new Date();
  const key = dayKey(d);
  const sent = (state.notified[key] ??= []);
  const mins = minsOf(d);
  for (const t of r.tasks) {
    if (todayDone()[t.id] || sent.includes(t.id) || mins < at(t) || mins > at(t) + 60) continue;
    sent.push(t.id);
    save(state);
    const msg = `It's ${fmtTime(t.hour, t.minute)}. Time for ${t.name}${t.dose ? `, ${t.dose}` : ''}${FOOD_LABEL[t.food] ? ` (${FOOD_LABEL[t.food]})` : ''}.`;
    toast(msg, 9000);
    chime();
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.ready
        .then((reg) => reg.showNotification('Little World', { body: msg, tag: t.id, icon: './icon-192.png' }))
        .catch(() => new Notification('Little World', { body: msg, tag: t.id }));
    }
  }
}

// ---------- clock + scrubber ----------
function tick() {
  const d = now();
  world.minutes = minsOf(d) + (previewMin === null ? d.getSeconds() / 60 : 0);
  $('clock').textContent = fmtTime(d.getHours(), d.getMinutes());
  $('clock').parentElement!.classList.toggle('preview', previewMin !== null);
  $('dateLabel').textContent = previewMin !== null ? 'previewing' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  $<HTMLInputElement>('scrub').value = String(minsOf(d));
  $('scrubLabel').textContent = previewMin !== null ? 'drag to preview' : 'live, drag to preview';
  $('liveBtn').classList.toggle('on', previewMin === null);
}
$('scrub').addEventListener('input', (e) => {
  previewMin = Number((e.target as HTMLInputElement).value);
  tick();
  renderTasks();
});
$('liveBtn').addEventListener('click', () => {
  previewMin = null;
  tick();
  renderTasks();
});

// ---------- tabs + sheet ----------
function showTab(name: string) {
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll<HTMLElement>('.tab').forEach((s) => (s.hidden = s.id !== `tab-${name}`));
  if (name === 'describe') ensureGpuLine();
}
document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab!)));
$('grip').addEventListener('click', () => $('panel').classList.toggle('tall'));
document.querySelectorAll<HTMLElement>('textarea, .ask input').forEach((el) => el.addEventListener('focus', () => $('panel').classList.add('tall')));
world.onTap = (id) => toggleDone(id);

// ---------- model ----------
function setChip() {
  const chip = $('modelChip');
  chip.classList.toggle('live', modelReady);
  chip.textContent = modelReady ? `${MODEL_LABEL} · running on this device` : state.routine?.source === 'gemma' ? `${MODEL_LABEL} · saved, loads on demand` : 'Demo mode · no download';
}
$('modelChip').addEventListener('click', () => showTab('describe'));

async function ensureGpuLine() {
  if (gpu) return;
  llm ??= await import('./llm');
  gpu = await llm.checkWebGPU();
  const cached = gpu.ok ? await llm.hasCached(MODEL_ID) : false;
  const line = $('gpuLine');
  if (!gpu.ok) {
    line.textContent = `${gpu.reason} Gemma needs WebGPU (Chrome or Edge on desktop or Android). The demo island still works.`;
    $<HTMLButtonElement>('buildBtn').disabled = true;
    $('ownSub').textContent = 'needs a WebGPU browser like Chrome or Edge';
  } else if (!gpu.f16) {
    line.textContent = 'Your GPU is missing 16-bit float support, which this Gemma build needs. The demo island still works.';
    $<HTMLButtonElement>('buildBtn').disabled = true;
  } else {
    line.textContent = cached
      ? `${MODEL_LABEL} is already saved on this device. It loads in seconds and works offline.`
      : `${MODEL_LABEL} will download once (about ${MODEL_GB}) and is then stored in this browser. After that it works offline.`;
  }
}

/** The WebLLM chunks are not precached, so store the ones this page used for offline visits. */
function warmOfflineCache() {
  if (!('caches' in window) || !import.meta.env.PROD) return;
  const urls = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((u) => u.startsWith(location.origin) && u.includes('/assets/') && u.endsWith('.js'));
  caches.open('little-world-runtime').then((c) => Promise.all(urls.map((u) => c.match(u).then((hit) => (hit ? undefined : c.add(u)))))).catch(() => {});
}

async function ensureModel() {
  if (modelReady) return true;
  llm ??= await import('./llm');
  await ensureGpuLine();
  if (!gpu?.ok || !gpu.f16) return false;
  $('bar').hidden = false;
  const t0 = performance.now();
  await llm.loadModel(MODEL_ID, (r) => {
    $('barFill').style.width = `${Math.round(r.progress * 100)}%`;
    const mb = r.text.match(/(\d+)MB (fetched|loaded)/);
    $('loadText').textContent = mb ? `${r.text.includes('fetched') ? 'Downloading' : 'Loading'} Gemma: ${mb[1]} MB (${Math.round(r.progress * 100)}%)` : r.text.split('.')[0];
  });
  modelReady = true;
  state.modelId = MODEL_ID;
  save(state);
  warmOfflineCache();
  $('loadText').textContent = `Gemma ready in ${((performance.now() - t0) / 1000).toFixed(1)} s, running on your GPU.`;
  $('gpuLine').textContent = `${MODEL_LABEL} is loaded on this device.`;
  setChip();
  return true;
}

$('buildBtn').addEventListener('click', async () => {
  const text = $<HTMLTextAreaElement>('desc').value.trim();
  if (text.length < 4) {
    toast('Write a line or two about your routine first.');
    return;
  }
  const btn = $<HTMLButtonElement>('buildBtn');
  btn.disabled = true;
  $('preview').hidden = true;
  try {
    btn.textContent = 'Waking Gemma up…';
    if (!(await ensureModel())) return;
    btn.textContent = 'Gemma is reading your routine…';
    const res = await llm!.parseRoutine(text, {
      onToken: (raw) => ($('loadText').textContent = `Writing… ${raw.length} characters`),
    });
    if (!res.ok || !res.spec) {
      $('loadText').textContent = `Gemma's answer didn't pass the checks twice (${res.error}). Try shorter sentences, one item per line.`;
      return;
    }
    pending = { spec: res.spec, result: res, input: text };
    const s = res.stats;
    $('loadText').textContent = `${s.completionTokens} tokens in ${(s.ms / 1000).toFixed(1)} s · ${s.decodeTps.toFixed(0)} tokens/s · checked by zod${res.attempts > 1 ? ' after one repair' : ''}`;
    $('previewHead').textContent = `Gemma found ${res.spec.tasks.length} thing${res.spec.tasks.length === 1 ? '' : 's'} to remember. Check the times, then plant them.`;
    res.spec.tasks.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
    renderPreview();
    $('fixNote').textContent = res.fixes ? `${res.fixes} detail${res.fixes === 1 ? ' was' : 's were'} corrected from your own words.` : '';
    $('rawJson').textContent = JSON.stringify(JSON.parse(res.raw), null, 2);
    $('preview').hidden = false;
  } catch (e) {
    console.error(e);
    $('loadText').textContent = `Something went wrong loading Gemma: ${(e as Error).message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Build my island with Gemma';
  }
});

function renderPreview() {
  if (!pending) return;
  const list = $('previewList');
  list.innerHTML = '';
  pending.spec.tasks.forEach((t, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<input type="time" value="${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}" aria-label="Time for ${escapeHtml(t.name)}" /><span>${escapeHtml(t.name)}${t.dose ? ` (${escapeHtml(t.dose)})` : ''}${FOOD_LABEL[t.food] ? `, ${FOOD_LABEL[t.food]}` : ''}${t.note ? ` · <i>${escapeHtml(t.note)}</i>` : ''}</span><button type="button" class="x" aria-label="Remove ${escapeHtml(t.name)}">×</button>`;
    li.querySelector('input')!.addEventListener('change', (e) => {
      const [h, m] = (e.target as HTMLInputElement).value.split(':').map(Number);
      if (Number.isFinite(h)) Object.assign(t, { hour: h, minute: m || 0 });
    });
    li.querySelector('button')!.addEventListener('click', () => {
      pending!.spec.tasks.splice(i, 1);
      renderPreview();
    });
    list.appendChild(li);
  });
  $<HTMLButtonElement>('plantBtn').disabled = pending.spec.tasks.length === 0;
}

$('plantBtn').addEventListener('click', () => {
  if (!pending) return;
  setRoutine(toRoutine(pending.spec, { source: 'gemma', model: MODEL_LABEL, createdAt: Date.now(), input: pending.input }));
  delete state.done[dayKey(new Date())];
  save(state);
  renderTasks();
  pending = null;
  $('preview').hidden = true;
  showTab('today');
  $('panel').classList.remove('tall');
  setChip();
  toast('Planted. Tap a flower or press Done when you finish something.');
});
$('discardBtn').addEventListener('click', () => {
  pending = null;
  $('preview').hidden = true;
});
document.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((b) =>
  b.addEventListener('click', () => ($<HTMLTextAreaElement>('desc').value = b.dataset.sample === 'plant' ? PLANT_SAMPLE : MEDICINE_SAMPLE)),
);

// ---------- ask ----------
async function askQuestion(q: string) {
  const r = state.routine;
  if (!q.trim()) return;
  const box = $('answers');
  box.insertAdjacentHTML('beforeend', `<div class="q">${escapeHtml(q)}</div>`);
  const a = document.createElement('div');
  a.className = 'a';
  box.appendChild(a);
  if (!r) {
    a.textContent = 'Your island is empty, so there is nothing to answer from yet.';
    return;
  }
  const done = todayDone();
  if (!modelReady) {
    a.innerHTML = `${escapeHtml(simpleAnswer(r, done, now(), q))}<small>Answered by the simple demo matcher. Load Gemma in Describe for free-form questions.</small>`;
    a.scrollIntoView({ block: 'nearest' });
    return;
  }
  a.textContent = '…';
  try {
    const { text, stats } = await llm!.ask(r, done, now(), q, (s) => {
      a.textContent = s;
      a.scrollIntoView({ block: 'nearest' });
    });
    a.innerHTML = `${escapeHtml(text)}<small>${MODEL_LABEL} on this device · ${stats.decodeTps.toFixed(0)} tokens/s · only your routine was used</small>`;
  } catch (e) {
    a.textContent = `Gemma hit a problem: ${(e as Error).message}`;
  }
}
$('askForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>('askInput');
  askQuestion(input.value);
  input.value = '';
});
$('askSamples').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => askQuestion(b.textContent!)));

// ---------- misc buttons ----------
$('notifyBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) return toast('This browser has no notifications. Reminders still show here while the page is open.');
  const p = await Notification.requestPermission();
  toast(p === 'granted' ? 'Reminders are on while Little World is open in a tab.' : 'No problem. Reminders will still appear on this screen.');
  $('notifyBtn').hidden = p === 'granted';
});
$('resetBtn').addEventListener('click', () => {
  if (!confirm('Clear your routine and history from this device?')) return;
  wipe();
  location.reload();
});

// ---------- welcome ----------
function startDemo() {
  $('welcome').hidden = true;
  state.welcomed = true;
  setRoutine(demoRoutine());
  setChip();
}
$('startDemo').addEventListener('click', startDemo);
$('startOwn').addEventListener('click', () => {
  $('welcome').hidden = true;
  state.welcomed = true;
  save(state);
  showTab('describe');
  $('panel').classList.add('tall');
  $<HTMLTextAreaElement>('desc').focus();
});

// ---------- boot ----------
if (params.has('demo')) {
  state.welcomed = true;
  if (!state.routine || params.get('demo') === 'reset') setRoutine(demoRoutine());
}
if (params.has('capture')) document.body.classList.add('capture');
if (params.has('orbit')) world.orbit(Number(params.get('orbit')) || 0.4);
if (params.has('done')) {
  const n = Number(params.get('done'));
  state.routine?.tasks.slice(0, n).forEach((t) => (todayDone()[t.id] ??= Date.now()));
}
world.setRoutine(state.routine);
if (state.routine) $('routineTitle').textContent = state.routine.title;
$('welcome').hidden = state.welcomed;
$<HTMLTextAreaElement>('desc').value = state.routine?.input ?? MEDICINE_SAMPLE;
if ('Notification' in window && Notification.permission === 'granted') $('notifyBtn').hidden = true;
tick();
renderTasks();
setChip();
setInterval(() => {
  tick();
  checkReminders();
}, 1000);
setInterval(renderTasks, 30_000);
requestAnimationFrame(() => $('boot').remove());

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
(window as any).__lw = { world, state, setPreview: (m: number | null) => ((previewMin = m), tick(), renderTasks()), toggleDone, askQuestion, ensureModel, showTab };
