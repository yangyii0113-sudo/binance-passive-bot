'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../v12/read_model/tw_market_core.js');

const asOf=Date.parse('2026-09-09T08:30:00Z');
const baseBreadth=(advancers,decliners,unchanged=50)=>Object.freeze({advancers,decliners,unchanged,limitUp:10,limitDown:5,untraded:0,advanceDeclineRatio:decliners===0?Infinity:advancers/decliners,participationPct:1});
const twse=(changePct=1.1,advancers=700,decliners=250)=>Object.freeze({market:'TW',venue:'TWSE',tradeDate:'2026-09-09',asOf,taiex:Object.freeze({close:47183.36,change:500,changePct}),breadth:baseBreadth(advancers,decliners),industries:Object.freeze([
  Object.freeze({name:'半導體類',close:800,changePct:2.4}),Object.freeze({name:'電機機械類',close:550,changePct:1.2}),Object.freeze({name:'生技醫療類',close:95,changePct:-2.1}),Object.freeze({name:'鋼鐵類',close:120,changePct:-0.8})
]),observations:Object.freeze([]),researchOnly:true,executionWrite:false});
const tpex=(changePct=1.2,advancers=600,decliners=200)=>{
  const close=400,previous=close/(1+changePct/100),change=close-previous;
  return Object.freeze({market:'TW',venue:'TPEX',tradeDate:'2026-09-09',asOf,otc:Object.freeze({close,change,changePct}),breadth:Object.freeze({...baseBreadth(advancers,decliners),listed:advancers+decliners+50}),observations:Object.freeze([]),researchOnly:true,executionWrite:false});
};
const turnover=()=>Object.freeze({market:'TW',venue:'TPEX',tradeDate:'2026-09-09',asOf,sectors:Object.freeze([
  Object.freeze({name:'電子零組件業',tradeWeightPct:37.1,tradeAmount:100,sharesTraded:20}),
  Object.freeze({name:'半導體業',tradeWeightPct:18.4,tradeAmount:80,sharesTraded:10}),
  Object.freeze({name:'光電業',tradeWeightPct:7.3,tradeAmount:50,sharesTraded:8})
]),observations:Object.freeze([]),researchOnly:true,executionWrite:false});

test('Taiwan Market Core forms BROAD_ADVANCE only when TWSE and TPEx breadth plus index direction confirm',()=>{
  const result=Core.buildTaiwanMarketCore({twse:twse(),tpex:tpex(),tpexIndustryTurnover:turnover(),nowMs:asOf});
  assert.equal(result.schemaVersion,'foxyya-tw-market-core/1');
  assert.equal(result.status,'AVAILABLE');
  assert.equal(result.directionCoverage,'COMPLETE');
  assert.equal(result.industryCoverage,'COMPLETE');
  assert.equal(result.state,'BROAD_ADVANCE');
  assert.ok(result.confidence>0.5&&result.confidence<=1);
  assert.equal(result.data.taiex.changePct,1.1);
  assert.equal(result.data.otc.changePct,1.2);
  assert.deepEqual(result.data.breadth.combined,{advancers:1300,decliners:450,unchanged:100,limitUp:20,limitDown:10,advanceDeclineRatio:1300/450});
  assert.deepEqual(result.data.industries.twseLeaders.map(x=>x.name),['半導體類','電機機械類']);
  assert.deepEqual(result.data.industries.twseLaggards.map(x=>x.name),['生技醫療類','鋼鐵類']);
  assert.deepEqual(result.data.industries.tpexTurnoverLeaders.map(x=>x.name),['電子零組件業','半導體業','光電業']);
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
});

test('opposing index direction or indecisive breadth becomes MIXED rather than forcing a Taiwan market bias',()=>{
  const result=Core.buildTaiwanMarketCore({twse:twse(0.16,607,370),tpex:tpex(-0.92,336,444),tpexIndustryTurnover:turnover(),nowMs:asOf});
  assert.equal(result.status,'AVAILABLE');
  assert.equal(result.directionCoverage,'COMPLETE');
  assert.equal(result.state,'MIXED');
  assert.ok(result.data.breadth.combined.advanceDeclineRatio>1&&result.data.breadth.combined.advanceDeclineRatio<1.25);
});

test('BROAD_DECLINE requires both indices negative and combined advance decline ratio at or below 0.8',()=>{
  const result=Core.buildTaiwanMarketCore({twse:twse(-1.3,200,700),tpex:tpex(-1.1,180,600),nowMs:asOf});
  assert.equal(result.state,'BROAD_DECLINE');
  assert.equal(result.industryCoverage,'PARTIAL');
  assert.equal(result.data.industries.tpexTurnoverLeaders.length,0);
});

test('missing TPEx core keeps valid TWSE data visible but refuses to declare an overall Taiwan direction',()=>{
  const result=Core.buildTaiwanMarketCore({twse:twse(2,800,100),tpex:null,tpexIndustryTurnover:null,nowMs:asOf});
  assert.equal(result.status,'AVAILABLE');
  assert.equal(result.directionCoverage,'PARTIAL');
  assert.equal(result.state,'UNAVAILABLE');
  assert.equal(result.data.taiex.changePct,2);
  assert.equal(result.data.otc,null);
  assert.equal(result.data.breadth.twse.advancers,800);
  assert.equal(result.data.breadth.tpex,null);
  assert.ok(result.missingSources.includes('TPEX_MARKET_CORE'));
});

test('no exchange core data is explicitly UNAVAILABLE and never fabricates zero breadth',()=>{
  const result=Core.buildTaiwanMarketCore({nowMs:asOf});
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.state,'UNAVAILABLE');
  assert.equal(result.directionCoverage,'NONE');
  assert.equal(result.data.taiex,null);
  assert.equal(result.data.otc,null);
  assert.equal(result.data.breadth.combined,null);
});

test('Taiwan Market Core rejects wrong-market or execution-capable inputs',()=>{
  assert.throws(()=>Core.buildTaiwanMarketCore({twse:{...twse(),market:'US'},nowMs:asOf}),/TW_MARKET_INPUT_INVALID/);
  assert.throws(()=>Core.buildTaiwanMarketCore({tpex:{...tpex(),executionWrite:true},nowMs:asOf}),/TW_MARKET_INPUT_INVALID/);
});
