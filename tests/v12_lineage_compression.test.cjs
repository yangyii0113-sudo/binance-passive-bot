'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const Lineage=require('../v12/data/source_lineage.js');
const {createDurableSourceLineageStore}=require('../v12/staging/durable_source_lineage_store.js');

function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==='object'){
    const out={};
    for(const key of Object.keys(value).sort())out[key]=stableValue(value[key]);
    return out;
  }
  return value;
}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');}
function legacyEvent({sequence,type,recordedAt,record}){
  const base={schema:'foxyya-lineage-event/1',sequence,type,recordedAt,record};
  return {...base,checksum:digest(base)};
}
function fixtureRecords(){
  const receivedAt=1100;
  const observation=Object.freeze({
    schemaVersion:'foxyya-observation/1',instrumentId:'NASDAQ:NVDA',market:'US',field:'fundamental.revenue',
    value:30000000000,unit:'USD',currency:'USD',observedAt:1000,receivedAt,
    source:'SEC:'+('x'.repeat(250000)),status:'SNAPSHOT',confidence:1
  });
  const source=Lineage.createSourceObservationLineage({
    sourceId:'sec-edgar',datasetId:'SEC:companyfacts',subjectId:'NASDAQ:NVDA',
    fetchStartedAt:1050,receivedAt,bindingVersion:'foxyya-binding/sec-company-fact/1',
    adapterVersion:'foxyya-adapter/sec-edgar/1',canonicalSchemaVersion:'foxyya-observation/1',
    sourceStatus:'AVAILABLE',observations:[observation]
  });
  const output=Lineage.createResearchOutputLineage({
    outputType:'US_RESEARCH',subjectId:'NASDAQ:NVDA',asOf:1500,
    outputSchemaVersion:'foxyya-us-asset-read-model/1',sourceLineageRefs:[source.lineageRef],
    observationRefs:[...source.observationRefs]
  });
  return {source,output};
}
function tmp(name){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-lineage-compress-'));
  return {dir,filePath:path.join(dir,name)};
}

test('new durable lineage appends use compressed frames and remain restart-readable',()=>{
  const {dir,filePath}=tmp('compressed.lineage.jsonl');
  try{
    const {source,output}=fixtureRecords();
    const store=createDurableSourceLineageStore({filePath,now:()=>5000});
    store.recordSource(source);
    store.recordOutput(output);
    const lines=fs.readFileSync(filePath,'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(lines.length,2);
    assert.equal(lines[0].schema,'foxyya-lineage-frame/1');
    assert.equal(lines[0].encoding,'deflate-raw-base64');
    assert.equal(lines[0].sequence,1);
    assert.equal(typeof lines[0].payload,'string');
    assert.equal(lines[1].schema,'foxyya-lineage-frame/1');
    const plainBytes=Buffer.byteLength(JSON.stringify(legacyEvent({sequence:1,type:'SOURCE_RECORDED',recordedAt:5000,record:source}))+'\n');
    assert.ok(fs.statSync(filePath).size<plainBytes*0.25,'compressed journal should materially reduce repetitive payload size');
    const restarted=createDurableSourceLineageStore({filePath,now:()=>6000});
    assert.deepEqual(restarted.source(source.lineageRef),source);
    assert.deepEqual(restarted.output(output.lineageRef),output);
    assert.deepEqual(restarted.traceOutput(output.lineageRef).sources,[source]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('legacy plain journal above compaction threshold is atomically rewritten as compressed frames without changing trace',()=>{
  const {dir,filePath}=tmp('legacy.lineage.jsonl');
  try{
    const {source,output}=fixtureRecords();
    const first=legacyEvent({sequence:1,type:'SOURCE_RECORDED',recordedAt:5000,record:source});
    const second=legacyEvent({sequence:2,type:'OUTPUT_RECORDED',recordedAt:5001,record:output});
    fs.writeFileSync(filePath,JSON.stringify(first)+'\n'+JSON.stringify(second)+'\n','utf8');
    const before=fs.statSync(filePath).size;
    const store=createDurableSourceLineageStore({filePath,now:()=>6000,compactThresholdBytes:1});
    const after=fs.statSync(filePath).size;
    assert.ok(after<before*0.25,'legacy compaction should reclaim repetitive JSON payload space');
    const compacted=fs.readFileSync(filePath,'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(compacted.length,2);
    assert.equal(compacted[0].schema,'foxyya-lineage-frame/1');
    assert.equal(compacted[0].sequence,1);
    assert.equal(compacted[1].sequence,2);
    assert.deepEqual(store.source(source.lineageRef),source);
    assert.deepEqual(store.output(output.lineageRef),output);
    const trace=store.traceOutput(output.lineageRef);
    assert.deepEqual(trace.output,output);
    assert.deepEqual(trace.sources,[source]);
    assert.deepEqual(trace.observations[0].observation,source.observations[0]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
