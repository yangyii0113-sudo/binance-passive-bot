'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Lineage=require('../v12/data/source_lineage.js');
const {createDurableSourceLineageStore}=require('../v12/staging/durable_source_lineage_store.js');

function fixture(filePath){
  const store=createDurableSourceLineageStore({filePath,now:()=>5000});
  const observation=Object.freeze({
    schemaVersion:'foxyya-observation/1',
    instrumentId:'NASDAQ:NVDA',market:'US',field:'fundamental.revenue',value:30000000000,
    unit:'USD',currency:'USD',observedAt:1000,receivedAt:1100,
    source:'SEC:'+('x'.repeat(90000)),status:'SNAPSHOT',confidence:1
  });
  const source=Lineage.createSourceObservationLineage({
    sourceId:'sec-edgar',datasetId:'SEC:companyfacts',subjectId:'NASDAQ:NVDA',
    fetchStartedAt:1050,receivedAt:1100,bindingVersion:'foxyya-binding/sec-company-fact/1',
    adapterVersion:'foxyya-adapter/sec-edgar/1',canonicalSchemaVersion:'foxyya-observation/1',
    sourceStatus:'AVAILABLE',observations:[observation]
  });
  store.recordSource(source);
  const output=Lineage.createResearchOutputLineage({
    outputType:'US_RESEARCH',subjectId:'NASDAQ:NVDA',asOf:1500,
    outputSchemaVersion:'foxyya-us-asset-read-model/1',sourceLineageRefs:[source.lineageRef],
    observationRefs:[...source.observationRefs]
  });
  store.recordOutput(output);
  return {source,output};
}

test('durable lineage replay never reads the whole journal into one UTF-8 string',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-bounded-lineage-'));
  const filePath=path.join(dir,'bounded.lineage.jsonl');
  try{
    const seeded=fixture(filePath);
    assert.ok(fs.statSync(filePath).size>65536,'fixture must span multiple scan chunks');
    let wholeFileReads=0;
    const fsImpl=Object.create(fs);
    fsImpl.readFileSync=function(){wholeFileReads++;throw Error('WHOLE_FILE_READ_FORBIDDEN');};
    const restarted=createDurableSourceLineageStore({filePath,now:()=>6000,fsImpl});
    assert.equal(wholeFileReads,0,'startup replay must use bounded chunk reads');
    assert.deepEqual(restarted.source(seeded.source.lineageRef),seeded.source);
    assert.deepEqual(restarted.output(seeded.output.lineageRef),seeded.output);
    const trace=restarted.traceOutput(seeded.output.lineageRef);
    assert.deepEqual(trace.output,seeded.output);
    assert.deepEqual(trace.sources,[seeded.source]);
    assert.equal(trace.observations.length,1);
    assert.deepEqual(trace.observations[0].observation,seeded.source.observations[0]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('disk-backed replay preserves public store API and corruption stays fail-closed',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-bounded-corrupt-'));
  const filePath=path.join(dir,'corrupt.lineage.jsonl');
  try{
    fixture(filePath);
    const restarted=createDurableSourceLineageStore({filePath,now:()=>6000});
    assert.deepEqual(Object.keys(restarted).sort(),['output','recordOutput','recordSource','source','traceOutput'].sort());
    fs.appendFileSync(filePath,'{"schema":"bad"}\n','utf8');
    assert.throws(()=>createDurableSourceLineageStore({filePath,now:()=>7000}),/LINEAGE_JOURNAL_CORRUPT/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
