import { FOOD_LABEL, fmtTime, type Routine } from './schema';

export function routinePrompt(text: string) {
  return `You turn someone's own description of their daily routine into JSON for a reminder app.

Rules:
- Make one task for every time something must be done. "twice a day" means two tasks. "before lunch and before dinner" means two tasks.
- Use 24 hour time. When no exact time is given, use these defaults:
  waking up 07:00, before breakfast 07:30, breakfast 08:00, after breakfast 08:30,
  before lunch 12:30, lunch 13:00, after lunch 13:30, evening 18:00, before dinner 19:30,
  dinner 20:00, after dinner 20:30, bedtime 22:00.
  "twice a day" = 08:00 and 20:00. "three times a day" = 08:00, 14:00 and 20:00.
- If the person gives an exact time like "10 am" or "6 pm", use it exactly.
- name: the medicine or task in a few words, keep the person's own words for names.
- dose: the amount if given (like "1 tablet" or "2 drops"), otherwise "".
- food: before_food, after_food, with_food, empty_stomach, or any.
- icon: pill (tablets, capsules), drops (eye or ear drops), inhaler, injection (insulin), syrup, water (drink water), plant (watering or plant care), meal, walk (exercise), other.
- note: a short helpful reminder copied from what they said (like "both eyes" or "not with milk"), otherwise "".
- title: a short warm name for this routine.
- Never add tasks the person did not mention. Never change a dose.

Example description:
"""
One iron tablet after lunch, not with tea. Eye drops at 9 pm, both eyes.
"""
Example JSON:
{"title": "Iron and eye drops", "tasks": [{"name": "Iron tablet", "dose": "1 tablet", "hour": 13, "minute": 30, "food": "after_food", "icon": "pill", "note": "not with tea"}, {"name": "Eye drops", "dose": "", "hour": 21, "minute": 0, "food": "any", "icon": "drops", "note": "both eyes"}]}

Their description:
"""
${text.trim()}
"""`;
}

export function askPrompt(routine: Routine, done: Record<string, number>, now: Date, question: string) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const lines = routine.tasks.map((t) => {
    const at = t.hour * 60 + t.minute;
    const status = done[t.id]
      ? `done at ${fmtTime(new Date(done[t.id]).getHours(), new Date(done[t.id]).getMinutes())}`
      : at <= mins
        ? 'NOT done yet (time has passed)'
        : 'later today';
    const food = FOOD_LABEL[t.food] ? `, ${FOOD_LABEL[t.food]}` : '';
    const dose = t.dose ? ` (${t.dose})` : '';
    const note = t.note ? `, note: ${t.note}` : '';
    return `- ${fmtTime(t.hour, t.minute)}: ${t.name}${dose}${food}${note}. Status: ${status}.`;
  });
  return `You are a gentle helper inside a reminder app. Answer the question using ONLY the person's own routine below.

Right now it is ${now.toLocaleDateString('en-US', { weekday: 'long' })}, ${fmtTime(now.getHours(), now.getMinutes())}.

Their routine for today:
${lines.join('\n')}

Rules:
- Answer in one to three short, kind sentences.
- Only use facts from the routine above. If the answer is not there, say you can't see that in their notes.
- Do not give medical advice. If they ask whether something is safe, about side effects, mixing medicines, missed doses, or changing a dose, say kindly that their doctor or pharmacist is the right person to ask.

Question: ${question.trim()}`;
}
