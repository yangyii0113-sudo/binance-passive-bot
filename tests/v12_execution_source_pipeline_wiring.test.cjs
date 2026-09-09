'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStagingSourcePipeline}=require('../v12/staging/source_pipeline.js');
const {buildHomeReadModel}=require('../v12/read_model/home_snapshot.js');

const nowMs=Date.parse('2026-09-10T01:00:00Z');
function runtimeEnvelope(){
  return Object.freeze({status:'AVAILABLE',data:Object.freeze({
    status:Object.freeze({ok:true,paper_only:true,real_order_lock:true,execution_enabled:false,strategy_version:'FOXYYA-EXEC-V2-20260908',cycle_count:25,ledger_integrity:true}),
    snapshot:Object.freeze({schema:'foxyya-runtime-snapshot/1',status:'PAPER_ONLY',real_orders:false,complete:true,served_at:nowMs,ledger_events:52,books:{'5x':{}},candidates:[{symbol:'ETHUSDT',family:'A',side:'LONG',status:'ARMED'}],pending:[{symbol:'BTCUSDT',family:'B',side:'SHORT',status:'PENDING_INTENT'}],trades:[],diagnostics:{qualified_24h:2,filled_24h:1}})
  }),researchOnly:true,executionWrite:false});
}

test('source pipeline forwards a validated read-only Crypto loader into the atomic Home snapshot',async()=>{
  let cryptoLoads=0;
  const pipeline=createStagingSourcePipeline({
    fetchImpl:async()=>{throw Error('official network must not be needed');},
    clock:()=>nowMs,
    publishHome:buildHomeReadModel
  });
  const out=await pipeline.run({
    nowMs,
    crypto:async()=>{cryptoLoads++;return runtimeEnvelope();},
    twAssets:[],usAssets:[],regions:{},pulses:{},todayFocus:[],events:[]
  });
  assert.equal(cryptoLoads,1);
  assert.equal(out.orchestration.diagnostics.CRYPTO.status,'AVAILABLE');
  assert.equal(out.orchestration.published.home.opportunities.CRYPTO.length,1);
  assert.equal(out.orchestration.published.home.opportunities.CRYPTO[0].symbol,'ETHUSDT');
  assert.equal(out.orchestration.published.home.opportunities.CRYPTO[0].executionWrite,false);
  assert.equal(out.orchestration.published.researchOnly,true);
  assert.equal(out.orchestration.published.executionWrite,false);
});

test('unavailable Production runtime does not block equity research publication and never fabricates Crypto state',async()=>{
  const pipeline=createStagingSourcePipeline({fetchImpl:async()=>{throw Error('unused');},clock:()=>nowMs,publishHome:buildHomeReadModel});
  const out=await pipeline.run({nowMs,crypto:async()=>({status:'UNAVAILABLE',data:null,reason:'HTTP_503',researchOnly:true,executionWrite:false}),twAssets:[],usAssets:[],regions:{}});
  assert.equal(out.orchestration.diagnostics.CRYPTO.status,'UNAVAILABLE');
  assert.deepEqual(out.orchestration.published.home.opportunities.CRYPTO,[]);
  assert.equal(out.orchestration.published.home.marketPulse.find(x=>x.market==='CRYPTO').status,'UNAVAILABLE');
});