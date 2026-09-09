'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createDurableSourceLineageStore}=require('../v12/staging/durable_source_lineage_store.js');
const Bootstrap=require('../v12/staging/live_research_bootstrap.js');

const nowMs=Date.parse('2026-09-09T06:30:00Z');
const available=data=>Object.freeze({status:'AVAILABLE',data,researchOnly:true,executionWrite:false});
const unavailable=reason=>Object.freeze({status:'UNAVAILABLE',data:null,reason,researchOnly:true,executionWrite:false});
function response(status,body){return {ok:status>=200&&status<300,status,headers:{get:n=>String(n).toLowerCase()==='content-type'?'application/json; charset=utf-8':null},async json(){return body;}}}
function officialResponse(url){
  if(url.includes('STOCK_DAY_ALL'))return response(200,[{Date:'1150909',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'100000000',TradeValue:'121500000000',Transaction:'50000'}]);
  if(url.includes('/T86?'))return response(200,{fields:['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'],data:[['2330','台積電','4000000','1000000','-250000','4750000']]});
  if(url.includes('t187ap05_L'))return response(200,[{'出表日期':'1150909','資料年月':'11508','公司代號':'2330','公司名稱':'台積電','產業別':'半導體業','營業收入-當月營收':'80000000','營業收入-上月營收':'75000000','營業收入-去年當月營收':'65000000','營業收入-上月比較增減(%)':'6.67','營業收入-去年同月增減(%)':'23.08','累計營業收入-當月累計營收':'550000000','累計營業收入-去年累計營收':'460000000','累計營業收入-前期比較增減(%)':'19.57','備註':''}]);
  if(url.includes('tpex_mainboard_daily_close_quotes'))return response(200,[{Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶',Open:'455.5',High:'470',Low:'452',Close:'468',Change:'12.5',TradingShares:'100000000',TransactionAmount:'46800000000',TransactionNumber:'83000'}]);
  if(url.includes('tpex_3insti_daily_trading'))return response(200,[{Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶','Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference':'4000000','SecuritiesInvestmentTrustCompanies-Difference':'1000000','Dealers-Difference':'-250000','TotalDifference':'4750000'}]);
  if(url.includes('companyfacts'))return response(200,{cik:'1045810',facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{label:'Revenue',description:'Revenue',units:{USD:[{val:30000000000,accn:'0001',form:'10-Q',filed:'2026-08-20',start:'2026-05-01',end:'2026-07-31',fy:2026,fp:'Q2'}]}}}}});
  if(url.includes('api.bls.gov'))return response(200,{status:'REQUEST_SUCCEEDED',message:[],Results:{series:[{seriesID:'CUUR0000SA0',data:[{year:'2026',period:'M08',periodName:'August',latest:'true',value:'326.5'}]}]}});
  if(url.includes('data-api.ecb.europa.eu'))return response(200,[{TIME_PERIOD:'2026-08',OBS_VALUE:'2.1',OBS_STATUS:'A'}]);
  throw Error('unexpected official source '+url);
}
function runtimeRead(){return available(Object.freeze({
  status:Object.freeze({ok:true,paper_only:true,real_order_lock:true,execution_enabled:false,strategy_version:'FOXYYA-EXEC-V2-20260908',cycle_count:9,ledger_integrity:true}),
  snapshot:Object.freeze({schema:'foxyya-runtime-snapshot/1',status:'PAPER_ONLY',real_orders:false,complete:true,served_at:nowMs,ledger_events:9,books:{'5x':{}},candidates:[{symbol:'ETHUSDT',family:'A',side:'LONG',status:'ARMED'}],pending:[],trades:[],diagnostics:{qualified_24h:1,filled_24h:0}})
}));}
function calendarRead(){return available(Object.freeze({schema:'foxyya-calendar/1',status:'LIVE_SOURCE',fetched_at:nowMs,source:'BLS',events:[{time:'2026-09-10T12:30:00Z',title:'Consumer Price Index',description:'scheduled release',source:'BLS',status:'LIVE_SOURCE',impact:'EXTREME'}]}));}
function newsRead(){return available(Object.freeze({schema:'foxyya-news/1',status:'LIVE_SOURCE',fetched_at:nowMs,items:[{title:'Federal Reserve publishes statement',url:'https://example.invalid/fed',summary:'policy statement',published_at:'2026-09-09T05:00:00Z',source:'Federal Reserve',impact:'HIGH',tags:['MACRO'],assets:[]}],errors:[]}));}

function makeBridge(mode='available'){
  const calls={runtime:0,calendar:0,news:0,backtest:0};
  return {calls,bridge:Object.freeze({
    async loadRuntime(){calls.runtime++;return mode==='available'?runtimeRead():unavailable('RUNTIME_DOWN')},
    async loadCalendar(){calls.calendar++;return mode==='available'?calendarRead():unavailable('CALENDAR_DOWN')},
    async loadNews(){calls.news++;return mode==='available'?newsRead():unavailable('NEWS_DOWN')},
    async loadBacktest(){calls.backtest++;return unavailable('NOT_USED_IN_HOME')}
  })};
}

async function run(mode){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-external-bootstrap-'));
  const lineageFile=path.join(dir,'bootstrap.lineage.jsonl');
  const pair=makeBridge(mode);
  const lineageStore=createDurableSourceLineageStore({filePath:lineageFile,now:()=>nowMs});
  const service=createStagingHomeService({lineageStore});
  const runtime=Bootstrap.createLiveResearchBootstrap({fetchImpl:async(url)=>officialResponse(url),clock:()=>nowMs,lineageStore,publishHome:service.publishHome,executionBridge:pair.bridge});
  try{return {result:await runtime.runOnce(),calls:pair.calls}}
  finally{fs.rmSync(dir,{recursive:true,force:true})}
}

test('live bootstrap combines read-only Production runtime calendar and news with official research in one Home publication',async()=>{
  const {result,calls}=await run('available');
  assert.deepEqual(calls,{runtime:1,calendar:1,news:1,backtest:0});
  const home=result.orchestration.published.home;
  const crypto=home.marketPulse.find(x=>x.market==='CRYPTO');
  assert.equal(crypto.status,'AVAILABLE');
  assert.equal(home.opportunities.CRYPTO.length,1);
  assert.equal(home.opportunities.CRYPTO[0].symbol,'ETHUSDT');
  assert.equal(home.opportunities.CRYPTO[0].executionWrite,false);
  assert.equal(home.events.length,2);
  assert.ok(home.events.some(x=>x.kind==='CALENDAR'&&x.title==='Consumer Price Index'));
  assert.ok(home.events.some(x=>x.kind==='NEWS'&&x.title==='Federal Reserve publishes statement'));
  for(const event of home.events){
    assert.equal(Object.hasOwn(event,'direction'),false);
    assert.equal(Object.hasOwn(event,'bias'),false);
    assert.equal(Object.hasOwn(event,'side'),false);
  }
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
});

test('external read failures degrade Crypto and events without blocking TW US research publication',async()=>{
  const {result,calls}=await run('unavailable');
  assert.deepEqual(calls,{runtime:1,calendar:1,news:1,backtest:0});
  const home=result.orchestration.published.home;
  assert.equal(home.marketPulse.find(x=>x.market==='CRYPTO').status,'UNAVAILABLE');
  assert.deepEqual(home.opportunities.CRYPTO,[]);
  assert.deepEqual(home.events,[]);
  assert.ok(home.opportunities.TW.length>=1);
  assert.equal(home.opportunities.US.length,1);
});