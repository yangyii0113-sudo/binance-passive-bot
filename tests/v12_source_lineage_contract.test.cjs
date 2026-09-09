'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Lineage=require('../v12/lineage/source_lineage.js');

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

function sourceLineageInput(overrides={}){
  const ref=Lineage.makeObservationRef(twObservation());
  return {
    sourceId:'tpex-openapi',
    datasetId:'TPEX:tpex_mainboard_daily_close_quotes',
    receivedAt:1100,
    bindingId:'official-source-binding:tpexDailyQuote',
    bindingVersion:'1',
    adapterId:'tpex-adapter',
    adapterVersion:'1',
    canonicalSchemaVersion:'foxyya-observation/1',
    status:'AVAILABLE',
    observationRefs:[ref],
    ...overrides
  };
}

test('canonical observation reference is deterministic across equivalent object key order',()=>{
  const a=twObservation();
  const b={
    source:a.source,
    confidence:a.confidence,
    status:a.status,
    receivedAt:a.receivedAt,
    observedAt:a.observedAt,
    currency:a.currency,
    unit:a.unit,
    value:a.value,
    field:a.field,
    market:a.market,
    instrumentId:a.instrumentId,
    schemaVersion:a.schemaVersion
  };
  const refA=Lineage.makeObservationRef(a);
  const refB=Lineage.makeObservationRef(b);
  assert.equal(refA,refB);
  assert.match(refA,/^obs:[a-f0-9]{64}$/);
});

test('observation reference changes when canonical economic content changes',()=>{
  const base=Lineage.makeObservationRef(twObservation());
  const changed=Lineage.makeObservationRef(twObservation({value:124}));
  assert.notEqual(base,changed);
});

test('source lineage separates provider source from dataset and versions every transformation boundary',()=>{
  const row=Lineage.createSourceLineage(sourceLineageInput());
  assert.equal(row.schemaVersion,'foxyya-source-lineage/1');
  assert.equal(row.sourceId,'tpex-openapi');
  assert.equal(row.datasetId,'TPEX:tpex_mainboard_daily_close_quotes');
  assert.equal(row.bindingId,'official-source-binding:tpexDailyQuote');
  assert.equal(row.bindingVersion,'1');
  assert.equal(row.adapterId,'tpex-adapter');
  assert.equal(row.adapterVersion,'1');
  assert.equal(row.canonicalSchemaVersion,'foxyya-observation/1');
  assert.match(row.lineageId,/^src:[a-f0-9]{64}$/);
  assert.equal(row.researchOnly,true);
  assert.equal(row.executionWrite,false);
  assert.equal(Object.isFrozen(row),true);
  assert.equal(Object.isFrozen(row.observationRefs),true);
});

test('equivalent source lineage is restart-stable and produces the same lineage id',()=>{
  const a=Lineage.createSourceLineage(sourceLineageInput());
  const b=Lineage.createSourceLineage(sourceLineageInput());
  assert.equal(a.lineageId,b.lineageId);
  assert.deepEqual(a,b);
});

test('unavailable source lineage stays explicit and cannot fabricate canonical observation refs or receive time',()=>{
  const row=Lineage.createSourceLineage(sourceLineageInput({
    status:'UNAVAILABLE',
    receivedAt:null,
    observationRefs:[],
    reason:'ENTITY_NOT_FOUND'
  }));
  assert.equal(row.status,'UNAVAILABLE');
  assert.equal(row.receivedAt,null);
  assert.deepEqual(row.observationRefs,[]);
  assert.equal(row.reason,'ENTITY_NOT_FOUND');
  assert.throws(()=>Lineage.createSourceLineage(sourceLineageInput({status:'UNAVAILABLE',receivedAt:null,reason:'ENTITY_NOT_FOUND'})),/UNAVAILABLE_OBSERVATION_REFS_FORBIDDEN/);
});

test('research lineage traces output to exact source lineage and canonical observation references',()=>{
  const source=Lineage.createSourceLineage(sourceLineageInput());
  const research=Lineage.createResearchLineage({
    researchOutputId:'TW:TPEX:6488:research:1700',
    instrumentId:'TPEX:6488',
    asOf:1700,
    modelVersion:'tw-research/1',
    policyVersion:'tw-policy/1',
    sourceLineages:[source]
  });
  assert.equal(research.schemaVersion,'foxyya-research-lineage/1');
  assert.deepEqual(research.sourceLineageIds,[source.lineageId]);
  assert.deepEqual(research.observationRefs,source.observationRefs);
  assert.equal(research.knowledgeAt,1100);
  assert.match(research.lineageId,/^research:[a-f0-9]{64}$/);
  assert.equal(research.researchOnly,true);
  assert.equal(research.executionWrite,false);
  assert.equal(Object.isFrozen(research),true);
  assert.equal(Object.isFrozen(research.sourceLineageIds),true);
  assert.equal(Object.isFrozen(research.observationRefs),true);
});

test('research lineage rejects future knowledge and malformed lineage references',()=>{
  const future=Lineage.createSourceLineage(sourceLineageInput({receivedAt:1800}));
  assert.throws(()=>Lineage.createResearchLineage({
    researchOutputId:'TW:TPEX:6488:research:1700',
    instrumentId:'TPEX:6488',
    asOf:1700,
    modelVersion:'tw-research/1',
    policyVersion:'tw-policy/1',
    sourceLineages:[future]
  }),/LINEAGE_TIME_ORDER_INVALID/);
  assert.throws(()=>Lineage.createResearchLineage({
    researchOutputId:'TW:TPEX:6488:research:1700',
    instrumentId:'TPEX:6488',
    asOf:1700,
    modelVersion:'tw-research/1',
    sourceLineages:[{lineageId:'fake'}]
  }),/SOURCE_LINEAGE_INVALID/);
});

test('lineage constructors reject secret and execution authority fields',()=>{
  assert.throws(()=>Lineage.createSourceLineage(sourceLineageInput({apiKey:'do-not-store'})),/SECRET_FIELD_FORBIDDEN/);
  const source=Lineage.createSourceLineage(sourceLineageInput());
  assert.throws(()=>Lineage.createResearchLineage({
    researchOutputId:'TW:TPEX:6488:research:1700',
    instrumentId:'TPEX:6488',
    asOf:1700,
    modelVersion:'tw-research/1',
    sourceLineages:[source],
    executionWrite:true
  }),/EXECUTION_FIELD_FORBIDDEN/);
  for(const api of [Lineage.createSourceLineage,Lineage.createResearchLineage,Lineage.makeObservationRef]){
    assert.equal(/order|trade|position|fill/i.test(api.name),false);
  }
});
