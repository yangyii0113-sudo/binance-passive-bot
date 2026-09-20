import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const commit = process.env.COMMIT_REF || execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Build requires a full source commit SHA');
await rm('dist', {recursive:true,force:true});
await mkdir('dist');
for (const path of ['index.html','styles.css','src']) await cp(path, `dist/${path}`, {recursive:true});
await writeFile('dist/version.json', JSON.stringify({commit,branch:'foxyya-lite-railway-deploy',paperOnly:true,realOrderLocked:true},null,2)+'\n');
console.log(`STATIC_BUILD_OK ${commit}`);
