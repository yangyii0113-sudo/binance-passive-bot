const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const P=require('../v12/early_trend/evidence_policy.js');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createStagingSourcePipeline}=require('../v12/staging/source_pipeline.js');
const {createDurableResearchHistoryStore}=require('../v12/staging/durable_research_history_store.js');

const quoteEndpoint='https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const revenueEndpoint='https://openapi.twse.com.tw/v1/opendata/t187ap05_L';
const policy=P.freezeEvidencePolicy({
  schemaVersion:'foxyya-evidence-policy/1',id:'tw-durable-history-v1',market:'TW',mode:'RESEARCH_CONTROL',createdAt:1,
  researchOnly:true,executionWrite:false,
  parameters:{institutionalFlow:{fullScaleRatio:0.05},institutionalPersistence:{minSessions:2,fullScaleAverageRatio:0.04},revenueAcceleration:{fullScalePct:20}}
});

function historyFile(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-v12-pipeline-history-'));
  return path.join(dir,'tw.research.jsonl');
}

function response(body,{status=200}={}){
  return {ok:status>=200&&status<300,status,headers:{get(){return 'application/json; charset=utf-8'}},async json(){return body}};
}

function quoteRow({rocDate,close='1215'}={}){
  return {Date:rocDate,Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:close,Change:'+15',TradeVolume:'100000000',TradeValue:'121500000000',Transaction:'50000'};
}

function flowPayload({foreign='12,000,000'}={}){
  return {
    fields:['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'],
    data:[['2330','台積電',foreign,'2,000,000','-500,000','13,500,000']]
  };
}

function revenueRow({rocMonth,yoy='24.07'}={}){
  return {'出表日期':'1150909','資料年月':rocMonth,'公司代號':'2330','公司名稱':'台積電','產業別':'半導體業','營業收入-當月營收':'335,000,000','營業收入-上月營收':'320,000,000','營業收入-去年當月營收':'270,000,000','營業收入-上月比較增減(%)':'4.69','營業收入-去年同月增減(%)':yoy,'累計營業收入-當月累計營收':'2,400,000,000','累計營業收入-去年累計營收':'1,950,000,000','累計營業收入-前期比較增減(%)':'23.08','備註':''};
}

function runConfig({nowMs,rocDate,tradeDate,rocMonth,yoy='24.07'}={}){
  const flowEndpoint=`https://www.twse.com.tw/rwd/zh/fund/T86?date=${tradeDate}&selectType=ALL&response=json`;
  return {
    nowMs,
    flowEndpoint,
    input:{nowMs,twAssets:[{symbol:'2330',quoteEndpoint,flowEndpoint,tradeDate,revenueEndpoint,policy,modelVersion:'foxyya-tw-asset-read-model/1',researchEvidence:[]}]},
    table:new Map([
      [quoteEndpoint,response([quoteRow({rocDate})])],
      [flowEndpoint,response(flowPayload())],
      [revenueEndpoint,response([revenueRow({rocMonth,yoy})])]
    ])
  };
}

function createPipeline({history,config,publishHome}={}){
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(!config.table.has(url))throw Error('unexpected url '+url);
    return config.table.get(url);
  };
  const service=createStagingHomeService();
  const pipeline=createStagingSourcePipeline({fetchImpl,clock:()=>config.nowMs,publishHome:publishHome||service.publishHome,researchHistory:history});
  return {pipeline,calls,service};
}

function journalLines(file){
  if(!fs.existsSync(file))return [];
  return fs.readFileSync(file,'utf8').split('\n').filter(Boolean);
}

test('first successful run uses empty history honestly then persists current revenue and institutional session',async()=>{
  const file=historyFile();
  const history=createDurableResearchHistoryStore({filePath:file});
  const config=runConfig({nowMs:Date.parse('2026-09-09T06:30:00Z'),rocDate:'1150909',tradeDate:'20260909',rocMonth:'11508'});
  const {pipeline}=createPipeline({history,config});
  const result=await pipeline.run(config.input);
  const tw=result.orchestration.published.home.opportunities.TW[0];
  assert.equal(tw.earlyTrend.evidenceFamilyCount,1);
  assert.equal(tw.research.evidence.some(x=>x.dimension==='REVENUE'),false);
  assert.equal(history.previousRevenue('TWSE:2330','2026-09').reportPeriod,'2026-08');
  assert.deepEqual(history.institutionalSessions('TWSE:2330').map(x=>x.quote.tradeDate),['2026-09-09']);
  assert.equal(journalLines(file).length,2);
});

test('restart automatically supplies durable prior revenue and institutional sessions to the next research run',async()=>{
  const file=historyFile();
  const firstHistory=createDurableResearchHistoryStore({filePath:file});
  const first=runConfig({nowMs:Date.parse('2026-09-09T06:30:00Z'),rocDate:'1150909',tradeDate:'20260909',rocMonth:'11508',yoy:'24.07'});
  await createPipeline({history:firstHistory,config:first}).pipeline.run(first.input);

  const restarted=createDurableResearchHistoryStore({filePath:file});
  const second=runConfig({nowMs:Date.parse('2026-10-12T06:30:00Z'),rocDate:'1151012',tradeDate:'20261012',rocMonth:'11509',yoy:'31.00'});
  const result=await createPipeline({history:restarted,config:second}).pipeline.run(second.input);
  const tw=result.orchestration.published.home.opportunities.TW[0];
  assert.equal(tw.research.evidence.some(x=>x.dimension==='REVENUE'),true);
  assert.equal(tw.earlyTrend.evidenceFamilyCount,2);
  assert.equal(tw.earlyTrend.stage,'EARLY_WATCH');
  assert.equal(restarted.previousRevenue('TWSE:2330','2026-10').reportPeriod,'2026-09');
  assert.deepEqual(restarted.institutionalSessions('TWSE:2330').map(x=>x.quote.tradeDate),['2026-09-09','2026-10-12']);
});

test('rerunning an identical successful source cycle is durable-idempotent',async()=>{
  const file=historyFile();
  const history=createDurableResearchHistoryStore({filePath:file});
  const config=runConfig({nowMs:Date.parse('2026-09-09T06:30:00Z'),rocDate:'1150909',tradeDate:'20260909',rocMonth:'11508'});
  await createPipeline({history,config}).pipeline.run(config.input);
  assert.equal(journalLines(file).length,2);
  await createPipeline({history,config}).pipeline.run(config.input);
  assert.equal(journalLines(file).length,2);
});

test('failed Home publish does not advance durable research history',async()=>{
  const file=historyFile();
  const history=createDurableResearchHistoryStore({filePath:file});
  const config=runConfig({nowMs:Date.parse('2026-09-09T06:30:00Z'),rocDate:'1150909',tradeDate:'20260909',rocMonth:'11508'});
  const {pipeline}=createPipeline({history,config,publishHome(){throw Error('PUBLISH_FAIL')}});
  await assert.rejects(()=>pipeline.run(config.input),/PUBLISH_FAIL/);
  assert.equal(history.previousRevenue('TWSE:2330','2026-09'),null);
  assert.deepEqual(history.institutionalSessions('TWSE:2330'),[]);
  assert.equal(journalLines(file).length,0);
});

test('durable history mode forbids caller supplied previousRevenue or institutionalSessions before network access',async()=>{
  const file=historyFile();
  const history=createDurableResearchHistoryStore({filePath:file});
  const config=runConfig({nowMs:Date.parse('2026-09-09T06:30:00Z'),rocDate:'1150909',tradeDate:'20260909',rocMonth:'11508'});
  config.input.twAssets[0].previousRevenue={fake:true};
  let calls=0;
  const service=createStagingHomeService();
  const pipeline=createStagingSourcePipeline({fetchImpl:async()=>{calls++;return response({})},clock:()=>config.nowMs,publishHome:service.publishHome,researchHistory:history});
  await assert.rejects(()=>pipeline.run(config.input),/RESEARCH_HISTORY_OVERRIDE_FORBIDDEN/);
  assert.equal(calls,0);
});
