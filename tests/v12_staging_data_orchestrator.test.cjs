const test=require('node:test');
const assert=require('node:assert/strict');
const TWSE=require('../v12/providers/twse_adapter.js');
const Policy=require('../v12/early_trend/evidence_policy.js');
const Context=require('../v12/data/context_normalizer.js');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createStagingDataOrchestrator}=require('../v12/staging/data_orchestrator.js');

const nowMs=Date.parse('2026-09-09T04:30:00Z');
const available=data=>({status:'AVAILABLE',data});
const unavailable=reason=>({status:'UNAVAILABLE',reason});

const policy=Policy.freezeEvidencePolicy({
  schemaVersion:'foxyya-evidence-policy/1',id:'tw-orchestrator-v1',market:'TW',mode:'RESEARCH_CONTROL',createdAt:1,
  researchOnly:true,executionWrite:false,
  parameters:{institutionalFlow:{fullScaleRatio:0.05},institutionalPersistence:{minSessions:3,fullScaleAverageRatio:0.04},revenueAcceleration:{fullScalePct:20}}
});

function twInput(){
  const receivedAt=nowMs-1000;
  const quote=TWSE.normalizeDailyQuote({Date:'1150909',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'10000',TradeValue:'1000000000',Transaction:'5000'},{receivedAt});
  const fields=['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'];
  const flow=TWSE.normalizeInstitutional({fields,data:[['2330','台積電','200','100','50','350']]},{tradeDate:'20260909',receivedAt})[0];
  return {policy,currentQuote:quote,currentFlow:flow,institutionalSessions:[],nowMs};
}

function usInput(){
  return {
    instrument:{instrumentId:'NASDAQ:NVDA',exchange:'NASDAQ',symbol:'NVDA',market:'US',region:'US',currency:'USD',timezone:'America/New_York',assetType:'EQUITY'},
    fundamentalFacts:[],researchEvidence:[],earlyEvidence:[],nowMs
  };
}

function cryptoInput(realOrders=false){
  return {
    status:{paper_only:true,real_order_lock:true,strategy_version:'v11.2',cycle_count:99,ledger_integrity:true,ok:true},
    snapshot:{schema:'foxyya-runtime-snapshot/1',status:'PAPER_ONLY',real_orders:realOrders,complete:true,served_at:nowMs-500,ledger_events:20,books:{'5x':{}},candidates:[{symbol:'ETHUSDT',strategy:'A'}],pending:[],trades:[],diagnostics:{qualified_24h:1,filled_24h:0}}
  };
}

function usRegionInput(){
  const observation=Context.makeContextObservation({entityId:'MACRO:US:CPI',scope:'US',field:'inflation.cpi_index',value:326.5,unit:'INDEX',observedAt:nowMs-1000,receivedAt:nowMs-1000,source:'BLS:CUSR0000SA0',status:'SNAPSHOT',confidence:1});
  return {region:'US',observations:[observation],events:[],evidence:[],nowMs};
}

function createOrchestrator(){
  const service=createStagingHomeService();
  const orchestrator=createStagingDataOrchestrator({publishHome:service.publishHome});
  return {service,orchestrator};
}

test('orchestrator converts market-domain inputs into read models and atomically publishes one home snapshot',async()=>{
  const {service,orchestrator}=createOrchestrator();
  const result=await orchestrator.run({
    nowMs,
    crypto:async()=>available(cryptoInput()),
    twAssets:[async()=>available(twInput())],
    usAssets:[async()=>available(usInput())],
    regions:{US:async()=>available(usRegionInput())}
  });
  assert.equal(result.schemaVersion,'foxyya-staging-orchestration-result/1');
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
  assert.equal(result.published.schemaVersion,'foxyya-home-read-model/1');
  assert.equal(result.published.asOf,nowMs);
  assert.equal(result.diagnostics.CRYPTO.status,'AVAILABLE');
  assert.equal(result.diagnostics.TW[0].status,'AVAILABLE');
  assert.equal(result.diagnostics.US[0].status,'AVAILABLE');
  assert.equal(result.diagnostics.REGIONS.US.status,'AVAILABLE');
  assert.equal(result.published.home.opportunities.CRYPTO.length,1);
  assert.equal(result.published.home.opportunities.TW.length,1);
  assert.equal(result.published.home.opportunities.US.length,1);
  assert.equal(service.publishHome,service.publishHome); // service remains internal publication surface only
});

test('provider loading failure becomes explicit UNAVAILABLE while other markets still publish',async()=>{
  const {orchestrator}=createOrchestrator();
  const result=await orchestrator.run({
    nowMs,
    crypto:async()=>{throw Error('network down')},
    twAssets:[async()=>available(twInput())],
    usAssets:[async()=>unavailable('LICENSE_NOT_CONFIGURED')],
    regions:{US:async()=>available(usRegionInput())}
  });
  assert.equal(result.diagnostics.CRYPTO.status,'UNAVAILABLE');
  assert.match(result.diagnostics.CRYPTO.reason,/LOAD_FAILED/);
  assert.equal(result.diagnostics.US[0].status,'UNAVAILABLE');
  assert.equal(result.diagnostics.US[0].reason,'LICENSE_NOT_CONFIGURED');
  assert.equal(result.published.home.opportunities.CRYPTO.length,0);
  assert.equal(result.published.home.opportunities.TW.length,1);
  assert.equal(result.published.home.opportunities.US.length,0);
});

test('successful loader returning unsafe domain data rejects the run and preserves the previous snapshot',async()=>{
  const {service,orchestrator}=createOrchestrator();
  const first=await orchestrator.run({nowMs:nowMs-1000,twAssets:[async()=>available({...twInput(),nowMs:nowMs-1000})]});
  assert.equal(first.published.asOf,nowMs-1000);
  await assert.rejects(()=>orchestrator.run({nowMs,crypto:async()=>available(cryptoInput(true))}),/REAL_ORDERS_FORBIDDEN/);
  assert.throws(()=>service.publishHome({asOf:nowMs-2000}),/SNAPSHOT_TIME_REGRESSION/);
});

test('wrong regional scope is validation failure, not silently downgraded to unavailable',async()=>{
  const {orchestrator}=createOrchestrator();
  await assert.rejects(()=>orchestrator.run({
    nowMs,
    regions:{TW:async()=>available(usRegionInput())}
  }),/SCOPE_MISMATCH|REGION/);
});

test('orchestrator exposes only run and never an execution method',()=>{
  const {orchestrator}=createOrchestrator();
  assert.deepEqual(Object.keys(orchestrator),['run']);
  assert.doesNotMatch(JSON.stringify(Object.keys(orchestrator)).toLowerCase(),/order|trade|execute|fill/);
});
