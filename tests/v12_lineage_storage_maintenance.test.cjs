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
  const observation={
    schemaVersion:'foxyya-observation/1',instrumentId:subjectId,market:'TW',field:'price.close',
    value,unit:'TWD',currency:'TWD',observedAt:receivedAt-100,receivedAt,
    source:datasetId,status:'SNAPSHOT',confidence:1
  };
  return Lineage.createSourceObservationLineage({
    sourceId:'tpex-openapi',datasetId,subjectId,fetchStartedAt:receivedAt-20,receivedAt,
    bindingVersion:'foxyya-binding/test/1',adapterVersion:'foxyya-adapter/test/1',
    canonicalSchemaVersion:'foxyya-observation/1',sourceStatus:'AVAILABLE',observations:[observation]
  });
}

function outputRecord(sources,{asOf=1500,subjectId='TPEX:6488'}={}){
  return Lineage.createResearchOutputLineage({
    outputType:'TW_RESEARCH',subjectId,asOf,outputSchemaVersion:'foxyya-tw-asset-read-model/1',
    sourceLineageRefs:sources.map(x=>x.lineageRef),observationRefs:sources.flatMap(x=>x.observationRefs)
  });
}

test('lineage growth audit reports bounded metadata without canonical payloads',()=>{
  const {dir,filePath}=tmpFile();
  try{
    let now=2000;
    const store=createDurableSourceLineageStore({filePath,now:()=>now++});
    const quote=sourceRecord({receivedAt:1000,datasetId:'TPEX:quote',value:468});
    const flow=sourceRecord({receivedAt:1200,datasetId:'TPEX:flow',value:1350000});
    store.recordSource(quote);
    store.recordSource(flow);
    store.recordOutput(outputRecord([quote,flow]));

    assert.equal(typeof auditLineageStorage,'function');
    const fsImpl=Object.create(fs);
    fsImpl.statfsSync=()=>({blocks:1000,bsize:1024,bavail:250,bfree:250});
    const audit=auditLineageStorage({filePath,fsImpl});

    assert.equal(audit.activeBytes,fs.statSync(filePath).size);
    assert.equal(audit.checkpointBytes,0);
    assert.equal(audit.totalBytes,audit.activeBytes);
    assert.equal(audit.eventCount,3);
    assert.equal(audit.sourceCount,2);
    assert.equal(audit.outputCount,1);
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
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('bounded compaction retains the newest output dependency closure and replay trace',()=>{
  const {dir,filePath}=tmpFile();
  try{
    let now=5000;
    const store=createDurableSourceLineageStore({filePath,now:()=>now++});
    const oldSource=sourceRecord({receivedAt:1000,datasetId:'TPEX:quote',value:460});
    const oldOutput=outputRecord([oldSource],{asOf:1500});
    const newSource=sourceRecord({receivedAt:3000,datasetId:'TPEX:quote',value:468});
    const newOutput=outputRecord([newSource],{asOf:3500});
    store.recordSource(oldSource);
    store.recordOutput(oldOutput);
    store.recordSource(newSource);
    store.recordOutput(newOutput);

    assert.equal(typeof compactLineageStorage,'function');
    const rawLines=fs.readFileSync(filePath,'utf8').trim().split('\n');
    const newestClosureBytes=rawLines.slice(-2).reduce((sum,line)=>sum+Buffer.byteLength(line,'utf8')+1,0);
    const result=compactLineageStorage({
      filePath,
      now:()=>9000,
      policy:{retainedTargetBytes:newestClosureBytes+32}
    });
    assert.equal(result.status,'COMPACTED');
    assert.equal(result.after.eventCount,2);
    assert.equal(result.checkpoint.retiredEventCount,2);

    const restarted=createDurableSourceLineageStore({filePath,now:()=>10000});
    assert.equal(restarted.traceOutput(oldOutput.lineageRef),null);
    const trace=restarted.traceOutput(newOutput.lineageRef);
    assert.equal(trace.output.lineageRef,newOutput.lineageRef);
    assert.deepEqual(trace.sources,[newSource]);
    assert.equal(trace.observations[0].observation.value,468);
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
