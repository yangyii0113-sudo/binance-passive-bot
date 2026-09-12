'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Lineage=require('../v12/data/source_lineage.js');
const {createDurableSourceLineageStore}=require('../v12/staging/durable_source_lineage_store.js');
const {auditLineageStorage,compactLineageStorage}=require('../v12/staging/lineage_storage_maintenance.js');

function tmpFile(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-lineage-maint-'));
  return {dir,filePath:path.join(dir,'maint.lineage.jsonl')};
}
function sourceRecord({receivedAt,subjectId='TPEX:6488',datasetId='TPEX:quote',value=468}={}){
  const observation={schemaVersion:'foxyya-observation/1',instrumentId:subjectId,market:'TW',field:'price.close',value,unit:'TWD',currency:'TWD',observedAt:receivedAt-100,receivedAt,source:datasetId,status:'SNAPSHOT',confidence:1};
  return Lineage.createSourceObservationLineage({sourceId:'tpex-openapi',datasetId,subjectId,fetchStartedAt:receivedAt-20,receivedAt,bindingVersion:'foxyya-binding/test/1',adapterVersion:'foxyya-adapter/test/1',canonicalSchemaVersion:'foxyya-observation/1',sourceStatus:'AVAILABLE',observations:[observation]});
}
function outputRecord(sources,{asOf=1500,subjectId='TPEX:6488'}={}){
  return Lineage.createResearchOutputLineage({outputType:'TW_RESEARCH',subjectId,asOf,outputSchemaVersion:'foxyya-tw-asset-read-model/1',sourceLineageRefs:sources.map(x=>x.lineageRef),observationRefs:sources.flatMap(x=>x.observationRefs)});
}

test('lineage growth audit reports compressed journal metadata without canonical payloads',()=>{
  const {dir,filePath}=tmpFile();
  try{
    let now=2000;
    const store=createDurableSourceLineageStore({filePath,now:()=>now++});
    const quote=sourceRecord({receivedAt:1000,datasetId:'TPEX:quote',value:468});
    const flow=sourceRecord({receivedAt:1200,datasetId:'TPEX:flow',value:1350000});
    store.recordSource(quote);store.recordSource(flow);store.recordOutput(outputRecord([quote,flow]));
    const fsImpl=Object.create(fs);
    fsImpl.statfsSync=()=>({blocks:1000,bsize:1024,bavail:250,bfree:250});
    const audit=auditLineageStorage({filePath,fsImpl});
    assert.equal(audit.activeBytes,fs.statSync(filePath).size);
    assert.equal(audit.checkpointBytes,0);
    assert.equal(audit.totalBytes,audit.activeBytes);
    assert.equal(audit.eventCount,3);
    assert.equal(audit.sourceCount,2);
    assert.equal(audit.outputCount,1);
    assert.equal(audit.legacyEventCount,0);
    assert.equal(audit.bytesByType.SOURCE_RECORDED>0,true);
    assert.equal(audit.bytesByType.OUTPUT_RECORDED>0,true);
    assert.equal(audit.largestEventBytes>0,true);
    assert.equal(audit.oldestRecordedAt,2000);
    assert.equal(audit.newestRecordedAt,2002);
    assert.equal(audit.filesystem.totalBytes,1024000);
    assert.equal(audit.filesystem.availableBytes,256000);
    assert.equal(audit.filesystem.usedRatio,0.75);
    assert.equal(Object.prototype.hasOwnProperty.call(audit,'observations'),false);
    assert.equal(Object.isFrozen(audit),true);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('bounded compaction retains newest output dependency closure as compressed checkpoint and replay trace',()=>{
  const {dir,filePath}=tmpFile();
  try{
    let now=5000;
    const store=createDurableSourceLineageStore({filePath,now:()=>now++});
    const oldSource=sourceRecord({receivedAt:1000,datasetId:'TPEX:quote',value:460});
    const oldOutput=outputRecord([oldSource],{asOf:1500});
    const newSource=sourceRecord({receivedAt:3000,datasetId:'TPEX:quote',value:468});
    const newOutput=outputRecord([newSource],{asOf:3500});
    store.recordSource(oldSource);store.recordOutput(oldOutput);store.recordSource(newSource);store.recordOutput(newOutput);
    const rawLines=fs.readFileSync(filePath,'utf8').trim().split('\n');
    const newestClosureBytes=rawLines.slice(-2).reduce((sum,line)=>sum+Buffer.byteLength(line,'utf8')+1,0);
    const result=compactLineageStorage({filePath,now:()=>9000,policy:{retainedTargetBytes:newestClosureBytes+32}});
    assert.equal(result.status,'COMPACTED');
    assert.equal(result.after.eventCount,2);
    assert.equal(result.checkpoint.retiredEventCount,2);
    assert.equal(fs.statSync(filePath).size,0);
    const checkpointPath=filePath.replace('.lineage.jsonl','.lineage.checkpoint.jsonl');
    const checkpointLines=fs.readFileSync(checkpointPath,'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(checkpointLines.every(x=>x.schema==='foxyya-lineage-frame/1'),true);
    const restarted=createDurableSourceLineageStore({filePath,now:()=>10000});
    assert.equal(restarted.traceOutput(oldOutput.lineageRef),null);
    const trace=restarted.traceOutput(newOutput.lineageRef);
    assert.equal(trace.output.lineageRef,newOutput.lineageRef);
    assert.deepEqual(trace.sources,[newSource]);
    assert.equal(trace.observations[0].observation.value,468);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('non-enumerable store maintenance rotates oversized active journal and rebuilds live indexes',()=>{
  const {dir,filePath}=tmpFile();
  try{
    let now=7000;
    const store=createDurableSourceLineageStore({filePath,now:()=>now++,policy:{retainedTargetBytes:64*1024*1024,activeRotationBytes:1,compactionTriggerBytes:128*1024*1024,softHighWaterRatio:0.8,criticalHighWaterRatio:0.9,reserveBytes:0}});
    const source=sourceRecord({receivedAt:6000,value:471});
    const output=outputRecord([source],{asOf:6500});
    store.recordSource(source);store.recordOutput(output);
    assert.deepEqual(Object.keys(store),['recordSource','recordOutput','source','output','traceOutput']);
    assert.equal(typeof store.maintenance,'function');
    const result=store.maintenance();
    assert.equal(result.status,'COMPACTED');
    const audit=auditLineageStorage({filePath});
    assert.equal(audit.activeBytes,0);
    assert.equal(audit.checkpointBytes>0,true);
    assert.equal(store.traceOutput(output.lineageRef).output.lineageRef,output.lineageRef);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('critical disk high-water rejects compressed append before write and live state does not advance',()=>{
  const {dir,filePath}=tmpFile();
  try{
    const fsImpl=Object.create(fs);
    let writeCalls=0;
    fsImpl.statfsSync=()=>({blocks:100,bsize:1024,bavail:5,bfree:5});
    fsImpl.writeSync=(...args)=>{writeCalls+=1;return fs.writeSync(...args)};
    const store=createDurableSourceLineageStore({filePath,now:()=>2000,fsImpl,policy:{softHighWaterRatio:0.8,criticalHighWaterRatio:0.9,reserveBytes:0}});
    const source=sourceRecord({receivedAt:1000});
    assert.throws(()=>store.recordSource(source),/LINEAGE_DISK_HIGH_WATER/);
    assert.equal(writeCalls,0);
    assert.equal(store.source(source.lineageRef),null);
    assert.equal(fs.existsSync(filePath),false);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
