import { FOOD_LABEL, fmtTime, type Routine } from './schema';

export function routinePrompt(text: string) {
  return `You turn someone's own description of their daily routine into JSON for a reminder app.

Rules:
- Make one task for every moment something must be done. "twice a day" means two tasks. "before lunch and before dinner" means two tasks.
- said: first copy the exact words from their description that talk about this task.
- when: read your "said" words and pick the meaning of the time from this list:
  wake_up, before_breakfast, with_breakfast, after_breakfast, morning,
  before_lunch, with_lunch, after_lunch, afternoon, evening,
  before_dinner, with_dinner, after_dinner, night, bedtime.
  "twice a day" = morning and night. "three times a day" = morning, afternoon and night.
- Only when the person says a clock time (like "10 am", "6 pm", "at 8", "20:00") use "when": "at_time" with hour (0 to 23, so 6 pm is 18) and minute.
- name: the medicine or task in a few words, in the person's own words.
- dose: the amount if they gave one (like "500 mg" or "2 drops"), otherwise "".
- food: before_food, after_food, with_food, empty_stomach, or any.
- icon: pill (tablets, capsules), drops (eye or ear drops), inhaler, injection (insulin), syrup, water (drink water), plant (watering or plant care), meal, walk (exercise), other.
- note: a short reminder copied from what they said (like "both eyes" or "not with milk"), otherwise "".
- title: a short warm name for this routine.
- Meals themselves are not tasks. Never add tasks the person did not mention. Never change a dose.

Example description:
"""
One iron tablet after lunch, not with tea. Eye drops at 9 pm, both eyes.
"""
Example JSON:
{"title": "Iron and eye drops", "tasks": [{"said": "One iron tablet after lunch, not with tea", "name": "Iron tablet", "dose": "1 tablet", "when": "after_lunch", "food": "after_food", "icon": "pill", "note": "not with tea"}, {"said": "Eye drops at 9 pm, both eyes", "name": "Eye drops", "dose": "", "when": "at_time", "hour": 21, "minute": 0, "food": "any", "icon": "drops", "note": "both eyes"}]}

Their description:
"""
${text.trim()}
"""`;
}

export function askPrompt(routine: Routine, done: Record<string, number>, now: Date, question: string) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const at = (t: Routine['tasks'][number]) => t.hour * 60 + t.minute;
  const desc = (t: Routine['tasks'][number]) => {
    const food = FOOD_LABEL[t.food] ? `, ${FOOD_LABEL[t.food]}` : '';
    const dose = t.dose ? ` (${t.dose})` : '';
    const note = t.note ? `, note: ${t.note}` : '';
    return `${t.name}${dose} at ${fmtTime(t.hour, t.minute)}${food}${note}`;
  };
  const doneList = routine.tasks.filter((t) => done[t.id]);
  const waiting = routine.tasks.filter((t) => !done[t.id] && at(t) <= mins);
  const later = routine.tasks.filter((t) => !done[t.id] && at(t) > mins);
  const ago = (t: Routine['tasks'][number]) => {
    const d = mins - at(t);
    return d >= 60 ? `${Math.floor(d / 60)} h ${d % 60} min ago` : `${d} min ago`;
  };
  const list = (ts: typeof routine.tasks) => (ts.length ? ts.map((t) => `- ${desc(t)}`).join('\n') : '- nothing');
  return `You are a gentle helper inside a reminder app. You talk to the person directly, as "you". Answer using ONLY the facts below.

Right now it is ${now.toLocaleDateString('en-US', { weekday: 'long' })}, ${fmtTime(now.getHours(), now.getMinutes())}.

Already done today:
${list(doneList)}

Time has passed but NOT done yet (remind them kindly):
${list(waiting)}

Still coming up later today:
${list(later)}

${waiting.length ? `Most urgent now: ${desc(waiting[0])}. It was due ${ago(waiting[0])} and is still not done.` : later.length ? `Next up: ${desc(later[0])}.` : 'Everything is done for today.'}

Rules:
- Answer in one to three short, kind sentences, speaking to "you".
- Only use the facts above. If the answer is not there, say you can't see that in your notes.
- Do not give medical advice. If they ask whether something is safe, about side effects, mixing medicines, missed doses, or changing a dose, say kindly that their doctor or pharmacist is the right person to ask.

Question: ${question.trim()}`;
}
