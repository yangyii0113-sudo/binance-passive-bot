'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');

const dockerfile='v12/staging/LineageBackup.Dockerfile';
const Runtime=require('../v12/staging/lineage_backup_runtime.js');

function get(port,pathName,headers={}){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,method:'GET',path:pathName,headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString('utf8')}));});req.once('error',reject);req.end();});}

test('backup helper has a dedicated Node image and never includes execution runtime',()=>{
  assert.equal(fs.existsSync(dockerfile),true);
  const text=fs.readFileSync(dockerfile,'utf8');
  assert.match(text,/FROM node:22/);
  assert.match(text,/lineage_backup_runtime\.js/);
  assert.doesNotMatch(text,/service\.py|run_forward_paper\.py|foxyya_v2_paper\.sqlite|REAL_ORDER_LOCK/);
});

test('backup helper runtime requires explicit token and keeps storage on its own mount',()=>{
  assert.deepEqual(Object.keys(Runtime).sort(),['runtimeConfig','startBackupRuntime'].sort());
  assert.throws(()=>Runtime.runtimeConfig({}),/LINEAGE_BACKUP_TOKEN_REQUIRED/);
  const cfg=Runtime.runtimeConfig({FOXYYA_V12_BACKUP_TOKEN:'secret',PORT:'0'});
  assert.equal(cfg.host,'0.0.0.0');
  assert.equal(cfg.port,0);
  assert.equal(cfg.storageDir,'/backup');
  assert.equal(cfg.token,'secret');
  assert.equal(cfg.researchOnly,true);
  assert.equal(cfg.executionWrite,false);
});

test('backup helper exposes health but no research or execution API',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-backup-runtime-'));
  const runtime=await Runtime.startBackupRuntime({HOST:'127.0.0.1',PORT:'0',FOXYYA_V12_BACKUP_TOKEN:'secret',FOXYYA_V12_BACKUP_STORAGE_DIR:dir});
  try{
    const health=await get(runtime.address.port,'/health');
    assert.equal(health.status,200);
    assert.match(health.body,/"service":"foxyya-v12-lineage-backup"/);
    const home=await get(runtime.address.port,'/v12/api/home');
    assert.equal(home.status,404);
    const order=await get(runtime.address.port,'/api/order');
    assert.equal(order.status,404);
  }finally{await runtime.close();fs.rmSync(dir,{recursive:true,force:true});}
});
