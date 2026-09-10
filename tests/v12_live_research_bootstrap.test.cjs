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

function response(status,body){
  return {ok:status>=200&&status<300,status,headers:{get(name){return String(name).toLowerCase()==='content-type'?'application/json; charset=utf-8':null;}},async json(){return body;}};
}
function twQuoteRow(){return {Date:'1150909',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'100000000',TradeValue:'121500000000',Transaction:'50000'};}
function twFlowPayload(){return {fields:['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'],data:[['2330','台積電','4000000','1000000','-250000','4750000']]};}
function revenueRow(){return {'出表日期':'1150909','資料年月':'11508','公司代號':'2330','公司名稱':'台積電','產業別':'半導體業','營業收入-當月營收':'80000000','營業收入-上月營收':'75000000','營業收入-去年當月營收':'65000000','營業收入-上月比較增減(%)':'6.67','營業收入-去年同月增減(%)':'23.08','累計營業收入-當月累計營收':'550000000','累計營業收入-去年累計營收':'460000000','累計營業收入-前期比較增減(%)':'19.57','備註':''};}
function tpQuoteRow(){return {Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶',Open:'455.5',High:'470',Low:'452',Close:'468',Change:'12.5',TradingShares:'100000000',TransactionAmount:'46800000000',TransactionNumber:'83000'};}
function tpFlowRow(){return {Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶','Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference':'4000000','SecuritiesInvestmentTrustCompanies-Difference':'1000000','Dealers-Difference':'-250000','TotalDifference':'4750000'};}
function secPayload(){return {cik:'1045810',facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{label:'Revenue',description:'Revenue',units:{USD:[{val:30000000000,accn:'0001',form:'10-Q',filed:'2026-08-20',start:'2026-05-01',end:'2026-07-31',fy:2026,fp:'Q2'}]}}}}};}
function blsPayload(seriesID,value){return {status:'REQUEST_SUCCEEDED',message:[],Results:{series:[{seriesID,data:[{year:'2026',period:'M08',periodName:'August',latest:'true',value:String(value)}]}]}};}
function ecbPayload(value){return [{TIME_PERIOD:'2026-08',OBS_VALUE:String(value),OBS_STATUS:'A'}];}

function fixtures(input){
  const table=new Map([
    [input.twAssets[0].quoteEndpoint,response(200,[twQuoteRow()])],
    [input.twAssets[0].flowEndpoint,response(200,twFlowPayload())],
    [input.twAssets[0].revenueEndpoint,response(200,[revenueRow()])],
    [input.twAssets[1].quoteEndpoint,response(200,[tpQuoteRow()])],
    [input.twAssets[1].flowEndpoint,response(200,[tpFlowRow()])],
    [input.usAssets[0].sec.endpoint,response(200,secPayload())]
  ]);
  const blsValues={CUUR0000SA0:'326.5',LNS14000000:'4.2',CES0000000001:'159500'};
  for(const item of input.regions.US.bls){
    const seriesID=Object.keys(item.definitions)[0];
    table.set(item.endpoint,response(200,blsPayload(seriesID,blsValues[seriesID])));
  }
  const ecbValues=['2.1','2.15','2.00'];
  input.regions.EU.ecb.forEach((item,index)=>table.set(item.endpoint,response(200,ecbPayload(ecbValues[index]))));
  return table;
}

test('default research bootstrap uses only approved official read-only sources and current Taipei trade date',()=>{
  const input=Bootstrap.buildBootstrapInput(nowMs);
  assert.equal(input.nowMs,nowMs);
  assert.equal(input.twAssets[0].symbol,'2330');
  assert.equal(input.twAssets[0].tradeDate,'20260909');
  assert.equal(input.twAssets[1].exchange,'TPEX');
  assert.equal(input.twAssets[1].symbol,'6488');
  assert.equal(input.usAssets[0].instrument.instrumentId,'NASDAQ:NVDA');
  assert.equal(input.crypto,undefined);
  assert.equal(input.usAssets[0].realtimeQuoteAvailable,false);
  assert.equal(input.usAssets[0].consensusAvailable,false);
  assert.equal(input.usAssets[0].optionsAvailable,false);
  assert.deepEqual(input.usAssets[0].researchEvidence,[]);
  assert.deepEqual(input.usAssets[0].earlyEvidence,[]);
  assert.equal(input.regions.US.bls.length,3);
  assert.equal(input.regions.EU.ecb.length,3);

  const endpoints=[
    ...input.twAssets.flatMap(x=>[x.quoteEndpoint,x.flowEndpoint,x.revenueEndpoint].filter(Boolean)),
    ...input.usAssets.map(x=>x.sec.endpoint),
    ...input.regions.US.bls.map(x=>x.endpoint),
    ...input.regions.EU.ecb.map(x=>x.endpoint)
  ];
  for(const endpoint of endpoints){
    const url=new URL(endpoint);
    assert.equal(url.protocol,'https:');
    assert.ok(['openapi.twse.com.tw','www.twse.com.tw','www.tpex.org.tw','data.sec.gov','api.bls.gov','data-api.ecb.europa.eu'].includes(url.hostname),url.hostname);
  }
  const text=JSON.stringify(input).toLowerCase();
  assert.doesNotMatch(text,/apikey|password|authorization|bearer|secret/);
});

test('one bootstrap run publishes traceable TW US and regional research without execution authority',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-live-bootstrap-'));
  const lineageFile=path.join(dir,'bootstrap.lineage.jsonl');
  try{
    const input=Bootstrap.buildBootstrapInput(nowMs);
    const table=fixtures(input);
    const calls=[];
    const fetchImpl=async(url,init)=>{calls.push({url,init});if(!table.has(url))throw Error('unexpected '+url);return table.get(url)};
    const lineageStore=createDurableSourceLineageStore({filePath:lineageFile,now:()=>nowMs});
    const service=createStagingHomeService({lineageStore});
    const runtime=Bootstrap.createLiveResearchBootstrap({fetchImpl,clock:()=>nowMs,lineageStore,publishHome:service.publishHome});
    const result=await runtime.runOnce();

    assert.equal(result.researchOnly,true);
    assert.equal(result.executionWrite,false);
    assert.equal(result.orchestration.published.home.opportunities.TW.length,2);
    assert.equal(result.orchestration.published.home.opportunities.US.length,1);
    const tw=result.orchestration.published.home.opportunities.TW[0];
    const us=result.orchestration.published.home.opportunities.US[0];
    assert.match(tw.lineageRef,/^out_[a-f0-9]{64}$/);
    assert.match(us.lineageRef,/^out_[a-f0-9]{64}$/);
    assert.ok(lineageStore.traceOutput(tw.lineageRef));
    assert.ok(lineageStore.traceOutput(us.lineageRef));
    const usRegion=result.orchestration.published.home.regions.find(x=>x.region==='US');
    const euRegion=result.orchestration.published.home.regions.find(x=>x.region==='EU');
    assert.equal(usRegion.status,'AVAILABLE');
    assert.equal(euRegion.status,'AVAILABLE');
    assert.equal(usRegion.facts.length,3);
    assert.equal(euRegion.facts.length,3);
    assert.equal(calls.length,12);
    for(const call of calls){assert.equal(call.init.method,'GET');assert.equal(call.init.redirect,'error')}
    assert.deepEqual(Object.keys(runtime),['runOnce']);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});