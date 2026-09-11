'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Bootstrap=require('../v12/staging/live_research_bootstrap.js');
const {createStagingSourcePipeline}=require('../v12/staging/source_pipeline.js');
const {createStagingHomeService}=require('../v12/staging/home_service.js');

const saturday=Date.parse('2026-09-12T02:00:00Z'); // 10:00 Asia/Taipei, Saturday
function response(status,body){return {ok:status>=200&&status<300,status,headers:{get(){return 'application/json; charset=utf-8'}},async json(){return body}}}
function quote(){return {Date:'1150911',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'100000000',TradeValue:'121500000000',Transaction:'50000'};}
function flow(){return {fields:['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'],data:[['2330','台積電','4000000','1000000','-250000','4750000']]};}

test('TWSE institutional flow follows the latest official quote trade date across weekends instead of querying the calendar date',async()=>{
  const base=Bootstrap.buildBootstrapInput(saturday);
  const asset=base.twAssets[0];
  assert.equal(asset.tradeDate,'20260912');
  assert.equal(typeof asset.flowEndpointForTradeDate,'function');
  const fridayFlow=asset.flowEndpointForTradeDate('20260911');
  assert.match(fridayFlow,/date=20260911/);

  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push(url);
    assert.equal(init.method,'GET');
    if(url===asset.quoteEndpoint)return response(200,[quote()]);
    if(url===fridayFlow)return response(200,flow());
    if(url===asset.flowEndpoint)throw Error('WEEKEND_T86_DATE_MUST_NOT_BE_USED');
    throw Error('UNEXPECTED_URL:'+url);
  };
  const service=createStagingHomeService();
  const pipeline=createStagingSourcePipeline({fetchImpl,clock:()=>saturday,publishHome:service.publishHome});
  const result=await pipeline.run({
    nowMs:saturday,
    twAssets:[Object.freeze({...asset,revenueEndpoint:undefined})],
    usAssets:[],regions:{},pulses:{},events:[],todayFocus:[]
  });

  assert.ok(calls.includes(fridayFlow));
  assert.ok(!calls.includes(asset.flowEndpoint));
  assert.equal(result.orchestration.diagnostics.TW[0].status,'AVAILABLE');
  assert.equal(result.orchestration.published.home.opportunities.TW.length,1);
  const row=result.orchestration.published.home.opportunities.TW[0];
  const quoteClose=row.facts.find(x=>x.field==='price.close');
  const foreignFlow=row.facts.find(x=>x.field==='flow.foreign_net');
  assert.ok(quoteClose&&foreignFlow);
  assert.equal(quoteClose.observedAt,foreignFlow.observedAt,'quote and flow must describe the same closed trading session');
});
