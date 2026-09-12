'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');

const Backup=require('../v12/staging/lineage_bucket_backup.js');

function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address()));});}
function close(server){return new Promise(resolve=>server.close(()=>resolve()));}
function sha256File(filePath){
  const hash=crypto.createHash('sha256');
  const fd=fs.openSync(filePath,'r');
  try{
    const buf=Buffer.alloc(64*1024);
    let pos=0;
    while(true){const n=fs.readSync(fd,buf,0,buf.length,pos);if(!n)break;hash.update(buf.subarray(0,n));pos+=n;}
  }finally{fs.closeSync(fd)}
  return hash.digest('hex');
}

test('lineage bucket backup streams file with SigV4 and verifies size plus sha256 metadata by HEAD',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-lineage-bucket-'));
  const filePath=path.join(dir,'large.lineage.jsonl');
  const chunk=crypto.randomBytes(1024*1024);
  fs.writeFileSync(filePath,Buffer.concat([chunk,chunk,chunk]));
  const expectedSize=fs.statSync(filePath).size;
  const expectedSha=sha256File(filePath);
  let stored=null;
  const server=http.createServer((req,res)=>{
    assert.match(String(req.headers.authorization||''),/^AWS4-HMAC-SHA256 /);
    assert.equal(req.headers['x-amz-content-sha256'],'UNSIGNED-PAYLOAD');
    if(req.method==='PUT'){
      const pieces=[];
      req.on('data',piece=>pieces.push(piece));
      req.on('end',()=>{
        const body=Buffer.concat(pieces);
        stored={body,sha:req.headers['x-amz-meta-sha256'],checksum:req.headers['x-amz-checksum-sha256']};
        assert.equal(body.length,expectedSize);
        assert.equal(stored.sha,expectedSha);
        assert.equal(stored.checksum,Buffer.from(expectedSha,'hex').toString('base64'));
        res.writeHead(200,{etag:'"test-etag"'});res.end();
      });
      return;
    }
    if(req.method==='HEAD'){
      assert.ok(stored);
      res.writeHead(200,{
        'content-length':String(stored.body.length),
        'x-amz-meta-sha256':stored.sha,
        'x-amz-checksum-sha256':stored.checksum,
        etag:'"test-etag"'
      });res.end();return;
    }
    res.writeHead(405);res.end();
  });
  const address=await listen(server);
  try{
    const result=await Backup.backupLineageFile({
      filePath,
      key:'lineage-backups/test.lineage.jsonl',
      endpoint:`http://127.0.0.1:${address.port}`,
      region:'test-1',bucket:'backup-bucket',accessKeyId:'AKID',secretAccessKey:'SECRET',
      now:()=>Date.parse('2026-09-12T10:00:00Z')
    });
    assert.deepEqual(result,{
      status:'VERIFIED',key:'lineage-backups/test.lineage.jsonl',size:expectedSize,sha256:expectedSha,etag:'"test-etag"'
    });
    assert.deepEqual(stored.body,fs.readFileSync(filePath));
  }finally{await close(server);fs.rmSync(dir,{recursive:true,force:true});}
});

test('lineage bucket backup fails closed when HEAD verification does not match uploaded source',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-lineage-bucket-bad-'));
  const filePath=path.join(dir,'bad.lineage.jsonl');
  fs.writeFileSync(filePath,'important lineage\n','utf8');
  const server=http.createServer((req,res)=>{
    if(req.method==='PUT'){req.resume();req.on('end',()=>{res.writeHead(200,{etag:'"ok"'});res.end();});return;}
    if(req.method==='HEAD'){res.writeHead(200,{'content-length':'1','x-amz-meta-sha256':'0'.repeat(64)});res.end();return;}
    res.writeHead(405);res.end();
  });
  const address=await listen(server);
  try{
    await assert.rejects(()=>Backup.backupLineageFile({
      filePath,key:'lineage-backups/bad.lineage.jsonl',endpoint:`http://127.0.0.1:${address.port}`,
      region:'test-1',bucket:'backup-bucket',accessKeyId:'AKID',secretAccessKey:'SECRET',now:()=>Date.parse('2026-09-12T10:00:00Z')
    }),/LINEAGE_BACKUP_VERIFY_FAILED/);
  }finally{await close(server);fs.rmSync(dir,{recursive:true,force:true});}
});

test('lineage bucket backup validates config before any file mutation or request',async()=>{
  await assert.rejects(()=>Backup.backupLineageFile({filePath:'/tmp/missing.lineage.jsonl'}),/LINEAGE_BACKUP_CONFIG_INVALID/);
});
