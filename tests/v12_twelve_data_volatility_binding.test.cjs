'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {twelveDataVolatility,createTwelveDataSourceBindings,VOLATILITY_META}=require('../v12/staging/twelve_data_source_binding.js');

const receivedAt=Date.parse('2026-09-15T02:00:00Z');
const observedAt=receivedAt-5000;
const payload=Object.freeze({symbol:'VIX',name:'CBOE Volatility Index',exchange:'CBOE',last_quote_at:Math.floor(observedAt/1000),close:'17.84',percent_change:'3.121'});
function envelope(status='AVAILABLE',data=payload,reason=null){return Object.freeze({status,sourceId:'twelve-data-us-volatility',reason,fetchStartedAt:receivedAt-100,receivedAt,data:status==='AVAILABLE'?data:null,researchOnly:true,executionWrite:false});}

test('Twelve Data volatility binding emits canonical context lineage metadata and normalized data',async()=>{
  const binding=twelveDataVolatility({loader:{async load(){return envelope();}},expectedSymbol:'VIX'});
  assert.deepEqual(binding.lineageMeta,VOLATILITY_META);
  assert.equal(VOLATILITY_META.sourceId,'twelve-data-us-volatility');
  assert.equal(VOLATILITY_META.datasetId,'TWELVEDATA:VOLATILITY:US');
  assert.equal(VOLATILITY_META.canonicalSchemaVersion,'foxyya-context-observation/1');
  assert.equal(VOLATILITY_META.researchOnly,true);
  assert.equal(VOLATILITY_META.executionWrite,false);
  const result=await binding.load();
  assert.equal(result.status,'AVAILABLE');
  assert.equal(result.sourceId,'twelve-data-us-volatility');
  assert.equal(result.data.entityId,'INDEX:US:VOLATILITY:VIX');
  assert.equal(result.data.observedAt,observedAt);
  assert.equal(result.lineageMeta,VOLATILITY_META);
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
});

test('Twelve Data volatility binding preserves unavailable provider state without fabricating context',async()=>{
  const binding=twelveDataVolatility({loader:{async load(){return envelope('UNAVAILABLE',null,'ENTITLEMENT_REQUIRED');}},expectedSymbol:'VIX'});
  const result=await binding.load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.reason,'ENTITLEMENT_REQUIRED');
  assert.equal(result.data,null);
  assert.equal(result.lineageMeta,VOLATILITY_META);
});

test('Twelve Data binding registry exposes quote and volatility bindings',()=>{
  const bindings=createTwelveDataSourceBindings();
  assert.equal(typeof bindings.twelveDataQuote,'function');
  assert.equal(typeof bindings.twelveDataVolatility,'function');
  assert.equal(Object.isFrozen(bindings),true);
});
