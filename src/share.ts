import { FOOD, ICONS, RoutineZ, type Routine, type RoutineSpec } from './schema';

/** Settings the person setting it up can choose for the other device. */
export interface SharePrefs {
  big: boolean;
  speak: boolean;
}

type Packed = { v: 1; t: string; k: [string, string, number, number, number, number, string][]; p: [number, number] };

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/**
 * The whole routine travels inside the link's #fragment. Browsers never send the fragment to the
 * server, so GitHub Pages only ever sees a request for the app itself.
 */
export async function encodeShare(r: Routine, prefs: SharePrefs): Promise<string> {
  const packed: Packed = {
    v: 1,
    t: r.title,
    k: r.tasks.map((t) => [t.name, t.dose, t.hour, t.minute, FOOD.indexOf(t.food), ICONS.indexOf(t.icon), t.note]),
    p: [prefs.big ? 1 : 0, prefs.speak ? 1 : 0],
  };
  const json = new TextEncoder().encode(JSON.stringify(packed));
  if ('CompressionStream' in window) return 'z' + b64url(await pipe(json, new CompressionStream('deflate-raw')));
  return 'j' + b64url(json);
}

export async function decodeShare(code: string): Promise<{ spec: RoutineSpec; prefs: SharePrefs }> {
  const body = unb64url(code.slice(1));
  const bytes = code[0] === 'z' ? await pipe(body, new DecompressionStream('deflate-raw')) : body;
  const p = JSON.parse(new TextDecoder().decode(bytes)) as Packed;
  const spec = RoutineZ.parse({
    title: p.t,
    tasks: p.k.map(([name, dose, hour, minute, food, icon, note]) => ({ name, dose, hour, minute, food: FOOD[food] ?? 'any', icon: ICONS[icon] ?? 'other', note })),
  });
  return { spec, prefs: { big: !!p.p?.[0], speak: !!p.p?.[1] } };
}

export function shareUrl(code: string) {
  return `${location.origin}${location.pathname}#r=${code}`;
}

export function readShareHash(): string | null {
  const m = location.hash.match(/^#r=([zj][A-Za-z0-9_-]+)$/);
  return m ? m[1] : null;
}
