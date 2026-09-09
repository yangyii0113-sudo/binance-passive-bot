'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Lineage=require('../v12/data/source_lineage.js');
const {createDurableSourceLineageStore}=require('../v12/staging/durable_source_lineage_store.js');

function twObservation(overrides={}){
  return {
    schemaVersion:'foxyya-observation/1',
    instrumentId:'TPEX:6488',
    market:'TW',
    field:'price.close',
    value:123.5,
    unit:'TWD',
    currency:'TWD',
    observedAt:1000,
    receivedAt:1100,
    source:'TPEX:tpex_mainboard_daily_close_quotes',
    status:'SNAPSHOT',
    confidence:1,
    ...overrides
  };
}

function sourceInput(overrides={}){
  const receivedAt=overrides.receivedAt??1100;
  const observation=twObservation({receivedAt,...(overrides.observation||{})});
  const base={
    sourceId:'tpex-openapi',
    datasetId:'TPEX:tpex_mainboard_daily_close_quotes',
    subjectId:'TPEX:6488',
    fetchStartedAt:1000,
    receivedAt,
    bindingVersion:'official-source-binding/1',
    adapterVersion:'tpex-adapter/1',
    canonicalSchemaVersion:'foxyya-observation/1',
    sourceStatus:'AVAILABLE',
    observations:[observation]
  };
  const {observation:_ignored,...rest}=overrides;
  return {...base,...rest};
}

function outputInput(source,overrides={}){
  return {
    outputType:'TW_RESEARCH',
    subjectId:'TPEX:6488',
    asOf:1700,
    outputSchemaVersion:'foxyya-tw-asset-snapshot/1',
    modelVersion:'tw-research/1',
    policyVersion:'tw-policy/1',
    sourceLineageRefs:[source.lineageRef],
    observationRefs:[...source.observationRefs],
    ...overrides
  };
}

function withStore(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-lineage-contract-'));
  const filePath=path.join(dir,'audit.lineage.jsonl');
  try{return fn(createDurableSourceLineageStore({filePath,now:()=>2000}),filePath);}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
}

test('canonical observation references are deterministic across equivalent object key order',()=>{
  const a=twObservation();
  const b={
    source:a.source,confidence:a.confidence,status:a.status,receivedAt:a.receivedAt,
    observedAt:a.observedAt,currency:a.currency,unit:a.unit,value:a.value,
    field:a.field,market:a.market,instrumentId:a.instrumentId,schemaVersion:a.schemaVersion
  };
  const left=Lineage.createSourceObservationLineage(sourceInput({observation:a}));
  const right=Lineage.createSourceObservationLineage(sourceInput({observation:b}));
  assert.equal(left.lineageRef,right.lineageRef);
  assert.deepEqual(left.observationRefs,right.observationRefs);
  assert.match(left.observationRefs[0],/^obs_[a-f0-9]{64}$/);
});

test('canonical economic content change changes observation and source lineage references',()=>{
  const base=Lineage.createSourceObservationLineage(sourceInput());
  const changed=Lineage.createSourceObservationLineage(sourceInput({observation:{value:124}}));
  assert.notEqual(base.observationRefs[0],changed.observationRefs[0]);
  assert.notEqual(base.lineageRef,changed.lineageRef);
});

test('source lineage separates source dataset timing and transformation versions and stays immutable',()=>{
  const row=Lineage.createSourceObservationLineage(sourceInput());
  assert.equal(row.schemaVersion,'foxyya-source-lineage/1');
  assert.equal(row.sourceId,'tpex-openapi');
  assert.equal(row.datasetId,'TPEX:tpex_mainboard_daily_close_quotes');
  assert.equal(row.subjectId,'TPEX:6488');
  assert.equal(row.fetchStartedAt,1000);
  assert.equal(row.receivedAt,1100);
  assert.equal(row.bindingVersion,'official-source-binding/1');
  assert.equal(row.adapterVersion,'tpex-adapter/1');
  assert.equal(row.canonicalSchemaVersion,'foxyya-observation/1');
  assert.match(row.lineageRef,/^src_[a-f0-9]{64}$/);
  assert.equal(row.researchOnly,true);
  assert.equal(row.executionWrite,false);
  assert.equal(Object.isFrozen(row),true);
  assert.equal(Object.isFrozen(row.observations),true);
  assert.equal(Object.isFrozen(row.observationRefs),true);
});

test('unavailable source lineage is explicit and cannot fabricate canonical observations',()=>{
  const row=Lineage.createSourceObservationLineage(sourceInput({sourceStatus:'UNAVAILABLE',observations:[]}));
  assert.equal(row.sourceStatus,'UNAVAILABLE');
  assert.deepEqual(row.observations,[]);
  assert.deepEqual(row.observationRefs,[]);
  assert.throws(()=>Lineage.createSourceObservationLineage(sourceInput({sourceStatus:'AVAILABLE',observations:[]})),/AVAILABLE_OBSERVATIONS_REQUIRED/);
  assert.throws(()=>Lineage.createSourceObservationLineage(sourceInput({sourceStatus:'UNAVAILABLE'})),/UNAVAILABLE_OBSERVATIONS_FORBIDDEN/);
});

test('research output lineage points to exact source and observation references',()=>{
  const source=Lineage.createSourceObservationLineage(sourceInput());
  const output=Lineage.createResearchOutputLineage(outputInput(source));
  assert.equal(output.schemaVersion,'foxyya-research-output-lineage/1');
  assert.deepEqual(output.sourceLineageRefs,[source.lineageRef]);
  assert.deepEqual(output.observationRefs,[...source.observationRefs]);
  assert.match(output.lineageRef,/^out_[a-f0-9]{64}$/);
  assert.equal(output.researchOnly,true);
  assert.equal(output.executionWrite,false);
  assert.equal(Object.isFrozen(output),true);
  assert.equal(Object.isFrozen(output.sourceLineageRefs),true);
  assert.equal(Object.isFrozen(output.observationRefs),true);
});

test('durable lineage rejects research output that references future source knowledge',()=>{
  withStore((store)=>{
    const future=Lineage.createSourceObservationLineage(sourceInput({receivedAt:1800,fetchStartedAt:1750}));
    store.recordSource(future);
    const output=Lineage.createResearchOutputLineage(outputInput(future,{asOf:1700}));
    assert.throws(()=>store.recordOutput(output),/LINEAGE_TIME_ORDER_INVALID/);
    assert.equal(store.output(output.lineageRef),null);
  });
});

test('canonical lineage constructors reject secret and execution authority fields',()=>{
  assert.throws(()=>Lineage.createSourceObservationLineage(sourceInput({apiKey:'do-not-store'})),/SECRET_FIELD_FORBIDDEN/);
  const source=Lineage.createSourceObservationLineage(sourceInput());
  assert.throws(()=>Lineage.createResearchOutputLineage(outputInput(source,{executionWrite:true})),/EXECUTION_FIELD_FORBIDDEN/);
  assert.throws(()=>Lineage.createResearchOutputLineage(outputInput(source,{researchOnly:false})),/RESEARCH_ONLY_REQUIRED/);
  for(const api of [Lineage.createSourceObservationLineage,Lineage.createResearchOutputLineage]){
    assert.equal(/order|trade|position|fill/i.test(api.name),false);
  }
});
