const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../v12/early_trend/evidence_policy.js');
const TWSE=require('../v12/providers/twse_adapter.js');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createStagingSourcePipeline}=require('../v12/staging/source_pipeline.js');

const nowMs=Date.parse('2026-09-09T06:30:00Z');
const quoteEndpoint='https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const flowEndpoint='https://www.twse.com.tw/rwd/zh/fund/T86?date=20260909&selectType=ALL&response=json';
const revenueEndpoint='https://openapi.twse.com.tw/v1/opendata/t187ap05_L';
const policy=P.freezeEvidencePolicy({
  schemaVersion:'foxyya-evidence-policy/1',id:'tw-revenue-staging-v1',market:'TW',mode:'RESEARCH_CONTROL',createdAt:1,
  researchOnly:true,executionWrite:false,
  parameters:{institutionalFlow:{fullScaleRatio:0.05},institutionalPersistence:{minSessions:3,fullScaleAverageRatio:0.04},revenueAcceleration:{fullScalePct:20}}
});

function response(body,{status=200}={}){
  return {ok:status>=200&&status<300,status,headers:{get(){return 'application/json; charset=utf-8'}},async json(){return body}};
}

function quotePayload(){
  return [{Date:'1150909',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'100000000',TradeValue:'121500000000',Transaction:'50000'}];
}

function flowPayload(){
  return {
    fields:['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'],
    data:[['2330','台積電','12,000,000','2,000,000','-500,000','13,500,000']]
  };
}

function revenueRow(symbol='2330',rocMonth='11508',yoy='24.07'){
  return {'出表日期':'1150909','資料年月':rocMonth,'公司代號':symbol,'公司名稱':symbol==='2330'?'台積電':'鴻海','產業別':'半導體業','營業收入-當月營收':'335,000,000','營業收入-上月營收':'320,000,000','營業收入-去年當月營收':'270,000,000','營業收入-上月比較增減(%)':'4.69','營業收入-去年同月增減(%)':yoy,'累計營業收入-當月累計營收':'2,400,000,000','累計營業收入-去年累計營收':'1,950,000,000','累計營業收入-前期比較增減(%)':'23.08','備註':''};
}

function previousRevenue(symbol='2330'){
  return TWSE.normalizeMonthlyRevenue(revenueRow(symbol,'11507','12.00'),{receivedAt:Date.parse('2026-08-10T06:00:00Z')});
}

function twAssetConfig(overrides={}){
  return {
    symbol:'2330',quoteEndpoint,flowEndpoint,tradeDate:'20260909',revenueEndpoint,
    previousRevenue:previousRevenue(),policy,institutionalSessions:[],researchEvidence:[],...overrides
  };
}

function createPipeline(tableOverrides=new Map()){
  const calls=[];
  const table=new Map([
    [quoteEndpoint,response(quotePayload())],
    [flowEndpoint,response(flowPayload())],
    [revenueEndpoint,response([revenueRow()])],
    ...tableOverrides
  ]);
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(!table.has(url))throw Error('unexpected url '+url);
    return table.get(url);
  };
  const service=createStagingHomeService();
  const pipeline=createStagingSourcePipeline({fetchImpl,clock:()=>nowMs,publishHome:service.publishHome});
  return {pipeline,calls};
}

test('current official monthly revenue plus prior canonical release adds REVENUE evidence and advances TW early trend',async()=>{
  const {pipeline,calls}=createPipeline();
  const result=await pipeline.run({nowMs,twAssets:[twAssetConfig()]});
  const opportunity=result.orchestration.published.home.opportunities.TW[0];
  assert.equal(result.orchestration.diagnostics.TW[0].status,'AVAILABLE');
  assert.equal(opportunity.instrumentId,'TWSE:2330');
  assert.equal(opportunity.earlyTrend.stage,'EARLY_WATCH');
  assert.equal(opportunity.earlyTrend.evidenceFamilyCount,2);
  const revenueEvidence=opportunity.research.evidence.find(x=>x.dimension==='REVENUE');
  assert.ok(revenueEvidence);
  assert.equal(revenueEvidence.label,'MONTHLY_REVENUE_YOY_ACCELERATION');
  assert.equal(revenueEvidence.metadata.metrics.currentReportPeriod,'2026-08');
  assert.equal(revenueEvidence.metadata.metrics.previousReportPeriod,'2026-07');
  assert.equal(revenueEvidence.metadata.metrics.accelerationPctPoints,12.07);
  assert.ok(opportunity.sourceLineage.includes('TWSE:t187ap05_L'));
  assert.equal(calls.length,3);
});

test('monthly revenue HTTP failure does not destroy a valid quote plus T86 TW research asset',async()=>{
  const {pipeline}=createPipeline(new Map([[revenueEndpoint,response({}, {status:503})]]));
  const result=await pipeline.run({nowMs,twAssets:[twAssetConfig()]});
  const opportunity=result.orchestration.published.home.opportunities.TW[0];
  assert.equal(result.orchestration.diagnostics.TW[0].status,'AVAILABLE');
  assert.equal(opportunity.instrumentId,'TWSE:2330');
  assert.equal(opportunity.earlyTrend.stage,'DETECT');
  assert.equal(opportunity.research.evidence.some(x=>x.dimension==='REVENUE'),false);
  assert.equal(opportunity.sourceLineage.includes('TWSE:t187ap05_L'),true,'prior canonical revenue remains auditable even when current source is unavailable');
});

test('monthly revenue missing target company is optional evidence and never substitutes another company',async()=>{
  const {pipeline}=createPipeline(new Map([[revenueEndpoint,response([revenueRow('2317')])]]));
  const result=await pipeline.run({nowMs,twAssets:[twAssetConfig()]});
  const opportunity=result.orchestration.published.home.opportunities.TW[0];
  assert.equal(result.orchestration.diagnostics.TW[0].status,'AVAILABLE');
  assert.equal(opportunity.instrumentId,'TWSE:2330');
  assert.equal(opportunity.research.evidence.some(x=>x.dimension==='REVENUE'),false);
});

test('current monthly revenue without a prior release is retained in lineage but cannot fabricate acceleration',async()=>{
  const {pipeline}=createPipeline();
  const result=await pipeline.run({nowMs,twAssets:[twAssetConfig({previousRevenue:null})]});
  const opportunity=result.orchestration.published.home.opportunities.TW[0];
  assert.ok(opportunity.sourceLineage.includes('TWSE:t187ap05_L'));
  assert.equal(opportunity.research.evidence.some(x=>x.dimension==='REVENUE'),false);
  assert.equal(opportunity.earlyTrend.evidenceFamilyCount,1);
  assert.equal(opportunity.earlyTrend.stage,'DETECT');
});

test('prior monthly revenue from another instrument is rejected rather than silently ignored',async()=>{
  const {pipeline}=createPipeline();
  await assert.rejects(()=>pipeline.run({nowMs,twAssets:[twAssetConfig({previousRevenue:previousRevenue('2317')})]}),/INSTRUMENT_MISMATCH/);
});

test('forbidden monthly revenue endpoint fails during preflight before any network request',async()=>{
  let calls=0;
  const service=createStagingHomeService();
  const pipeline=createStagingSourcePipeline({fetchImpl:async()=>{calls++;return response({})},clock:()=>nowMs,publishHome:service.publishHome});
  const bad=twAssetConfig({revenueEndpoint:'https://example.com/t187ap05_L'});
  await assert.rejects(()=>pipeline.run({nowMs,twAssets:[bad]}),/SOURCE_ENDPOINT_FORBIDDEN/);
  assert.equal(calls,0);
});
