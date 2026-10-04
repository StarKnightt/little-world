import type { MLCEngineInterface, InitProgressReport } from '@mlc-ai/web-llm';
import { askPrompt, routinePrompt } from './prompts';
import { ROUTINE_EBNF } from './grammar';
import { extractJson, ROUTINE_JSON_SCHEMA, RoutineZ, type Routine, type RoutineSpec } from './schema';

export interface ModelInfo {
  id: string;
  label: string;
  sizeMB: number;
  needsF16: boolean;
}

export const MODELS: ModelInfo[] = [
  { id: 'gemma3-1b-it-q4f16_1-MLC', label: 'Gemma 3 1B', sizeMB: 711, needsF16: true },
  { id: 'gemma-2-2b-it-q4f16_1-MLC', label: 'Gemma 2 2B', sizeMB: 1895, needsF16: true },
];
export const DEFAULT_MODEL = MODELS[0];

export interface GpuStatus {
  ok: boolean;
  f16: boolean;
  reason?: string;
  adapter?: string;
}

export async function checkWebGPU(): Promise<GpuStatus> {
  const gpu = (navigator as any).gpu;
  if (!gpu) return { ok: false, f16: false, reason: 'This browser has no WebGPU.' };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { ok: false, f16: false, reason: 'WebGPU is present but no GPU adapter was found.' };
    const info = adapter.info ?? {};
    return {
      ok: true,
      f16: adapter.features.has('shader-f16'),
      adapter: [info.vendor, info.architecture, info.description].filter(Boolean).join(' '),
    };
  } catch (e) {
    return { ok: false, f16: false, reason: String(e) };
  }
}

export interface Stats {
  promptTokens: number;
  completionTokens: number;
  decodeTps: number;
  prefillTps: number;
  ms: number;
}

let engine: MLCEngineInterface | null = null;
let loadedId: string | null = null;

export function currentModel() {
  return loadedId;
}

export async function hasCached(id: string) {
  const { hasModelInCache } = await import('@mlc-ai/web-llm');
  try {
    return await hasModelInCache(id);
  } catch {
    return false;
  }
}

export async function loadModel(id: string, onProgress: (r: InitProgressReport) => void) {
  if (engine && loadedId === id) return engine;
  const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
  if (engine) {
    await engine.unload();
    engine = null;
  }
  const worker = new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' });
  // Gemma 3's MLC config ships both a context window and a sliding window; WebLLM accepts only one.
  const chatOpts = (globalThis as any).__LW_CHAT_OPTS ?? (id.startsWith('gemma3') ? { sliding_window_size: -1, context_window_size: 4096 } : undefined);
  engine = await CreateWebWorkerMLCEngine(worker, id, { initProgressCallback: onProgress }, chatOpts as any);
  loadedId = id;
  return engine;
}

function readStats(usage: any, t0: number): Stats {
  return {
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    decodeTps: usage?.extra?.decode_tokens_per_s ?? 0,
    prefillTps: usage?.extra?.prefill_tokens_per_s ?? 0,
    ms: performance.now() - t0,
  };
}

export interface ParseResult {
  ok: boolean;
  spec?: RoutineSpec;
  raw: string;
  error?: string;
  stats: Stats;
  attempts: number;
}

/** Text in, validated routine out. Grammar-constrained by default; one repair attempt if zod rejects. */
export type Mode = 'grammar' | 'schema' | 'free';

export async function parseRoutine(text: string, opts: { mode?: Mode; onToken?: (s: string) => void } = {}): Promise<ParseResult> {
  if (!engine) throw new Error('model not loaded');
  const mode = opts.mode ?? 'grammar';
  const constrained = mode !== 'free';
  const t0 = performance.now();
  let raw = '';
  let error = '';
  let stats: Stats = readStats(null, t0);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const content =
      attempt === 1
        ? routinePrompt(text)
        : `${routinePrompt(text)}\n\nYour last answer was rejected because: ${error}. Reply with corrected JSON only.`;
    await engine.resetChat();
    const stream = await engine.chat.completions.create({
      messages: [{ role: 'user', content: constrained ? content : `${content}\n\nReply with JSON only, shaped like {"title": string, "tasks": [{"name","dose","hour","minute","food","icon","note"}]}.` }],
      temperature: 0,
      max_tokens: 1200,
      stream: true,
      stream_options: { include_usage: true },
      ...(mode === 'grammar' ? { response_format: { type: 'grammar', grammar: ROUTINE_EBNF } as any } : {}),
      ...(mode === 'schema' ? { response_format: { type: 'json_object', schema: JSON.stringify(ROUTINE_JSON_SCHEMA) } as any } : {}),
    });
    raw = '';
    for await (const chunk of stream) {
      const d = chunk.choices[0]?.delta?.content ?? '';
      if (d) {
        raw += d;
        opts.onToken?.(raw);
      }
      if (chunk.usage) stats = readStats(chunk.usage, t0);
    }
    try {
      const json = constrained ? JSON.parse(raw) : extractJson(raw);
      const res = RoutineZ.safeParse(json);
      if (res.success) return { ok: true, spec: res.data, raw, stats, attempts: attempt };
      error = res.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    } catch (e) {
      error = `invalid JSON (${(e as Error).message})`;
    }
  }
  return { ok: false, raw, error, stats, attempts: 2 };
}

export async function ask(routine: Routine, done: Record<string, number>, now: Date, question: string, onToken: (s: string) => void) {
  if (!engine) throw new Error('model not loaded');
  const t0 = performance.now();
  await engine.resetChat();
  const stream = await engine.chat.completions.create({
    messages: [{ role: 'user', content: askPrompt(routine, done, now, question) }],
    temperature: 0.2,
    max_tokens: 160,
    stream: true,
    stream_options: { include_usage: true },
  });
  let out = '';
  let stats = readStats(null, t0);
  for await (const chunk of stream) {
    const d = chunk.choices[0]?.delta?.content ?? '';
    if (d) {
      out += d;
      onToken(out);
    }
    if (chunk.usage) stats = readStats(chunk.usage, t0);
  }
  return { text: out.trim(), stats };
}
