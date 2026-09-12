const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const Lineage=require('../v12/data/source_lineage.js');
const {createDurableSourceLineageStore}=require('../v12/staging/durable_source_lineage_store.js');

const receivedAt=Date.parse('2026-09-09T07:30:00Z');
const fetchStartedAt=receivedAt-125;
const recordedAt=receivedAt+500;

function tmpFile(name='trace.lineage.jsonl'){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-lineage-'));
  return {dir,filePath:path.join(dir,name)};
}

function observation(overrides={}){
  return Object.freeze({
    schemaVersion:'foxyya-observation/1',
    instrumentId:'TPEX:6488',
    market:'TW',
    field:'price.close',
    value:468,
    unit:'TWD',
    currency:'TWD',
    observedAt:Date.parse('2026-09-09T05:30:00Z'),
    receivedAt,
    source:'TPEX:tpex_mainboard_daily_close_quotes',
    status:'SNAPSHOT',
    confidence:1,
    ...overrides
  });
}

function sourceRecord(overrides={}){
  return Lineage.createSourceObservationLineage({
    sourceId:'tpex-openapi',
    datasetId:'TPEX:tpex_mainboard_daily_close_quotes',
    subjectId:'TPEX:6488',
    fetchStartedAt,
    receivedAt,
    bindingVersion:'foxyya-binding/tpex-daily-quote/1',
    adapterVersion:'foxyya-adapter/tpex/1',
    canonicalSchemaVersion:'foxyya-observation/1',
    sourceStatus:'AVAILABLE',
    observations:[observation()],
    ...overrides
  });
}

function outputRecord(source,overrides={}){
  return Lineage.createResearchOutputLineage({
    outputType:'TW_ASSET_RESEARCH',
    subjectId:'TPEX:6488',
    asOf:receivedAt+100,
    outputSchemaVersion:'foxyya-tw-asset-read-model/1',
    modelVersion:'tw-research-v1',
    policyVersion:'tw-tpex-staging-v1',
    sourceLineageRefs:[source.lineageRef],
    observationRefs:[...source.observationRefs],
    ...overrides
  });
}

function lines(filePath){
  if(!fs.existsSync(filePath))return [];
  return fs.readFileSync(filePath,'utf8').split('\n').filter(Boolean);
}

test('lineage journal path is dedicated and cannot reuse research history or Crypto sqlite',()=>{
  assert.throws(()=>createDurableSourceLineageStore({filePath:'/tmp/a.sqlite'}),/LINEAGE_JOURNAL_PATH_INVALID/);
  assert.throws(()=>createDurableSourceLineageStore({filePath:'/tmp/a.research.jsonl'}),/LINEAGE_JOURNAL_PATH_INVALID/);
  assert.throws(()=>createDurableSourceLineageStore({filePath:'/tmp/a.jsonl'}),/LINEAGE_JOURNAL_PATH_INVALID/);
  const {filePath}=tmpFile();
  const store=createDurableSourceLineageStore({filePath,now:()=>recordedAt});
  assert.deepEqual(Object.keys(store).sort(),['output','recordOutput','recordSource','source','traceOutput'].sort());
});

test('source observation lineage requires explicit source dataset timing version schema and status metadata',()=>{
  const source=sourceRecord();
  assert.equal(source.schemaVersion,'foxyya-source-lineage/1');
  assert.match(source.lineageRef,/^src_[a-f0-9]{64}$/);
  assert.equal(source.sourceId,'tpex-openapi');
  assert.equal(source.datasetId,'TPEX:tpex_mainboard_daily_close_quotes');
  assert.equal(source.fetchStartedAt,fetchStartedAt);
  assert.equal(source.receivedAt,receivedAt);
  assert.equal(source.bindingVersion,'foxyya-binding/tpex-daily-quote/1');
  assert.equal(source.adapterVersion,'foxyya-adapter/tpex/1');
  assert.equal(source.canonicalSchemaVersion,'foxyya-observation/1');
  assert.equal(source.sourceStatus,'AVAILABLE');
  assert.equal(source.observationRefs.length,1);
  assert.match(source.observationRefs[0],/^obs_[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(source),true);
  assert.equal(Object.isFrozen(source.observations),true);
  assert.equal(source.researchOnly,true);
  assert.equal(source.executionWrite,false);

  const again=sourceRecord();
  assert.equal(again.lineageRef,source.lineageRef);
  assert.deepEqual(again.observationRefs,source.observationRefs);

  assert.throws(()=>sourceRecord({sourceId:''}),/SOURCE_ID_REQUIRED/);
  assert.throws(()=>sourceRecord({datasetId:''}),/DATASET_ID_REQUIRED/);
  assert.throws(()=>sourceRecord({fetchStartedAt:receivedAt+1}),/SOURCE_TIME_ORDER_INVALID/);
  assert.throws(()=>sourceRecord({bindingVersion:''}),/BINDING_VERSION_REQUIRED/);
  assert.throws(()=>sourceRecord({adapterVersion:''}),/ADAPTER_VERSION_REQUIRED/);
  assert.throws(()=>sourceRecord({canonicalSchemaVersion:'foxyya-context-observation/1'}),/CANONICAL_SCHEMA_MISMATCH/);
});

test('available lineage requires canonical observations while unavailable lineage preserves explicit absence without fabrication',()=>{
  assert.throws(()=>sourceRecord({observations:[]}),/AVAILABLE_OBSERVATIONS_REQUIRED/);
  assert.throws(()=>sourceRecord({observations:[observation({receivedAt:receivedAt-1})]}),/OBSERVATION_RECEIVE_TIME_MISMATCH/);

  const unavailable=sourceRecord({
    sourceStatus:'UNAVAILABLE',
    observations:[],
    datasetId:'TPEX:tpex_3insti_daily_trading'
  });
  assert.equal(unavailable.sourceStatus,'UNAVAILABLE');
  assert.deepEqual(unavailable.observationRefs,[]);
  assert.deepEqual(unavailable.observations,[]);
  assert.throws(()=>sourceRecord({sourceStatus:'UNAVAILABLE'}),/UNAVAILABLE_OBSERVATIONS_FORBIDDEN/);
});

test('research output lineage is deterministic and stores exact source and observation references without execution authority',()=>{
  const source=sourceRecord();
  const output=outputRecord(source);
  assert.equal(output.schemaVersion,'foxyya-research-output-lineage/1');
  assert.match(output.lineageRef,/^out_[a-f0-9]{64}$/);
  assert.equal(output.outputType,'TW_ASSET_RESEARCH');
  assert.equal(output.subjectId,'TPEX:6488');
  assert.equal(output.outputSchemaVersion,'foxyya-tw-asset-read-model/1');
  assert.equal(output.modelVersion,'tw-research-v1');
  assert.equal(output.policyVersion,'tw-tpex-staging-v1');
  assert.deepEqual(output.sourceLineageRefs,[source.lineageRef]);
  assert.deepEqual(output.observationRefs,source.observationRefs);
  assert.equal(output.researchOnly,true);
  assert.equal(output.executionWrite,false);
  assert.equal(outputRecord(source).lineageRef,output.lineageRef);
  assert.throws(()=>outputRecord(source,{sourceLineageRefs:[]}),/SOURCE_LINEAGE_REFS_REQUIRED/);
  assert.throws(()=>outputRecord(source,{observationRefs:[]}),/OBSERVATION_REFS_REQUIRED/);
});

test('durable store traces a research output back to the exact persisted source observation',()=>{
  const {filePath}=tmpFile();
  const store=createDurableSourceLineageStore({filePath,now:()=>recordedAt});
  const source=sourceRecord();
  const output=outputRecord(source);

  assert.deepEqual(store.recordSource(source),{status:'RECORDED',lineageRef:source.lineageRef});
  assert.deepEqual(store.recordOutput(output),{status:'RECORDED',lineageRef:output.lineageRef});
  const trace=store.traceOutput(output.lineageRef);
  assert.equal(trace.output.lineageRef,output.lineageRef);
  assert.equal(trace.sources.length,1);
  assert.equal(trace.sources[0].lineageRef,source.lineageRef);
  assert.equal(trace.observations.length,1);
  assert.equal(trace.observations[0].observationRef,source.observationRefs[0]);
  assert.equal(trace.observations[0].sourceLineageRef,source.lineageRef);
  assert.equal(trace.observations[0].observation.field,'price.close');
  assert.equal(Object.isFrozen(trace),true);
  assert.equal(Object.isFrozen(trace.observations),true);
});

test('lineage survives restart with compressed frame sequence checksum and immutable replay',()=>{
  const {filePath}=tmpFile();
  const source=sourceRecord();
  const output=outputRecord(source);
  const first=createDurableSourceLineageStore({filePath,now:()=>recordedAt});
  first.recordSource(source);
  first.recordOutput(output);

  const persisted=lines(filePath).map(JSON.parse);
  assert.equal(persisted.length,2);
  assert.equal(persisted[0].schema,'foxyya-lineage-frame/1');
  assert.equal(persisted[0].encoding,'deflate-raw-base64');
  assert.equal(persisted[0].sequence,1);
  assert.equal(persisted[1].sequence,2);
  assert.match(persisted[0].checksum,/^[a-f0-9]{64}$/);
  assert.match(persisted[1].checksum,/^[a-f0-9]{64}$/);

  const restarted=createDurableSourceLineageStore({filePath,now:()=>recordedAt+1000});
  assert.equal(restarted.source(source.lineageRef).datasetId,source.datasetId);
  assert.equal(restarted.output(output.lineageRef).outputType,'TW_ASSET_RESEARCH');
  assert.equal(restarted.traceOutput(output.lineageRef).observations[0].observation.value,468);
});

test('identical duplicate is idempotent and does not append duplicate lineage events',()=>{
  const {filePath}=tmpFile();
  const source=sourceRecord();
  const output=outputRecord(source);
  const store=createDurableSourceLineageStore({filePath,now:()=>recordedAt});
  store.recordSource(source);
  store.recordOutput(output);
  const before=lines(filePath).length;
  assert.deepEqual(store.recordSource(source),{status:'IDEMPOTENT',lineageRef:source.lineageRef});
  assert.deepEqual(store.recordOutput(output),{status:'IDEMPOTENT',lineageRef:output.lineageRef});
  assert.equal(lines(filePath).length,before);
});

test('same lineage identity cannot be rewritten with conflicting source or research-output content',()=>{
  const {filePath}=tmpFile();
  const store=createDurableSourceLineageStore({filePath,now:()=>recordedAt});
  const source=sourceRecord();
  store.recordSource(source);
  const conflictingSource=sourceRecord({observations:[observation({value:469})]});
  assert.notEqual(conflictingSource.lineageRef,source.lineageRef);
  assert.throws(()=>store.recordSource(conflictingSource),/SOURCE_LINEAGE_CONFLICT/);
  assert.equal(lines(filePath).length,1);

  const output=outputRecord(source);
  store.recordOutput(output);
  const secondSource=sourceRecord({datasetId:'TPEX:tpex_3insti_daily_trading',observations:[observation({field:'flow.total_net',value:1350000,unit:'SHARES',source:'TPEX:tpex_3insti_daily_trading'})]});
  store.recordSource(secondSource);
  const conflictingOutput=outputRecord(source,{sourceLineageRefs:[secondSource.lineageRef],observationRefs:[secondSource.observationRefs[0]]});
  assert.notEqual(conflictingOutput.lineageRef,output.lineageRef);
  assert.throws(()=>store.recordOutput(conflictingOutput),/RESEARCH_OUTPUT_LINEAGE_CONFLICT/);
});

test('research output cannot reference unknown source or observation refs',()=>{
  const {filePath}=tmpFile();
  const store=createDurableSourceLineageStore({filePath,now:()=>recordedAt});
  const source=sourceRecord();
  const output=outputRecord(source);
  assert.throws(()=>store.recordOutput(output),/SOURCE_LINEAGE_REF_UNKNOWN/);
  store.recordSource(source);
  const unknownObs=Lineage.createResearchOutputLineage({
    outputType:output.outputType,subjectId:output.subjectId,asOf:output.asOf+1,
    outputSchemaVersion:output.outputSchemaVersion,modelVersion:output.modelVersion,policyVersion:output.policyVersion,
    sourceLineageRefs:[source.lineageRef],observationRefs:['obs_'+('0'.repeat(64))]
  });
  assert.throws(()=>store.recordOutput(unknownObs),/OBSERVATION_REF_UNKNOWN/);
  assert.equal(lines(filePath).length,1);
});

test('complete journal corruption fails closed while an incomplete trailing fragment is ignored',()=>{
  const {filePath}=tmpFile();
  const source=sourceRecord();
  const store=createDurableSourceLineageStore({filePath,now:()=>recordedAt});
  store.recordSource(source);
  fs.appendFileSync(filePath,'{"incomplete":');
  const recovered=createDurableSourceLineageStore({filePath,now:()=>recordedAt+1});
  assert.equal(recovered.source(source.lineageRef).lineageRef,source.lineageRef);

  fs.writeFileSync(filePath,JSON.stringify({...JSON.parse(lines(filePath)[0]),checksum:'0'.repeat(64)})+'\n');
  assert.throws(()=>createDurableSourceLineageStore({filePath,now:()=>recordedAt+2}),/LINEAGE_JOURNAL_CORRUPT/);
});

test('durable write failure does not advance live lineage state',()=>{
  const {filePath}=tmpFile();
  const broken=Object.create(fs);
  broken.fsyncSync=()=>{throw Error('disk offline')};
  const store=createDurableSourceLineageStore({filePath,now:()=>recordedAt,fsImpl:broken});
  const source=sourceRecord();
  assert.throws(()=>store.recordSource(source),/DURABLE_WRITE_FAILED/);
  assert.equal(store.source(source.lineageRef),null);
});

test('lineage surface is research-only and exposes no correction or execution command',()=>{
  const {filePath}=tmpFile();
  const store=createDurableSourceLineageStore({filePath,now:()=>recordedAt});
  const keys=Object.keys(store);
  assert.deepEqual(keys.sort(),['output','recordOutput','recordSource','source','traceOutput'].sort());
  assert.doesNotMatch(JSON.stringify(keys).toLowerCase(),/update|delete|correct|order|trade|execute|fill|position/);
  assert.doesNotMatch(JSON.stringify(Lineage).toLowerCase(),/buy|sell|order|execute|fill|position/);
});