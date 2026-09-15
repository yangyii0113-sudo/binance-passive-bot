'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {twelveDataEuBreadth,createTwelveDataSourceBindings,EU_BREADTH_META}=require('../v12/staging/twelve_data_source_binding.js');

const receivedAt=Date.parse('2026-09-15T09:00:00Z');
const payload=Object.freeze([
  Object.freeze({symbol:'AAA',close:'101',previous_close:'100',last_quote_at:String((receivedAt-3000)/1000)}),
  Object.freeze({symbol:'BBB',close:'99',previous_close:'100',last_quote_at:String((receivedAt-2000)/1000)}),
  Object.freeze({symbol:'CCC',close:'100',previous_close:'100',last_quote_at:String((receivedAt-1000)/1000)})
]);
function envelope(status='AVAILABLE',data=payload,reason=null){return Object.freeze({status,sourceId:'twelve-data-eu-breadth',reason,fetchStartedAt:receivedAt-100,receivedAt,data:status==='AVAILABLE'?data:null,researchOnly:true,executionWrite:false});}

test('Twelve Data EU breadth binding emits canonical lineage metadata and normalized breadth',async()=>{
  const binding=twelveDataEuBreadth({loader:{async load(){return envelope();}}});
  assert.deepEqual(binding.lineageMeta,EU_BREADTH_META);
  assert.equal(EU_BREADTH_META.sourceId,'twelve-data-eu-breadth');
  assert.equal(EU_BREADTH_META.datasetId,'TWELVEDATA:BREADTH:EU');
  assert.equal(EU_BREADTH_META.canonicalSchemaVersion,'foxyya-context-observation/1');
  assert.equal(EU_BREADTH_META.researchOnly,true);
  assert.equal(EU_BREADTH_META.executionWrite,false);
  const result=await binding.load();
  assert.equal(result.status,'AVAILABLE');
  assert.equal(result.sourceId,'twelve-data-eu-breadth');
  assert.equal(result.data.entityId,'MARKET:EU:BREADTH:CBOE_EUROPE');
  assert.equal(result.data.marketScope,'PAN_EUROPE_CBOE_EQUITIES');
  assert.equal(result.data.observedAt,receivedAt-3000);
  assert.equal(result.data.values.advancers,1);
  assert.equal(result.lineageMeta,EU_BREADTH_META);
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
});

test('Twelve Data EU breadth binding preserves unavailable provider state without fabricating breadth',async()=>{
  const binding=twelveDataEuBreadth({loader:{async load(){return envelope('UNAVAILABLE',null,'ENTITLEMENT_REQUIRED');}}});
  const result=await binding.load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.reason,'ENTITLEMENT_REQUIRED');
  assert.equal(result.data,null);
  assert.equal(result.lineageMeta,EU_BREADTH_META);
});

test('Twelve Data binding registry exposes quote, volatility and EU breadth bindings',()=>{
  const bindings=createTwelveDataSourceBindings();
  assert.equal(typeof bindings.twelveDataQuote,'function');
  assert.equal(typeof bindings.twelveDataVolatility,'function');
  assert.equal(typeof bindings.twelveDataEuBreadth,'function');
  assert.equal(Object.isFrozen(bindings),true);
});
