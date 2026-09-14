'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const dockerfilePath='v12/staging/Dockerfile';
const entryPath='../v12/staging/runtime_entry.js';

test('v12 staging has a dedicated Node image and never boots the Production paper engine',()=>{
  assert.equal(fs.existsSync(dockerfilePath),true,'dedicated v12 staging Dockerfile required');
  const dockerfile=fs.readFileSync(dockerfilePath,'utf8');
  assert.match(dockerfile,/FROM node:22/);
  assert.match(dockerfile,/runtime_entry\.js/);
  assert.match(dockerfile,/FOXYYA_V12_LINEAGE_PATH/);
  assert.doesNotMatch(dockerfile,/service\.py|run_forward_paper\.py|FOXYYA_V2_CONFIG|foxyya_v2_paper\.sqlite/);
});

test('staging runtime config is isolated, durable, and defaults to Railway-safe host and port',()=>{
  const Entry=require(entryPath);
  assert.deepEqual(Object.keys(Entry).sort(),['LINEAGE_COMPACT_THRESHOLD_BYTES','runtimeConfig','startFromEnvironment'].sort());
  assert.equal(Entry.LINEAGE_COMPACT_THRESHOLD_BYTES,128*1024*1024);
  const cfg=Entry.runtimeConfig({});
  assert.equal(cfg.host,'0.0.0.0');
  assert.equal(cfg.port,8080);
  assert.equal(cfg.lineageFilePath,'/data/foxyya-v12.lineage.jsonl');
  assert.equal(cfg.lineageCompactThresholdBytes,128*1024*1024);
  assert.equal(cfg.researchOnly,true);
  assert.equal(cfg.executionWrite,false);

  const custom=Entry.runtimeConfig({HOST:'127.0.0.1',PORT:'9000',FOXYYA_V12_LINEAGE_PATH:'/tmp/custom.lineage.jsonl'});
  assert.equal(custom.host,'127.0.0.1');
  assert.equal(custom.port,9000);
  assert.equal(custom.lineageFilePath,'/tmp/custom.lineage.jsonl');
  assert.equal(custom.lineageCompactThresholdBytes,128*1024*1024);
});

test('staging runtime rejects invalid deployment configuration before binding a server',()=>{
  const Entry=require(entryPath);
  assert.throws(()=>Entry.runtimeConfig({PORT:'not-a-port'}),/PORT_INVALID/);
  assert.throws(()=>Entry.runtimeConfig({FOXYYA_V12_LINEAGE_PATH:'/data/not-lineage.txt'}),/LINEAGE_JOURNAL_PATH_INVALID/);
});
test('each Research Staging service selects a dedicated Railway config instead of the root Production config',()=>{
  for(const [file,docker,health] of [['v12/staging/railway.toml','v12/staging/Dockerfile','/ready'],['v12/staging/lineage-backup.railway.toml','v12/staging/LineageBackup.Dockerfile','/health']]){
    const config=fs.readFileSync(file,'utf8');
    assert.ok(config.includes(`dockerfilePath = "${docker}"`));
    assert.ok(config.includes(`healthcheckPath = "${health}"`));
    assert.doesNotMatch(config,/dockerfilePath = "Dockerfile"/);
  }
});
