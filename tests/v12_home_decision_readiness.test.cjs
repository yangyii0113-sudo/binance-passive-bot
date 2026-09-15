'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildHomeViewModel}=require('../v12/ui/home_view_model.js');

const asOf=Date.parse('2026-09-15T09:30:00Z');
const regions=['US','TW','CN_HK','JP','KR','EU','CRYPTO'];
function opportunity(market,instrumentId,confidence){return Object.freeze({market,instrumentId,asOf:asOf-1000,researchOnly:true,executionWrite:false,facts:Object.freeze([]),dataGaps:Object.freeze({}),research:Object.freeze({direction:'POSITIVE',confidence,missingDimensions:Object.freeze([]),contradictions:Object.freeze([])}),earlyTrend:Object.freeze({stage:'READY'}),sourceLineage:Object.freeze([])});}
function marketRow({coverageStatus='BLOCKED',directionReadiness='NOT_READY',researchReadiness='NOT_READY',rankingEligibility='NOT_ELIGIBLE',missingCapabilities=[],blockers=[]}={}){return Object.freeze({coverageStatus,directionReadiness,researchReadiness,rankingEligibility,missingCapabilities:Object.freeze(missingCapabilities),blockers:Object.freeze(blockers),researchOnly:true,executionWrite:false});}
function coverage(usEligibility='NOT_ELIGIBLE'){
  return Object.freeze({schemaVersion:'foxyya-market-coverage/1',asOf,researchOnly:true,executionWrite:false,markets:Object.freeze({
    US:marketRow({researchReadiness:usEligibility==='NOT_ELIGIBLE'?'NOT_READY':'PARTIAL',rankingEligibility:usEligibility,missingCapabilities:['QUOTE'],blockers:[Object.freeze({type:'API_KEY_REQUIRED',capability:'QUOTE',sourceId:'twelve-data-us-quote',reason:'SOURCE_ACTIVATION_REQUIRES_API_KEY',externalActionRequired:true,userFacingLabel:'需要 API 金鑰'})]}),
    TW:marketRow({coverageStatus:'READY',directionReadiness:'READY',researchReadiness:'READY',rankingEligibility:'ELIGIBLE'}),
    CN_HK:marketRow(),JP:marketRow(),KR:marketRow(),EU:marketRow(),CRYPTO:marketRow()
  })});
}
function readModel(usEligibility='NOT_ELIGIBLE'){
  return Object.freeze({schemaVersion:'foxyya-home-read-model/1',asOf,researchOnly:true,executionWrite:false,marketCoverage:coverage(usEligibility),home:Object.freeze({schemaVersion:'foxyya-home-model/1',asOf,regions:Object.freeze(regions.map(region=>Object.freeze({region,status:'UNAVAILABLE',bias:'UNAVAILABLE',confidence:0,asOf,facts:Object.freeze([])}))),marketPulse:Object.freeze([]),todayFocus:Object.freeze([]),earlyTrend:Object.freeze([]),events:Object.freeze([]),opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([opportunity('US','NASDAQ:NVDA',.95)]),TW:Object.freeze([opportunity('TW','TWSE:2330',.45)])})})});
}

test('Home preserves backend marketCoverage and exposes immutable decisionReadiness without recomputing it',()=>{
  const input=readModel();
  const view=buildHomeViewModel(input);
  assert.strictEqual(view.marketCoverage,input.marketCoverage);
  assert.ok(view.decisionReadiness);
  assert.equal(Object.isFrozen(view.decisionReadiness),true);
  assert.deepEqual(view.decisionReadiness.US,Object.freeze({coverageStatus:'BLOCKED',directionReadiness:'NOT_READY',researchReadiness:'NOT_READY',rankingEligibility:'NOT_ELIGIBLE',missingCapabilities:Object.freeze(['QUOTE']),blockers:input.marketCoverage.markets.US.blockers}));
  assert.equal(view.decisionReadiness.TW.rankingEligibility,'ELIGIBLE');
});

test('NOT_ELIGIBLE market remains inspectable but cannot participate in Home research ranking',()=>{
  const view=buildHomeViewModel(readModel());
  assert.equal(view.opportunities.US.length,1);
  assert.equal(view.opportunities.US[0].instrumentId,'NASDAQ:NVDA');
  assert.equal(view.opportunities.US[0].rank,null);
  assert.equal(view.opportunities.US[0].researchScore,null);
  assert.equal(view.opportunities.US[0].priority,'');
  assert.deepEqual(view.opportunities.US[0].rankingReasons,[]);
  assert.deepEqual(view.opportunities.US[0].rankingComponents,{});
  assert.equal(view.opportunities.US[0].rankingPurpose,'');
  assert.equal(view.opportunities.US[0].catalystEventId,null);
  assert.equal(view.opportunities.TW.length,1);
  assert.equal(view.opportunities.TW[0].rank,1,'eligible TW row ranks independently of ineligible US research');
});

test('LIMITED market may remain in human-review ranking while backend coverage truth remains authoritative',()=>{
  const input=readModel('LIMITED');
  const view=buildHomeViewModel(input);
  assert.equal(view.decisionReadiness.US.rankingEligibility,'LIMITED');
  assert.ok(Number.isInteger(view.opportunities.US[0].rank));
  assert.ok(Number.isFinite(view.opportunities.US[0].researchScore));
  assert.equal(view.marketCoverage.markets.US.rankingEligibility,'LIMITED');
});
