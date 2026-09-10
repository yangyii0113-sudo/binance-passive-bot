'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Crypto=require('../v12/crypto/runtime_adapter.js');
const Regime=require('../v12/read_model/crypto_market_regime.js');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createStagingDataOrchestrator}=require('../v12/staging/data_orchestrator.js');

const nowMs=Date.parse('2026-09-11T01:00:00Z');
function status(){return {paper_only:true,real_order_lock:true,strategy_version:'FOXYYA-EXEC-V2-20260908',cycle_count:77,ledger_integrity:true,ok:true};}
function snapshot(overrides={}){return {
  schema:'foxyya-runtime-snapshot/1',status:'PAPER_ONLY',real_orders:false,complete:true,served_at:nowMs,
  ledger_events:100,books:{'5x':{}},diagnostics:{qualified_24h:4,filled_24h:1},candidates:[],pending:[],trades:[],
  latest_scan:{scan_id:'scan-77',time_ms:nowMs-60_000,decision_cutoff_ms:nowMs-3_600_000,regime:'RISK_ON',funnel:{eligible:120,candidate:200,qualified:4,executable:4,intents:2,filled:0},eligible_universe_count:120,data_insufficient_features:['OLDUSDT'],real_orders:false},
  ...overrides
};}

test('runtime adapter preserves only read-only latest scan regime context from Production snapshot',()=>{
  const execution=Crypto.adaptRuntime(status(),snapshot());
  assert.equal(execution.latestScan.regime,'RISK_ON');
  assert.equal(execution.latestScan.scan_id,'scan-77');
  assert.equal(execution.latestScan.decision_cutoff_ms,nowMs-3_600_000);
  assert.equal(execution.latestScan.eligible_universe_count,120);
  assert.deepEqual(execution.latestScan.data_insufficient_features,['OLDUSDT']);
  assert.equal(execution.paperOnly,true);
  assert.equal(execution.realOrderLock,true);
  assert.equal(execution.readOnly,true);
  assert.equal(execution.executionWrite,undefined);
});

test('Crypto market regime projects the Production router classification without recalculating it',()=>{
  const execution=Crypto.adaptRuntime(status(),snapshot());
  const result=Regime.buildCryptoMarketRegime({execution,nowMs});
  assert.equal(result.schemaVersion,'foxyya-crypto-market-regime/1');
  assert.equal(result.market,'CRYPTO');
  assert.equal(result.status,'AVAILABLE');
  assert.equal(result.state,'RISK_ON');
  assert.equal(result.source,'PRODUCTION_REGIME_ROUTER_READ_ONLY');
  assert.equal(result.classificationAuthority,'FOXYYA-EXEC-V2-20260908');
  assert.equal(result.asOf,nowMs-60_000);
  assert.equal(result.decisionCutoffMs,nowMs-3_600_000);
  assert.equal(result.scanAgeMs,60_000);
  assert.equal(result.eligibleUniverseCount,120);
  assert.equal(result.dataInsufficientCount,1);
  assert.equal(result.evidenceCompleteness,'CLASSIFICATION_ONLY');
  assert.equal(result.rawInputsAvailable,false);
  assert.equal(result.confidence,null,'do not invent confidence without raw regime inputs');
  assert.equal(result.method,'BTC_ETH_SOL_24H_RETURNS_PLUS_ELIGIBLE_UNIVERSE_BREADTH_PLUS_VOLATILITY');
  assert.equal(result.decisionBarPolicy,'FULLY_CLOSED_1H');
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
  assert.deepEqual(Object.keys(Regime),['buildCryptoMarketRegime']);
});

test('stale Production scan is not presented as the current Crypto market regime',()=>{
  const old=nowMs-(3*60*60*1000);
  const execution=Crypto.adaptRuntime(status(),snapshot({latest_scan:{...snapshot().latest_scan,time_ms:old}}));
  const result=Regime.buildCryptoMarketRegime({execution,nowMs,staleAfterMs:2*60*60*1000});
  assert.equal(result.status,'STALE');
  assert.equal(result.state,'UNAVAILABLE');
  assert.equal(result.lastState,'RISK_ON');
  assert.equal(result.reason,'SCAN_STALE');
  assert.equal(result.rawInputsAvailable,false);
});

test('orchestrator publishes Production Regime Router state into Crypto pulse without gaining execution authority',async()=>{
  const service=createStagingHomeService();
  const orchestrator=createStagingDataOrchestrator({publishHome:service.publishHome});
  const result=await orchestrator.run({
    nowMs,
    crypto:async()=>({status:'AVAILABLE',data:{status:status(),snapshot:snapshot()}})
  });
  const pulse=result.published.home.marketPulse.find(x=>x.market==='CRYPTO');
  assert.equal(pulse.status,'AVAILABLE');
  assert.equal(pulse.state,'RISK_ON');
  assert.equal(pulse.data.regimeStatus,'AVAILABLE');
  assert.equal(pulse.data.regimeState,'RISK_ON');
  assert.equal(pulse.data.regimeSource,'PRODUCTION_REGIME_ROUTER_READ_ONLY');
  assert.equal(pulse.data.rawRegimeInputsAvailable,false);
  assert.equal(pulse.data.decisionCutoffMs,nowMs-3_600_000);
  assert.equal(pulse.data.health,'HEALTHY');
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
});
