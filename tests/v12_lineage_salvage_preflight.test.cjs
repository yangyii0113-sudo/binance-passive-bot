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
function fixture(){
  const observation={schemaVersion:'foxyya-observation/1',instrumentId:'TWSE:2330',market:'TW',field:'price.close',value:1250,unit:'TWD',currency:'TWD',observedAt:1000,receivedAt:1100,source:'TWSE:STOCK_DAY_ALL',status:'SNAPSHOT',confidence:1};
  const source=Lineage.createSourceObservationLineage({sourceId:'twse-openapi',datasetId:'TWSE:STOCK_DAY_ALL',subjectId:'TWSE:2330',fetchStartedAt:1050,receivedAt:1100,bindingVersion:'binding/1',adapterVersion:'adapter/1',canonicalSchemaVersion:'foxyya-observation/1',sourceStatus:'AVAILABLE',observations:[observation]});
  const output=Lineage.createResearchOutputLineage({outputType:'TW_ASSET_RESEARCH',subjectId:'TWSE:2330',asOf:1500,outputSchemaVersion:'foxyya-tw-asset-read-model/1',sourceLineageRefs:[source.lineageRef],observationRefs:[...source.observationRefs]});
  return {source,output};
}
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-salvage-preflight-'));const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-salvage-preflight-scratch-'));return {dir,scratch,filePath:path.join(dir,'foxyya-v12.lineage.jsonl')};}
const httpBackupConfig=Object.freeze({baseUrl:'http://backup-helper.internal',token:'secret'});

function verifiedBackup(before){return async args=>({status:'VERIFIED',key:args.key,size:before.size,sha256:'a'.repeat(64),compressedSize:4096,etag:'"backup"'});}

test('verified backup allows corrupt legacy journal to salvage on scratch, compact, then replace persistent journal',async()=>{
  const {dir,scratch,filePath}=setup();
  try{
    const {source,output}=fixture();
    const e1=legacyEvent({sequence:1,type:'SOURCE_RECORDED',recordedAt:5000,record:source});
    const e2=legacyEvent({sequence:2,type:'OUTPUT_RECORDED',recordedAt:5001,record:output});
    const full2=JSON.stringify(e2);
    fs.writeFileSync(filePath,JSON.stringify(e1)+'\n'+full2.slice(0,Math.floor(full2.length/3))+full2+'\n');
    const before=fs.statSync(filePath);
    const original=fs.readFileSync(filePath);
    let backupSawOriginal=false;
    const prepared=await prepareDurableLineageStore({
      filePath,now:()=>6000,compactThresholdBytes:1,scratchDir:scratch,httpBackupConfig,
      backupLineageFileHttpImpl:async args=>{
        backupSawOriginal=fs.readFileSync(args.filePath).equals(original);
        return verifiedBackup(before)(args);
      }
    });
    assert.equal(backupSawOriginal,true);
    assert.equal(prepared.migration.status,'SALVAGED_COMPACTED');
    assert.equal(prepared.migration.backupChannel,'HTTP_HELPER');
    assert.equal(prepared.migration.salvage.recoveredCorruptLines,1);
    assert.equal(prepared.migration.salvage.droppedTailBytes,0);
    const first=JSON.parse(fs.readFileSync(filePath,'utf8').split('\n')[0]);
    assert.equal(first.schema,'foxyya-lineage-frame/1');
    assert.ok(fs.statSync(filePath).size<before.size);
    assert.deepEqual(prepared.store.source(source.lineageRef),source);
    assert.deepEqual(prepared.store.output(output.lineageRef),output);
    assert.deepEqual(prepared.store.traceOutput(output.lineageRef).sources,[source]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(scratch,{recursive:true,force:true});}
});

test('ambiguous salvage failure leaves persistent journal byte-identical after verified backup',async()=>{
  const {dir,scratch,filePath}=setup();
  try{
    const {source,output}=fixture();
    const e1=legacyEvent({sequence:1,type:'SOURCE_RECORDED',recordedAt:5000,record:source});
    const a=legacyEvent({sequence:2,type:'OUTPUT_RECORDED',recordedAt:5001,record:output});
    const b=legacyEvent({sequence:2,type:'OUTPUT_RECORDED',recordedAt:5002,record:output});
    fs.writeFileSync(filePath,JSON.stringify(e1)+'\n'+JSON.stringify(a)+JSON.stringify(b)+'\n');
    const original=fs.readFileSync(filePath);
    const before=fs.statSync(filePath);
    await assert.rejects(()=>prepareDurableLineageStore({
      filePath,now:()=>6000,compactThresholdBytes:1,scratchDir:scratch,httpBackupConfig,
      backupLineageFileHttpImpl:verifiedBackup(before)
    }),/LINEAGE_SALVAGE_AMBIGUOUS/);
    assert.deepEqual(fs.readFileSync(filePath),original);
  }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(scratch,{recursive:true,force:true});}
});
