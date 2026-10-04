import type { Food, ModelRoutine, When } from './schema';

const FOOD_PHRASES: [RegExp, Food][] = [
  [/\bempty stomach\b/i, 'empty_stomach'],
  [/\bwith (food|meals?|milk)\b/i, 'with_food'],
  [/\bafter (food|meals?)\b/i, 'after_food'],
  [/\bbefore (food|meals?)\b/i, 'before_food'],
];

type Fix = { when: When; hour?: number; minute?: number };

const PHRASES: [RegExp, When][] = [
  [/\b(wake|waking|woke|first thing)\b/i, 'wake_up'],
  [/\bbefore (my |the )?breakfast\b/i, 'before_breakfast'],
  [/\b(with|at|during) (my |the )?breakfast\b/i, 'with_breakfast'],
  [/\bafter (my |the )?breakfast\b/i, 'after_breakfast'],
  [/\bbefore (my |the )?lunch\b/i, 'before_lunch'],
  [/\b(with|at|during) (my |the )?lunch\b/i, 'with_lunch'],
  [/\bafter (my |the )?lunch\b/i, 'after_lunch'],
  [/\bbefore (my |the )?dinner\b/i, 'before_dinner'],
  [/\b(with|at|during) (my |the )?dinner\b/i, 'with_dinner'],
  [/\bafter (my |the )?dinner\b/i, 'after_dinner'],
  [/\b(bed ?time|before (bed|sleep|sleeping))\b/i, 'bedtime'],
];

/** Clock times written with am/pm, as 24h "20:00", or as noon/midnight. Bare numbers are too ambiguous. */
function clockTimes(s: string): { hour: number; minute: number }[] {
  const out: { hour: number; minute: number }[] = [];
  for (const m of s.matchAll(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/gi)) {
    let h = Number(m[1]) % 12;
    if (/p/i.test(m[3])) h += 12;
    out.push({ hour: h, minute: Number(m[2] ?? 0) });
  }
  for (const m of s.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(a\.?m|p\.?m))/gi)) out.push({ hour: Number(m[1]), minute: Number(m[2]) });
  if (/\bnoon\b/i.test(s)) out.push({ hour: 12, minute: 0 });
  if (/\bmidnight\b/i.test(s)) out.push({ hour: 0, minute: 0 });
  return out;
}

/** Every distinct moment named in a quote, in the order written. */
function moments(said: string): Fix[] {
  const found: { at: number; fix: Fix }[] = [];
  for (const [re, w] of PHRASES) {
    const m = said.match(re);
    if (m) found.push({ at: m.index ?? 0, fix: { when: w } });
  }
  for (const m of said.matchAll(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/gi)) {
    let h = Number(m[1]) % 12;
    if (/p/i.test(m[3])) h += 12;
    found.push({ at: m.index ?? 0, fix: { when: 'at_time', hour: h, minute: Number(m[2] ?? 0) } });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.fix);
}

function fromQuote(said: string): Fix | null {
  const times = clockTimes(said);
  const phrases = PHRASES.filter(([re]) => re.test(said)).map(([, w]) => w);
  if (times.length === 1 && phrases.length === 0) return { when: 'at_time', ...times[0] };
  if (phrases.length === 1 && times.length === 0) return { when: phrases[0] };
  return null;
}

/**
 * The model copies the user's words for each task into `said`. If those words contain exactly one
 * unambiguous time and it disagrees with what the model picked, trust the user's words.
 */
export function quoteCheck(m: ModelRoutine, source = ''): { routine: ModelRoutine; fixes: number } {
  let fixes = 0;
  // a dose number the person never wrote is made up; drop it rather than show a wrong amount
  const WORDS = ['a|an|one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const written = new Set(source.match(/\d+(?:\.\d+)?/g) ?? []);
  WORDS.forEach((w, i) => new RegExp(`\\b(${w})\\b`, 'i').test(source) && written.add(String(i + 1)));
  const invented = (dose: string) => source !== '' && (dose.match(/\d+(?:\.\d+)?/g) ?? []).some((n) => !written.has(n));
  // "before lunch and before dinner" quoted on a single task means two tasks
  const split: ModelRoutine['tasks'] = [];
  for (const t of m.tasks) {
    const ms = moments(t.said);
    const siblings = m.tasks.filter((o) => o.said === t.said).length;
    if (ms.length >= 2 && siblings === 1) {
      fixes += ms.length - 1;
      for (const f of ms) split.push({ ...t, ...f, ...(f.when === 'at_time' ? {} : { hour: undefined, minute: undefined }), said: '' });
    } else split.push(t);
  }
  const tasks = split.map((t0) => {
    let t = /^(unknown|none|n\/?a|-)$/i.test(t0.dose.trim()) ? { ...t0, dose: '' } : t0;
    if (invented(t.dose)) {
      fixes++;
      t = { ...t, dose: '' };
    }
    const foods = FOOD_PHRASES.filter(([re]) => re.test(t.said)).map(([, f]) => f);
    if (foods.length === 1 && foods[0] !== t.food) {
      fixes++;
      t = { ...t, food: foods[0] };
    }
    const f = fromQuote(t.said);
    if (!f) return t;
    const same = f.when === t.when && (f.when !== 'at_time' || (f.hour === t.hour && (f.minute ?? 0) === (t.minute ?? 0)));
    if (same) return t;
    fixes++;
    return { ...t, ...f, ...(f.when === 'at_time' ? {} : { hour: undefined, minute: undefined }) };
  });
  return { routine: { ...m, tasks }, fixes };
}
