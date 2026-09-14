'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const Lineage=require('../v12/data/source_lineage.js');
const {createDurableSourceLineageStore}=require('../v12/staging/durable_source_lineage_store.js');
const {salvageLegacyJournal}=require('../v12/staging/lineage_legacy_salvage.js');

function stableValue(value){if(Array.isArray(value))return value.map(stableValue);if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).sort())out[key]=stableValue(value[key]);return out;}return value;}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');}
function legacyEvent({sequence,type,recordedAt,record}){const base={schema:'foxyya-lineage-event/1',sequence,type,recordedAt,record};return {...base,checksum:digest(base)};}
function fixture(){
  const observation={schemaVersion:'foxyya-observation/1',instrumentId:'TWSE:2330',market:'TW',field:'price.close',value:1250,unit:'TWD',currency:'TWD',observedAt:1000,receivedAt:1100,source:'TWSE:STOCK_DAY_ALL',status:'SNAPSHOT',confidence:1};
  const source=Lineage.createSourceObservationLineage({sourceId:'twse-openapi',datasetId:'TWSE:STOCK_DAY_ALL',subjectId:'TWSE:2330',fetchStartedAt:1050,receivedAt:1100,bindingVersion:'binding/1',adapterVersion:'adapter/1',canonicalSchemaVersion:'foxyya-observation/1',sourceStatus:'AVAILABLE',observations:[observation]});
  const output=Lineage.createResearchOutputLineage({outputType:'TW_ASSET_RESEARCH',subjectId:'TWSE:2330',asOf:1500,outputSchemaVersion:'foxyya-tw-asset-read-model/1',sourceLineageRefs:[source.lineageRef],observationRefs:[...source.observationRefs]});
  return {source,output};
}
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-lineage-salvage-'));const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-lineage-salvage-scratch-'));return {dir,scratch,filePath:path.join(dir,'foxyya-v12.lineage.jsonl')};}

test('salvage recovers a valid retry appended after a partial write for the same sequence',()=>{
  const {dir,scratch,filePath}=setup();
  try{
    const {source,output}=fixture();
    const e1=legacyEvent({sequence:1,type:'SOURCE_RECORDED',recordedAt:5000,record:source});
    const e2=legacyEvent({sequence:2,type:'OUTPUT_RECORDED',recordedAt:5001,record:output});
    const full2=JSON.stringify(e2);
    fs.writeFileSync(filePath,JSON.stringify(e1)+'\n'+full2.slice(0,Math.floor(full2.length/3))+full2+'\n');
    const before=fs.readFileSync(filePath);
    const result=salvageLegacyJournal({filePath,scratchDir:scratch,externalBackupVerified:true,now:()=>6000});
    assert.equal(result.status,'SALVAGED');
    assert.equal(result.eventCount,2);
    assert.equal(result.recoveredCorruptLines,1);
    assert.equal(result.droppedTailBytes,0);
    assert.deepEqual(fs.readFileSync(filePath),before,'salvage must not mutate source journal by itself');
    const store=createDurableSourceLineageStore({filePath:result.scratchFilePath,now:()=>6000});
    assert.deepEqual(store.source(source.lineageRef),source);
    assert.deepEqual(store.output(output.lineageRef),output);
    assert.deepEqual(store.traceOutput(output.lineageRef).sources,[source]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(scratch,{recursive:true,force:true});}
});

test('salvage may drop only an incomplete final tail that never committed a sequence',()=>{
  const {dir,scratch,filePath}=setup();
  try{
    const {source,output}=fixture();
    const e1=legacyEvent({sequence:1,type:'SOURCE_RECORDED',recordedAt:5000,record:source});
    const e2=JSON.stringify(legacyEvent({sequence:2,type:'OUTPUT_RECORDED',recordedAt:5001,record:output}));
    fs.writeFileSync(filePath,JSON.stringify(e1)+'\n'+e2.slice(0,Math.floor(e2.length/2)));
    const result=salvageLegacyJournal({filePath,scratchDir:scratch,externalBackupVerified:true,now:()=>6000});
    assert.equal(result.eventCount,1);
    assert.ok(result.droppedTailBytes>0);
    const store=createDurableSourceLineageStore({filePath:result.scratchFilePath,now:()=>6000});
    assert.deepEqual(store.source(source.lineageRef),source);
    assert.equal(store.output(output.lineageRef),null);
  }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(scratch,{recursive:true,force:true});}
});

test('salvage refuses ambiguous duplicate complete events for one sequence',()=>{
  const {dir,scratch,filePath}=setup();
  try{
    const {source,output}=fixture();
    const e1=legacyEvent({sequence:1,type:'SOURCE_RECORDED',recordedAt:5000,record:source});
    const a=legacyEvent({sequence:2,type:'OUTPUT_RECORDED',recordedAt:5001,record:output});
    const b=legacyEvent({sequence:2,type:'OUTPUT_RECORDED',recordedAt:5002,record:output});
    fs.writeFileSync(filePath,JSON.stringify(e1)+'\n'+JSON.stringify(a)+JSON.stringify(b)+'\n');
    const before=fs.readFileSync(filePath);
    assert.throws(()=>salvageLegacyJournal({filePath,scratchDir:scratch,externalBackupVerified:true,now:()=>6000}),/LINEAGE_SALVAGE_AMBIGUOUS/);
    assert.deepEqual(fs.readFileSync(filePath),before);
  }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(scratch,{recursive:true,force:true});}
});

test('salvage is forbidden without an independently verified external backup',()=>{
  const {dir,scratch,filePath}=setup();
  try{
    const {source}=fixture();
    const e1=legacyEvent({sequence:1,type:'SOURCE_RECORDED',recordedAt:5000,record:source});
    fs.writeFileSync(filePath,JSON.stringify(e1)+'\n');
    assert.throws(()=>salvageLegacyJournal({filePath,scratchDir:scratch,externalBackupVerified:false,now:()=>6000}),/LINEAGE_BACKUP_REQUIRED/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(scratch,{recursive:true,force:true});}
});
