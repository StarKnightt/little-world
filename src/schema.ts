import { z } from 'zod';

export const ICONS = ['pill', 'drops', 'inhaler', 'injection', 'syrup', 'water', 'plant', 'meal', 'walk', 'other'] as const;
export const FOOD = ['before_food', 'after_food', 'with_food', 'empty_stomach', 'any'] as const;

export type Icon = (typeof ICONS)[number];
export type Food = (typeof FOOD)[number];

export const TaskZ = z.object({
  name: z.string().trim().min(1).max(80),
  dose: z.string().trim().max(80),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  food: z.enum(FOOD),
  icon: z.enum(ICONS),
  note: z.string().trim().max(160),
});

export const RoutineZ = z.object({
  title: z.string().trim().min(1).max(80),
  tasks: z.array(TaskZ).min(1).max(16),
});

export type TaskSpec = z.infer<typeof TaskZ>;
export type RoutineSpec = z.infer<typeof RoutineZ>;

export interface Task extends TaskSpec {
  id: string;
}

export interface Routine {
  title: string;
  tasks: Task[];
  source: 'demo' | 'gemma';
  model?: string;
  createdAt: number;
  input: string;
}

/** Hand-written JSON schema handed to WebLLM's grammar engine, kept in sync with RoutineZ. */
export const ROUTINE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          dose: { type: 'string' },
          hour: { type: 'integer', minimum: 0, maximum: 23 },
          minute: { type: 'integer', minimum: 0, maximum: 59 },
          food: { type: 'string', enum: [...FOOD] },
          icon: { type: 'string', enum: [...ICONS] },
          note: { type: 'string' },
        },
        required: ['name', 'dose', 'hour', 'minute', 'food', 'icon', 'note'],
        additionalProperties: false,
      },
      minItems: 1,
      maxItems: 16,
    },
  },
  required: ['title', 'tasks'],
  additionalProperties: false,
} as const;

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'task';
}

export function toRoutine(spec: RoutineSpec, meta: Omit<Routine, 'title' | 'tasks'>): Routine {
  const seen = new Map<string, number>();
  const tasks = [...spec.tasks]
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
    .map((t) => {
      const base = `${slug(t.name)}-${String(t.hour).padStart(2, '0')}${String(t.minute).padStart(2, '0')}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return { ...t, id: n ? `${base}-${n}` : base };
    });
  return { title: spec.title, tasks, ...meta };
}

export function fmtTime(h: number, m: number) {
  const ap = h < 12 ? 'am' : 'pm';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hh}:${String(m).padStart(2, '0')} ${ap}` : `${hh} ${ap}`;
}

export const FOOD_LABEL: Record<Food, string> = {
  before_food: 'before food',
  after_food: 'after food',
  with_food: 'with food',
  empty_stomach: 'empty stomach',
  any: '',
};

/** Pull the first balanced JSON object out of free text (used for unconstrained output). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('no JSON object found');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('unterminated JSON object');
}
