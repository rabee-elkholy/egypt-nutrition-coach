import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const rawCatalog = await readFile(resolve(ROOT, 'contracts/error-codes.json'), 'utf8');
if (/[\u0600-\u06FF]/.test(rawCatalog)) {
  throw new Error('contracts/error-codes.json must be 100% English and must not contain Arabic text!');
}

const catalog = JSON.parse(rawCatalog);

for (const [code, def] of Object.entries(catalog.codes)) {
  if (!/^[A-Z][A-Z0-9_]+$/.test(code)) {
    throw new Error(`Invalid error code format: ${code}`);
  }
  if (/[\u0600-\u06FF]/.test(def.message)) {
    throw new Error(`English error message for ${code} must not contain Arabic text!`);
  }
  if (!Number.isInteger(def.httpStatus) || def.httpStatus < 400 || def.httpStatus > 599) {
    throw new Error(`Invalid httpStatus for ${code}: ${def.httpStatus}`);
  }
}

const mdLines = [
  '# CuraFit API v1 — Canonical Error Codes Reference',
  '',
  'Generated automatically from [`contracts/error-codes.json`](../contracts/error-codes.json).',
  '',
  '> **KMM Integration Rule:** API error responses **never contain Arabic text** in `error.message`. Clients localize strictly via `error.code` + `error.params` using this catalog.',
  '',
  '## Error Envelope Shape (`4xx` / `5xx`)',
  '',
  '```json',
  '{',
  '  "ok": false,',
  '  "error": {',
  '    "code": "REVISION_CONFLICT",',
  '    "message": "Account state has changed; sync and retry with the latest revision.",',
  '    "params": { "expectedRevision": 4, "currentRevision": 5 },',
  '    "fieldErrors": [],',
  '    "retryable": false,',
  '    "details": {',
  '      "currentRevision": 5,',
  '      "mergeHints": { ... }',
  '    }',
  '  },',
  '  "meta": {',
  '    "requestId": "9a7b6c5d-...",',
  '    "serverTime": "2026-11-21T14:00:00.000Z"',
  '  }',
  '}',
  '```',
  '',
  '## Error Code Catalog',
  '',
  '| Code | HTTP | Retryable | Params | English Message (`error.message`) |',
  '| :--- | :---: | :---: | :--- | :--- |'
];

for (const [code, def] of Object.entries(catalog.codes)) {
  const paramsStr = def.params?.length ? def.params.map(p => `\`${p}\``).join(', ') : '—';
  const escPipe = s => String(s).replace(/\|/g, '\\|');
  mdLines.push(
    `| \`${code}\` | \`${def.httpStatus}\` | ${def.retryable ? 'Yes' : 'No'} | ${paramsStr} | ${escPipe(def.message)} |`
  );
}

const mdContent = mdLines.join('\n') + '\n';
if (/[\u0600-\u06FF]/.test(mdContent)) {
  throw new Error('Generated docs/ERROR_CODES.md must not contain Arabic text!');
}

await writeFile(resolve(ROOT, 'docs/ERROR_CODES.md'), mdContent, 'utf8');
console.log(`Synced ${Object.keys(catalog.codes).length} English error codes -> docs/ERROR_CODES.md (0 Arabic characters)`);
