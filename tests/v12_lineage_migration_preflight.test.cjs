'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const Lineage=require('../v12/data/source_lineage.js');
const {prepareDurableLineageStore}=require('../v12/staging/lineage_migration_preflight.js');

function stableValue(value){if(Array.isArray(value))return value.map(stableValue);if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).sort())out[key]=stableValue(value[key]);return out;}return value;}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');}
function legacyEvent({sequence,type,recordedAt,record}){const base={schema:'foxyya-lineage-event/1',sequence,type,recordedAt,record};return {...base,checksum:digest(base)};}
function seedLegacy(filePath){
  const receivedAt=1100;
  const observation=Object.freeze({schemaVersion:'foxyya-observation/1',instrumentId:'TWSE:2330',market:'TW',field:'price.close',value:1250,unit:'TWD',currency:'TWD',observedAt:1000,receivedAt,source:'TWSE:STOCK_DAY_ALL:'+('x'.repeat(200000)),status:'SNAPSHOT',confidence:1});
  const source=Lineage.createSourceObservationLineage({sourceId:'twse-openapi',datasetId:'TWSE:STOCK_DAY_ALL',subjectId:'TWSE:2330',fetchStartedAt:1050,receivedAt,bindingVersion:'binding/1',adapterVersion:'adapter/1',canonicalSchemaVersion:'foxyya-observation/1',sourceStatus:'AVAILABLE',observations:[observation]});
  const output=Lineage.createResearchOutputLineage({outputType:'TW_ASSET_RESEARCH',subjectId:'TWSE:2330',asOf:1500,outputSchemaVersion:'foxyya-tw-asset-read-model/1',sourceLineageRefs:[source.lineageRef],observationRefs:[...source.observationRefs]});
  fs.writeFileSync(filePath,JSON.stringify(legacyEvent({sequence:1,type:'SOURCE_RECORDED',recordedAt:5000,record:source}))+'\n'+JSON.stringify(legacyEvent({sequence:2,type:'OUTPUT_RECORDED',recordedAt:5001,record:output}))+'\n');
  return {source,output};
}
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-preflight-'));return {dir,filePath:path.join(dir,'foxyya-v12.lineage.jsonl'),scratch:fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-preflight-scratch-'))};}
const backupConfig=Object.freeze({endpoint:'https://example.invalid',region:'test-1',bucket:'backup',accessKeyId:'AKID',secretAccessKey:'SECRET'});

test('large legacy migration refuses to mutate journal when verified backup config is missing',async()=>{
  const {dir,filePath,scratch}=setup();
  try{
    seedLegacy(filePath);
    const before=fs.readFileSync(filePath);
    await assert.rejects(()=>prepareDurableLineageStore({filePath,now:()=>6000,compactThresholdBytes:1,scratchDir:scratch}),/LINEAGE_BACKUP_REQUIRED/);
    assert.deepEqual(fs.readFileSync(filePath),before);
  }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(scratch,{recursive:true,force:true});}
});

test('failed or unverified bucket backup leaves legacy journal byte-identical',async()=>{
  const {dir,filePath,scratch}=setup();
  try{
    seedLegacy(filePath);
    const before=fs.readFileSync(filePath);
    await assert.rejects(()=>prepareDurableLineageStore({
      filePath,now:()=>6000,compactThresholdBytes:1,scratchDir:scratch,backupConfig,
      backupLineageFileImpl:async()=>({status:'UPLOADED',key:'bad',size:before.length,sha256:'0'.repeat(64)})
    }),/LINEAGE_BACKUP_VERIFY_FAILED/);
    assert.deepEqual(fs.readFileSync(filePath),before);
  }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(scratch,{recursive:true,force:true});}
});

test('verified backup gates scratch compaction and preserves exact lineage trace',async()=>{
  const {dir,filePath,scratch}=setup();
  try{
    const {source,output}=seedLegacy(filePath);
    const before=fs.statSync(filePath);
    let backupSawLegacy=false;
    const prepared=await prepareDurableLineageStore({
      filePath,now:()=>6000,compactThresholdBytes:1,scratchDir:scratch,backupConfig,
      backupLineageFileImpl:async args=>{
        backupSawLegacy=JSON.parse(fs.readFileSync(args.filePath,'utf8').split('\n')[0]).schema==='foxyya-lineage-event/1';
        return {status:'VERIFIED',key:args.key,size:before.size,sha256:'a'.repeat(64),etag:'"etag"'};
      }
    });
    assert.equal(backupSawLegacy,true,'backup must happen before persistent journal replacement');
    assert.equal(prepared.migration.status,'COMPACTED');
    assert.equal(prepared.migration.backup.status,'VERIFIED');
    assert.equal(JSON.parse(fs.readFileSync(filePath,'utf8').split('\n')[0]).schema,'foxyya-lineage-frame/1');
    assert.ok(fs.statSync(filePath).size<before.size);
    assert.deepEqual(prepared.store.source(source.lineageRef),source);
    assert.deepEqual(prepared.store.output(output.lineageRef),output);
    assert.deepEqual(prepared.store.traceOutput(output.lineageRef).sources,[source]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(scratch,{recursive:true,force:true});}
});

test('journal changing during backup is rejected before compaction',async()=>{
  const {dir,filePath,scratch}=setup();
  try{
    seedLegacy(filePath);
    await assert.rejects(()=>prepareDurableLineageStore({
      filePath,now:()=>6000,compactThresholdBytes:1,scratchDir:scratch,backupConfig,
      backupLineageFileImpl:async args=>{
        fs.appendFileSync(args.filePath,' ');
        const stat=fs.statSync(args.filePath);
        return {status:'VERIFIED',key:args.key,size:stat.size-1,sha256:'b'.repeat(64),etag:'"etag"'};
      }
    }),/LINEAGE_BACKUP_SOURCE_CHANGED/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(scratch,{recursive:true,force:true});}
});
