import { FOOD_LABEL, fmtTime, type Routine, type Task } from './schema';

const SAFETY = /\b(safe|side.?effects?|together|mix|combine|interact|double|skip|missed|miss|alcohol|overdose|pregnan|stop taking|increase|decrease|instead)\b/i;

function match(routine: Routine, q: string): Task[] {
  const words = q.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return routine.tasks.filter((t) => {
    const name = `${t.name} ${t.icon} ${t.note}`.toLowerCase();
    return words.some((w) => w.length > 2 && name.includes(w)) || (t.icon === 'drops' && /drop/.test(q)) || (t.icon === 'walk' && /walk/.test(q));
  });
}

const when = (t: Task) => `${fmtTime(t.hour, t.minute)}${FOOD_LABEL[t.food] ? `, ${FOOD_LABEL[t.food]}` : ''}`;

/** Tiny rule based answerer for demo mode, so the Ask tab works without the model. */
export function simpleAnswer(routine: Routine, done: Record<string, number>, now: Date, q: string): string {
  const mins = now.getHours() * 60 + now.getMinutes();
  const at = (t: Task) => t.hour * 60 + t.minute;
  if (SAFETY.test(q)) return "That's a question for your doctor or pharmacist. I only know the routine you wrote down, not what is safe for you.";
  const hits = match(routine, q);
  const undone = routine.tasks.filter((t) => !done[t.id]);
  if (/\bnext\b|coming up|what now/i.test(q)) {
    const n = undone.find((t) => at(t) >= mins - 60) ?? undone[0];
    return n ? `Next is ${n.name}${n.dose ? ` (${n.dose})` : ''} at ${when(n)}.` : 'Everything for today is done.';
  }
  if (/\b(did|have) i\b|taken|already/i.test(q)) {
    const list = hits.length ? hits : routine.tasks.filter((t) => at(t) <= mins);
    if (!list.length) return "I can't see that in your notes.";
    return list
      .map((t) => (done[t.id] ? `Yes, ${t.name} at ${fmtTime(t.hour, t.minute)} is marked done.` : at(t) <= mins ? `Not yet: ${t.name} was due at ${fmtTime(t.hour, t.minute)}.` : `${t.name} is later, at ${fmtTime(t.hour, t.minute)}.`))
      .join(' ');
  }
  if (/\bleft\b|remaining|still|pending|rest of/i.test(q)) {
    return undone.length ? `Still to do today: ${undone.map((t) => `${t.name} at ${fmtTime(t.hour, t.minute)}`).join(', ')}.` : 'Nothing left today.';
  }
  if (hits.length) return hits.map((t) => `${t.name}${t.dose ? ` (${t.dose})` : ''} is at ${when(t)}${t.note ? `. Your note says: ${t.note}` : ''}.`).join(' ');
  return "In demo mode I can answer simple questions like \"what's next?\" or \"did I take the eye drops?\". Load Gemma to ask anything about your routine.";
}
