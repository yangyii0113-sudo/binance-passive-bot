const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../v12/early_trend/evidence_policy.js');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createStagingSourcePipeline}=require('../v12/staging/source_pipeline.js');

const nowMs=Date.parse('2026-09-09T06:30:00Z');
const quoteEndpoint='https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const flowEndpoint='https://www.twse.com.tw/rwd/zh/fund/T86?date=20260909&selectType=ALL&response=json';
const policy=P.freezeEvidencePolicy({
  schemaVersion:'foxyya-evidence-policy/1',id:'tw-staging-v1',market:'TW',mode:'RESEARCH_CONTROL',createdAt:1,
  researchOnly:true,executionWrite:false,
  parameters:{institutionalFlow:{fullScaleRatio:0.05},institutionalPersistence:{minSessions:3,fullScaleAverageRatio:0.04},revenueAcceleration:{fullScalePct:20}}
});

function response(body,{status=200}={}){
  return {ok:status>=200&&status<300,status,headers:{get(){return 'application/json; charset=utf-8'}},async json(){return body}};
}

function quotePayload(code='2330'){
  return [{Date:'1150909',Code:code,Name:code==='2330'?'台積電':'鴻海',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'10000',TradeValue:'1000000000',Transaction:'5000'}];
}

function flowPayload(code='2330'){
  return {
    fields:['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'],
    data:[[code,code==='2330'?'台積電':'鴻海','12,000,000','2,000,000','-500,000','13,500,000']]
  };
}

function twAssetConfig(overrides={}){
  return {
    symbol:'2330',
    quoteEndpoint,
    flowEndpoint,
    tradeDate:'20260909',
    policy,
    institutionalSessions:[],
    researchEvidence:[],
    ...overrides
  };
}

function createPipeline(tableOverrides=new Map()){
  const calls=[];
  const table=new Map([
    [quoteEndpoint,response(quotePayload())],
    [flowEndpoint,response(flowPayload())],
    ...tableOverrides
  ]);
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(!table.has(url))throw Error('unexpected url '+url);
    return table.get(url);
  };
  const service=createStagingHomeService();
  const pipeline=createStagingSourcePipeline({fetchImpl,clock:()=>nowMs,publishHome:service.publishHome});
  return {pipeline,service,calls,table};
}

test('TWSE quote plus T86 builds one research-only TW asset and publishes it as a home opportunity',async()=>{
  const {pipeline,calls}=createPipeline();
  const result=await pipeline.run({nowMs,twAssets:[twAssetConfig()]});
  assert.equal(result.orchestration.diagnostics.TW.length,1);
  assert.equal(result.orchestration.diagnostics.TW[0].status,'AVAILABLE');
  assert.equal(result.orchestration.diagnostics.TW[0].instrumentId,'TWSE:2330');
  assert.equal(result.orchestration.published.home.opportunities.TW.length,1);
  const opportunity=result.orchestration.published.home.opportunities.TW[0];
  assert.equal(opportunity.instrumentId,'TWSE:2330');
  assert.equal(opportunity.researchOnly,true);
  assert.equal(opportunity.executionWrite,false);
  assert.equal(opportunity.earlyTrend.stage,'DETECT');
  assert.ok(opportunity.sourceLineage.includes('TWSE:STOCK_DAY_ALL'));
  assert.ok(opportunity.sourceLineage.includes('TWSE:T86'));
  assert.equal(calls.length,2);
  for(const call of calls){assert.equal(call.init.method,'GET');assert.equal(call.init.redirect,'error')}
});

test('T86 transport failure removes the TW asset instead of publishing quote-only research',async()=>{
  const {pipeline}=createPipeline(new Map([[flowEndpoint,response({}, {status:503})]]));
  const result=await pipeline.run({nowMs,twAssets:[twAssetConfig()]});
  assert.equal(result.orchestration.published.home.opportunities.TW.length,0);
  assert.equal(result.orchestration.diagnostics.TW[0].status,'UNAVAILABLE');
  assert.equal(result.orchestration.diagnostics.TW[0].reason,'FLOW_HTTP_503');
});

test('quote transport failure removes the TW asset instead of treating institutional flow as sufficient',async()=>{
  const {pipeline}=createPipeline(new Map([[quoteEndpoint,response({}, {status:503})]]));
  const result=await pipeline.run({nowMs,twAssets:[twAssetConfig()]});
  assert.equal(result.orchestration.published.home.opportunities.TW.length,0);
  assert.equal(result.orchestration.diagnostics.TW[0].status,'UNAVAILABLE');
  assert.equal(result.orchestration.diagnostics.TW[0].reason,'QUOTE_HTTP_503');
});

test('T86 target missing is explicit unavailable and another stock is never substituted',async()=>{
  const {pipeline}=createPipeline(new Map([[flowEndpoint,response(flowPayload('2317'))]]));
  const result=await pipeline.run({nowMs,twAssets:[twAssetConfig()]});
  assert.equal(result.orchestration.published.home.opportunities.TW.length,0);
  assert.equal(result.orchestration.diagnostics.TW[0].status,'UNAVAILABLE');
  assert.equal(result.orchestration.diagnostics.TW[0].reason,'FLOW_ENTITY_NOT_FOUND');
});

test('forbidden T86 endpoint is rejected during preflight before any network request',async()=>{
  let calls=0;
  const service=createStagingHomeService();
  const pipeline=createStagingSourcePipeline({fetchImpl:async()=>{calls++;return response({})},clock:()=>nowMs,publishHome:service.publishHome});
  const bad=twAssetConfig({flowEndpoint:'https://example.com/T86?date=20260909'});
  await assert.rejects(()=>pipeline.run({nowMs,twAssets:[bad]}),/SOURCE_ENDPOINT_FORBIDDEN/);
  assert.equal(calls,0);
});

test('TW asset policy is caller supplied and missing policy is rejected rather than defaulted',async()=>{
  const {pipeline}=createPipeline();
  const bad=twAssetConfig({policy:undefined});
  await assert.rejects(()=>pipeline.run({nowMs,twAssets:[bad]}),/EVIDENCE_POLICY_INVALID|POLICY/);
});
