import type { Routine } from './schema';

const KEY = 'little-world:v1';

export interface Saved {
  routine: Routine | null;
  done: Record<string, Record<string, number>>;
  notified: Record<string, string[]>;
  welcomed: boolean;
  modelId?: string;
}

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '');
    return { routine: null, done: {}, notified: {}, welcomed: false, ...s };
  } catch {
    return { routine: null, done: {}, notified: {}, welcomed: false };
  }
}

export function save(s: Saved) {
  // keep two weeks of history at most
  const keep = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort().slice(-14));
  localStorage.setItem(KEY, JSON.stringify({ ...s, done: keep(s.done), notified: keep(s.notified) }));
}

export function wipe() {
  localStorage.removeItem(KEY);
}
