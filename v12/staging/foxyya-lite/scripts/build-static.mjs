import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const commit = process.env.COMMIT_REF || execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Build requires a full source commit SHA');
const release = `releases/${commit}`;
await rm('dist', {recursive:true,force:true});
await mkdir(`dist/${release}`, {recursive:true});
const html = (await readFile('index.html','utf8'))
  .replace('./styles.css', `./${release}/styles.css`)
  .replace('./src/main.js', `./${release}/src/main.js`);
await writeFile('dist/index.html', html);
await cp('styles.css', `dist/${release}/styles.css`);
await cp('src', `dist/${release}/src`, {recursive:true});
await mkdir('dist/tests');
await cp('tests/mobile-viewport.html', 'dist/tests/mobile-viewport.html');
await writeFile('dist/build.json', JSON.stringify({build:commit.slice(0,7),commit})+'\n');
await writeFile('dist/version.json', JSON.stringify({commit,paperOnly:true,realOrderLocked:true,noBackfill:true},null,2)+'\n');
console.log(`STATIC_BUILD_OK ${commit}`);
