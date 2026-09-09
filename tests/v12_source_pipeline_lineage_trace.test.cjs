'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Policy=require('../v12/early_trend/evidence_policy.js');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createStagingSourcePipeline}=require('../v12/staging/source_pipeline.js');
const {createDurableSourceLineageStore}=require('../v12/staging/durable_source_lineage_store.js');

const nowMs=Date.parse('2026-09-09T06:30:00Z');
const twQuote='https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const twFlow='https://www.twse.com.tw/rwd/zh/fund/T86?date=20260909&selectType=ALL&response=json';
const twRevenue='https://openapi.twse.com.tw/v1/opendata/t187ap05_L';
const tpQuote='https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
const tpFlow='https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading';
const secEndpoint='https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json';
const blsEndpoint='https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0';
const ecbEndpoint='https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR';

function response(status,body){
  return {ok:status>=200&&status<300,status,headers:{get(name){return String(name).toLowerCase()==='content-type'?'application/json; charset=utf-8':null;}},async json(){return body;}};
}

function twQuoteRow(){return {Date:'1150909',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'100000000',TradeValue:'121500000000',Transaction:'50000'};}
function twFlowPayload(){return {fields:['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'],data:[['2330','台積電','4000000','1000000','-250000','4750000']]};}
function revenueRow(){return {'出表日期':'1150909','資料年月':'11508','公司代號':'2330','公司名稱':'台積電','產業別':'半導體業','營業收入-當月營收':'80000000','營業收入-上月營收':'75000000','營業收入-去年當月營收':'65000000','營業收入-上月比較增減(%)':'6.67','營業收入-去年同月增減(%)':'23.08','累計營業收入-當月累計營收':'550000000','累計營業收入-去年累計營收':'460000000','累計營業收入-前期比較增減(%)':'19.57','備註':''};}
function tpQuoteRow(){return {Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶',Open:'455.5',High:'470',Low:'452',Close:'468',Change:'12.5',TradingShares:'100000000',TransactionAmount:'46800000000',TransactionNumber:'83000'};}
function tpFlowRow(){return {Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶','Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference':'4000000','SecuritiesInvestmentTrustCompanies-Difference':'1000000','Dealers-Difference':'-250000','TotalDifference':'4750000'};}
function secPayload(){return {cik:'1045810',facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{label:'Revenue',description:'Revenue',units:{USD:[{val:30000000000,accn:'0001',form:'10-Q',filed:'2026-08-20',start:'2026-05-01',end:'2026-07-31',fy:2026,fp:'Q2'}]}}}}};}
function blsPayload(){return {status:'REQUEST_SUCCEEDED',message:[],Results:{series:[{seriesID:'CUUR0000SA0',data:[{year:'2026',period:'M08',periodName:'August',latest:'true',value:'326.5'}]}]}};}
function ecbPayload(){return [{TIME_PERIOD:'2026-08',OBS_VALUE:'2.1',OBS_STATUS:'A'}];}

const twPolicy=Policy.freezeEvidencePolicy({
  schemaVersion:'foxyya-evidence-policy/1',id:'tw-lineage-v1',market:'TW',mode:'RESEARCH_CONTROL',createdAt:1,researchOnly:true,executionWrite:false,
  parameters:{institutionalFlow:{fullScaleRatio:0.05},institutionalPersistence:{minSessions:3,fullScaleAverageRatio:0.04},revenueAcceleration:{fullScalePct:20}}
});

function nvda(){return Object.freeze({instrumentId:'NASDAQ:NVDA',exchange:'NASDAQ',symbol:'NVDA',market:'US',region:'US',currency:'USD',timezone:'America/New_York',assetType:'EQUITY'});}

function withTempLineage(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-pipeline-lineage-'));
  const filePath=path.join(dir,'research.lineage.jsonl');
  try{return fn({dir,filePath});}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
}

function tableFetch(table,{advance=false}={}){
  let now=nowMs-1000;
  const calls=[];
  return {
    calls,
    clock:()=>now,
    fetchImpl:async(url,init)=>{
      calls.push({url,init});
      if(!table.has(url))throw Error('unexpected url '+url);
      if(advance)now+=25;
      return table.get(url);
    }
  };
}

function twInput(){
  return {nowMs,twAssets:[{symbol:'2330',tradeDate:'20260909',quoteEndpoint:twQuote,flowEndpoint:twFlow,revenueEndpoint:twRevenue,policy:twPolicy,researchEvidence:[]}]};
}

function assertTraceSafe(trace){
  assert.equal(trace.researchOnly,true);
  assert.equal(trace.executionWrite,false);
  const text=JSON.stringify(trace).toLowerCase();
  assert.doesNotMatch(text,/api.?key|password|authorization|bearer|providerhealth|\"health\"|buy|sell|order|execute|fill|position/);
}

test('TWSE source pipeline publishes a durable output lineage ref that restarts into exact canonical source observations',async()=>{
  await withTempLineage(async({filePath})=>{
    const table=new Map([[twQuote,response(200,[twQuoteRow()])],[twFlow,response(200,twFlowPayload())],[twRevenue,response(200,[revenueRow()])]]);
    const h=tableFetch(table,{advance:true});
    const lineageStore=createDurableSourceLineageStore({filePath,now:()=>nowMs});
    const service=createStagingHomeService();
    const pipeline=createStagingSourcePipeline({fetchImpl:h.fetchImpl,clock:h.clock,publishHome:service.publishHome,lineageStore});
    const result=await pipeline.run(twInput());
    const opportunity=result.orchestration.published.home.opportunities.TW[0];
    assert.match(opportunity.lineageRef,/^out_[a-f0-9]{64}$/);
    const trace=lineageStore.traceOutput(opportunity.lineageRef);
    assert.equal(trace.output.outputType,'TW_RESEARCH');
    assert.equal(trace.output.subjectId,'TWSE:2330');
    assert.deepEqual(trace.sources.map(x=>x.datasetId).sort(),['TWSE:STOCK_DAY_ALL','TWSE:T86','TWSE:t187ap05_L'].sort());
    assert.ok(trace.observations.length>=3);
    assert.ok(trace.observations.every(x=>x.observation.instrumentId==='TWSE:2330'));
    assertTraceSafe(trace);

    const restarted=createDurableSourceLineageStore({filePath,now:()=>nowMs});
    const replayed=restarted.traceOutput(opportunity.lineageRef);
    assert.deepEqual(replayed,trace);
  });
});

test('TPEx lineage remains TPEX identity through Home and durable trace',async()=>{
  await withTempLineage(async({filePath})=>{
    const table=new Map([[tpQuote,response(200,[tpQuoteRow()])],[tpFlow,response(200,[tpFlowRow()])]]);
    const h=tableFetch(table,{advance:true});
    const lineageStore=createDurableSourceLineageStore({filePath,now:()=>nowMs});
    const service=createStagingHomeService();
    const pipeline=createStagingSourcePipeline({fetchImpl:h.fetchImpl,clock:h.clock,publishHome:service.publishHome,lineageStore});
    const result=await pipeline.run({nowMs,twAssets:[{exchange:'TPEX',symbol:'6488',quoteEndpoint:tpQuote,flowEndpoint:tpFlow,policy:twPolicy,researchEvidence:[]}]});
    const opportunity=result.orchestration.published.home.opportunities.TW[0];
    assert.equal(opportunity.instrumentId,'TPEX:6488');
    assert.match(opportunity.lineageRef,/^out_[a-f0-9]{64}$/);
    const trace=lineageStore.traceOutput(opportunity.lineageRef);
    assert.equal(trace.output.subjectId,'TPEX:6488');
    assert.ok(trace.sources.every(x=>x.subjectId==='TPEX:6488'));
    assert.ok(trace.observations.every(x=>x.observation.instrumentId==='TPEX:6488'));
    assert.doesNotMatch(JSON.stringify(trace),/TWSE:6488/);
  });
});

test('US SEC factual research publishes lineage without fabricating a US market-price source',async()=>{
  await withTempLineage(async({filePath})=>{
    const table=new Map([[secEndpoint,response(200,secPayload())]]);
    const h=tableFetch(table,{advance:true});
    const lineageStore=createDurableSourceLineageStore({filePath,now:()=>nowMs});
    const service=createStagingHomeService();
    const pipeline=createStagingSourcePipeline({fetchImpl:h.fetchImpl,clock:h.clock,publishHome:service.publishHome,lineageStore});
    const result=await pipeline.run({nowMs,usAssets:[{instrument:nvda(),sec:{endpoint:secEndpoint,taxonomy:'us-gaap',concept:'RevenueFromContractWithCustomerExcludingAssessedTax',unit:'USD'},researchEvidence:[],earlyEvidence:[]}]});
    const opportunity=result.orchestration.published.home.opportunities.US[0];
    assert.match(opportunity.lineageRef,/^out_[a-f0-9]{64}$/);
    const trace=lineageStore.traceOutput(opportunity.lineageRef);
    assert.equal(trace.output.outputType,'US_RESEARCH');
    assert.equal(trace.output.subjectId,'NASDAQ:NVDA');
    assert.deepEqual(trace.sources.map(x=>x.datasetId),['SEC:companyfacts']);
    assert.ok(trace.observations.every(x=>x.observation.source==='SEC:companyfacts'));
    assert.equal(opportunity.researchOnly,true);
    assert.equal(opportunity.executionWrite,false);
    assert.doesNotMatch(JSON.stringify(trace).toLowerCase(),/realtime.?quote|market.?price/);
  });
});

test('BLS and ECB regional research states carry durable lineage refs to exact context observations',async()=>{
  await withTempLineage(async({filePath})=>{
    const table=new Map([[blsEndpoint,response(200,blsPayload())],[ecbEndpoint,response(200,ecbPayload())]]);
    const h=tableFetch(table,{advance:true});
    const lineageStore=createDurableSourceLineageStore({filePath,now:()=>nowMs});
    const service=createStagingHomeService();
    const pipeline=createStagingSourcePipeline({fetchImpl:h.fetchImpl,clock:h.clock,publishHome:service.publishHome,lineageStore});
    const result=await pipeline.run({nowMs,regions:{
      US:{bls:[{endpoint:blsEndpoint,definitions:{CUUR0000SA0:{entityId:'MACRO:US:CPI',scope:'US',field:'inflation.cpi_index',unit:'INDEX'}}}]},
      EU:{ecb:[{endpoint:ecbEndpoint,definition:{seriesKey:'ICP.M.U2.N.000000.4.ANR',entityId:'MACRO:EU:HICP',scope:'EU',field:'inflation.hicp_yoy',unit:'PCT'}}]}
    }});
    for(const region of ['US','EU']){
      const homeRegion=result.orchestration.published.home.regions.find(x=>x.region===region);
      assert.match(homeRegion.lineageRef,/^out_[a-f0-9]{64}$/);
      const trace=lineageStore.traceOutput(homeRegion.lineageRef);
      assert.equal(trace.output.outputType,'REGIONAL_CONTEXT');
      assert.equal(trace.output.subjectId,'REGION:'+region);
      assert.ok(trace.observations.length>=1);
      assertTraceSafe(trace);
    }
  });
});

test('output lineage is durable before Home publication and lineage failure prevents a dangling Home ref',async()=>{
  await withTempLineage(async({filePath})=>{
    const table=new Map([[secEndpoint,response(200,secPayload())]]);
    const h=tableFetch(table,{advance:true});
    const real=createDurableSourceLineageStore({filePath,now:()=>nowMs});
    const order=[];
    const lineageStore=Object.freeze({
      recordSource(value){order.push('source');return real.recordSource(value);},
      recordOutput(value){order.push('output');return real.recordOutput(value);},
      source:real.source,output:real.output,traceOutput:real.traceOutput
    });
    let published=null;
    const pipeline=createStagingSourcePipeline({fetchImpl:h.fetchImpl,clock:h.clock,lineageStore,publishHome(input){
      order.push('publish');
      const ref=input.usAssets[0].lineageRef;
      assert.ok(real.output(ref),'output must already be durable before publish');
      published=input;
      return Object.freeze({schemaVersion:'foxyya-home-read-model/1',asOf:input.asOf,home:{opportunities:{US:input.usAssets}},researchOnly:true,executionWrite:false});
    }});
    await pipeline.run({nowMs,usAssets:[{instrument:nvda(),sec:{endpoint:secEndpoint,taxonomy:'us-gaap',concept:'RevenueFromContractWithCustomerExcludingAssessedTax',unit:'USD'},researchEvidence:[],earlyEvidence:[]}]});
    assert.ok(published);
    assert.ok(order.indexOf('source')<order.indexOf('output'));
    assert.ok(order.indexOf('output')<order.indexOf('publish'));

    const failing=Object.freeze({recordSource:real.recordSource,recordOutput(){throw Error('DURABLE_WRITE_FAILED')},source:real.source,output:real.output,traceOutput:real.traceOutput});
    let publishCalls=0;
    const h2=tableFetch(table,{advance:true});
    const failedPipeline=createStagingSourcePipeline({fetchImpl:h2.fetchImpl,clock:h2.clock,lineageStore:failing,publishHome(){publishCalls++;throw Error('SHOULD_NOT_PUBLISH')}});
    await assert.rejects(()=>failedPipeline.run({nowMs,usAssets:[{instrument:nvda(),sec:{endpoint:secEndpoint,taxonomy:'us-gaap',concept:'RevenueFromContractWithCustomerExcludingAssessedTax',unit:'USD'},researchEvidence:[],earlyEvidence:[]}]}),/DURABLE_WRITE_FAILED/);
    assert.equal(publishCalls,0);
  });
});

test('lineage store and untraceable manual research inputs fail closed before network access',()=>{
  let calls=0;
  assert.throws(()=>createStagingSourcePipeline({fetchImpl:async()=>{calls++;return response(200,{})},clock:()=>nowMs,publishHome(){},lineageStore:{}}),/LINEAGE_STORE_INVALID/);
  assert.equal(calls,0);

  const noOpStore=Object.freeze({recordSource(){},recordOutput(){},source(){return null},output(){return null},traceOutput(){return null}});
  const pipeline=createStagingSourcePipeline({fetchImpl:async()=>{calls++;return response(200,{})},clock:()=>nowMs,publishHome(){},lineageStore:noOpStore});
  assert.rejects(()=>pipeline.run({nowMs,usAssets:[{instrument:nvda(),sec:{endpoint:secEndpoint,taxonomy:'us-gaap',concept:'RevenueFromContractWithCustomerExcludingAssessedTax',unit:'USD'},researchEvidence:[{dimension:'MOMENTUM'}],earlyEvidence:[]}]}),/LINEAGE_EXTERNAL_EVIDENCE_FORBIDDEN/);
  assert.equal(calls,0);
});
