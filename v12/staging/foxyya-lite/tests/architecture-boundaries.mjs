import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNTIME_ENDPOINTS } from '../src/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '../src');

for (const [name, endpoint] of Object.entries(RUNTIME_ENDPOINTS)) {
  assert.match(endpoint, /^\/api\//, `${name} must stay on same-origin /api/*`);
  assert.equal(/^https?:\/\//i.test(endpoint), false, `${name} must not expose an external runtime origin`);
}

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
}
walk(srcRoot);

const forbidden = [
  /RAILWAY_STATIC_URL/i,
  /railway\.app/i,
  /railway\.internal/i,
  /api[_-]?key/i,
  /secret/i,
  /bearer\s+[a-z0-9._-]+/i
];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of forbidden) {
    assert.equal(pattern.test(content), false, `${path.relative(srcRoot, file)} contains forbidden runtime/credential coupling: ${pattern}`);
  }
}

console.log('ARCHITECTURE_BOUNDARIES_OK');
console.log('runtime endpoints: same-origin only');
console.log(`browser modules scanned: ${files.length}`);
console.log('external runtime origins / credentials: absent');
