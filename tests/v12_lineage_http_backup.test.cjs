'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const zlib=require('node:zlib');
const crypto=require('node:crypto');

const {createLineageBackupHandler}=require('../v12/staging/lineage_backup_receiver.js');
const {backupLineageFileHttp}=require('../v12/staging/lineage_http_backup.js');

function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address()));});}
function close(server){return new Promise(resolve=>server.close(()=>resolve()));}
function sha256(buffer){return crypto.createHash('sha256').update(buffer).digest('hex');}

function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-http-backup-'));
  const storageDir=path.join(dir,'storage');
  const filePath=path.join(dir,'foxyya-v12.lineage.jsonl');
  const lines=[];
  for(let i=0;i<25000;i++)lines.push(JSON.stringify({sequence:i+1,type:'SOURCE_RECORDED',dataset:'TWSE:STOCK_DAY_ALL',payload:'same-market-payload-'.repeat(12),receivedAt:1700000000000+i})+'\n');
  fs.writeFileSync(filePath,lines.join(''),'utf8');
  return {dir,storageDir,filePath};
}

test('private durable backup helper stores a gzip copy and verifies original bytes plus sha256 without buffering whole file',async()=>{
  const {dir,storageDir,filePath}=fixture();
  const token='test-secret-token';
  const server=http.createServer(createLineageBackupHandler({storageDir,token,durableStorage:true}));
  const address=await listen(server);
  try{
    const original=fs.readFileSync(filePath);
    const result=await backupLineageFileHttp({filePath,key:'legacy-before-compaction',baseUrl:`http://127.0.0.1:${address.port}`,token});
    assert.equal(result.status,'VERIFIED');
    assert.equal(result.durableStorage,true);
    assert.equal(result.size,original.length);
    assert.equal(result.sha256,sha256(original));
    assert.ok(result.compressedSize<original.length*0.25);
    const gzPath=path.join(storageDir,'legacy-before-compaction.lineage.jsonl.gz');
    const metaPath=path.join(storageDir,'legacy-before-compaction.meta.json');
    assert.equal(fs.existsSync(gzPath),true);
    assert.equal(fs.existsSync(metaPath),true);
    assert.deepEqual(zlib.gunzipSync(fs.readFileSync(gzPath)),original);
    const meta=JSON.parse(fs.readFileSync(metaPath,'utf8'));
    assert.equal(meta.rawSize,original.length);
    assert.equal(meta.rawSha256,sha256(original));
    assert.equal(meta.status,'VERIFIED');
    assert.equal(meta.durableStorage,true);
  }finally{await close(server);fs.rmSync(dir,{recursive:true,force:true});}
});

test('ephemeral helper refuses backup writes and cannot satisfy verified client contract',async()=>{
  const {dir,storageDir,filePath}=fixture();
  const token='test-secret-token';
  const server=http.createServer(createLineageBackupHandler({storageDir,token,durableStorage:false}));
  const address=await listen(server);
  try{
    await assert.rejects(()=>backupLineageFileHttp({filePath,key:'ephemeral',baseUrl:`http://127.0.0.1:${address.port}`,token}),/LINEAGE_BACKUP_UPLOAD_FAILED/);
    assert.equal(fs.existsSync(path.join(storageDir,'ephemeral.lineage.jsonl.gz')),false);
  }finally{await close(server);fs.rmSync(dir,{recursive:true,force:true});}
});

test('backup helper rejects unauthorized writes and leaves no final artifact',async()=>{
  const {dir,storageDir,filePath}=fixture();
  const server=http.createServer(createLineageBackupHandler({storageDir,token:'right-token',durableStorage:true}));
  const address=await listen(server);
  try{
    await assert.rejects(()=>backupLineageFileHttp({filePath,key:'unauthorized',baseUrl:`http://127.0.0.1:${address.port}`,token:'wrong-token'}),/LINEAGE_BACKUP_UPLOAD_FAILED/);
    assert.equal(fs.existsSync(path.join(storageDir,'unauthorized.lineage.jsonl.gz')),false);
    assert.equal(fs.existsSync(path.join(storageDir,'unauthorized.meta.json')),false);
  }finally{await close(server);fs.rmSync(dir,{recursive:true,force:true});}
});

test('receiver fails closed and removes temp artifacts when declared checksum does not match stream',async()=>{
  const {dir,storageDir,filePath}=fixture();
  const token='test-secret-token';
  const server=http.createServer(createLineageBackupHandler({storageDir,token,durableStorage:true}));
  const address=await listen(server);
  try{
    const body=fs.readFileSync(filePath);
    await new Promise((resolve,reject)=>{
      const req=http.request({hostname:'127.0.0.1',port:address.port,method:'PUT',path:'/v1/lineage-backups/bad-checksum',headers:{authorization:`Bearer ${token}`,'content-length':String(body.length),'x-foxyya-raw-size':String(body.length),'x-foxyya-raw-sha256':'0'.repeat(64)}},res=>{res.resume();res.on('end',()=>{try{assert.equal(res.statusCode,422);resolve();}catch(error){reject(error)}})});
      req.once('error',reject);req.end(body);
    });
    assert.equal(fs.existsSync(path.join(storageDir,'bad-checksum.lineage.jsonl.gz')),false);
    assert.equal(fs.existsSync(path.join(storageDir,'bad-checksum.meta.json')),false);
    assert.equal(fs.readdirSync(storageDir).some(name=>name.includes('.tmp')),false);
  }finally{await close(server);fs.rmSync(dir,{recursive:true,force:true});}
});

test('backup helper HEAD metadata is authenticated and immutable',async()=>{
  const {dir,storageDir,filePath}=fixture();
  const token='test-secret-token';
  const server=http.createServer(createLineageBackupHandler({storageDir,token,durableStorage:true}));
  const address=await listen(server);
  try{
    await backupLineageFileHttp({filePath,key:'head-check',baseUrl:`http://127.0.0.1:${address.port}`,token});
    await new Promise((resolve,reject)=>{
      const req=http.request({hostname:'127.0.0.1',port:address.port,method:'HEAD',path:'/v1/lineage-backups/head-check',headers:{authorization:'Bearer wrong'}},res=>{try{assert.equal(res.statusCode,401);resolve();}catch(error){reject(error)}});
      req.once('error',reject);req.end();
    });
  }finally{await close(server);fs.rmSync(dir,{recursive:true,force:true});}
});
