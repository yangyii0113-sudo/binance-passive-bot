import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const commit='1234567890123456789012345678901234567890';
execFileSync(process.execPath,['scripts/build-static.mjs'],{env:{...process.env,COMMIT_REF:commit}});
const html=readFileSync('dist/index.html','utf8');
const moduleSrc=html.match(/type="module" src="([^"]+)"/)[1];
assert.equal(moduleSrc,`./releases/${commit}/src/main.js`,'The full module tree must share the same immutable release directory');
assert.ok(existsSync(resolve('dist',moduleSrc)));
assert.ok(existsSync(`dist/releases/${commit}/styles.css`));
const files=[];
function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())visit(path);else if(path.endsWith('.js'))files.push(path);}}
visit(`dist/releases/${commit}/src`);
let imports=0;
for(const file of files){
  const code=readFileSync(file,'utf8');
  for(const match of code.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)){
    const target=resolve(dirname(file),match[1]);
    assert.ok(target.startsWith(resolve(`dist/releases/${commit}`)),`${file}: import leaves release`);
    assert.ok(existsSync(target),`${file}: missing ${match[1]}`);imports++;
  }
}
assert.ok(imports>100);
assert.deepEqual(JSON.parse(readFileSync('dist/build.json','utf8')),{build:'1234567',commit});
const version=JSON.parse(readFileSync('dist/version.json','utf8'));
assert.equal(version.commit,commit);
assert.equal(version.paperOnly,true);
assert.equal(version.realOrderLocked,true);
assert.equal(version.noBackfill,true);
assert.ok(existsSync('dist/tests/mobile-viewport.html'));
for(const forbidden of ['src','research-service','staging_server.py','tests/unavailable-data.mjs'])assert.ok(!existsSync(`dist/${forbidden}`),forbidden);
const invalid=spawnSync(process.execPath,['scripts/build-static.mjs'],{env:{...process.env,COMMIT_REF:'not-a-commit'}});
assert.notEqual(invalid.status,0);
console.log(`STATIC_BUILD_OK: ${files.length} modules, ${imports} relative imports, version and safety metadata verified`);
