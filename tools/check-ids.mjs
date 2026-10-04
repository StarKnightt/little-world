// Lists element ids used via $('id') in src/main.ts that don't exist in index.html.
import { readFileSync } from 'node:fs';

const ts = readFileSync('src/main.ts', 'utf8');
const html = readFileSync('index.html', 'utf8');
const ids = new Set([...ts.matchAll(/\$(?:<\w+>)?\('([\w-]+)'\)/g)].map((m) => m[1]));
const missing = [...ids].filter((id) => !html.includes(`id="${id}"`));
console.log(missing.length ? `missing: ${missing.join(', ')}` : `all ${ids.size} ids present`);
process.exit(missing.length ? 1 : 0);
