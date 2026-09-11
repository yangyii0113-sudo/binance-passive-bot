'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Ranking=require('../v12/research/ranking.js');
const VM=require('../v12/ui/home_view_model.js');
const Renderer=require('../v12/ui/home_renderer.js');

const nowMs=Date.parse('2026-09-11T03:10:00Z');

function opportunity(overrides={}){
  return Object.freeze({
    market:'TW',instrumentId:'TWSE:2330',asOf:nowMs-30*60*1000,
    facts:Object.freeze([{field:'price.close',value:1200,unit:'TWD',status:'SNAPSHOT',source:'TWSE',observedAt:nowMs-30*60*1000,receivedAt:nowMs-30*60*1000}]),
    dataGaps:Object.freeze({}),
    research:Object.freeze({direction:'POSITIVE',confidence:.78,dimensions:Object.freeze({TREND:'POSITIVE',INSTITUTIONAL:'POSITIVE',FUNDAMENTAL:'POSITIVE'}),missingDimensions:Object.freeze([]),contradictions:Object.freeze([])}),
    earlyTrend:Object.freeze({stage:'CONFIRMING',confidence:.72,nextConfirmation:Object.freeze(['成交量延續']),invalidations:Object.freeze([])}),
    researchOnly:true,executionWrite:false,
    ...overrides
  });
}

function news(overrides={}){
  return Object.freeze({kind:'NEWS',id:'n1',title:'TSMC demand outlook',source:'Reuters',asOf:nowMs-20*60*1000,impact:'HIGH',status:'LIVE_SOURCE',impactScore:82,impactConfidence:.83,freshnessWeight:1,relatedMarkets:Object.freeze(['TW']),relatedAssets:Object.freeze(['TWSE:2330']),topic:'半導體需求',impactRationale:'產業需求可能影響台積電營收與估值預期。',researchOnly:true,executionWrite:false,...overrides});
}

function readModel(opportunities,events=[]){
  return Object.freeze({schemaVersion:'foxyya-home-read-model/1',asOf:nowMs,home:Object.freeze({regions:Object.freeze([]),marketPulse:Object.freeze([]),earlyTrend:Object.freeze([]),opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze(opportunities.filter(x=>x.market==='US')),TW:Object.freeze(opportunities.filter(x=>x.market==='TW'))}),events:Object.freeze(events),todayFocus:Object.freeze([])}),cryptoExecution:null,cryptoResults:null,providerDiagnostics:null,researchOnly:true,executionWrite:false});
}

test('high-confidence confirming research with a fresh asset catalyst ranks above incomplete stale research',()=>{
  const strong=opportunity();
  const weak=opportunity({instrumentId:'TPEX:6488',asOf:nowMs-72*60*60*1000,research:Object.freeze({direction:'UNAVAILABLE',confidence:.35,dimensions:Object.freeze({}),missingDimensions:Object.freeze(['TREND','INSTITUTIONAL','FUNDAMENTAL']),contradictions:Object.freeze([{source:'x',label:'反向證據'}])}),earlyTrend:Object.freeze({stage:'DETECT',confidence:.3,nextConfirmation:Object.freeze([]),invalidations:Object.freeze([])}),dataGaps:Object.freeze({realtimeQuote:'UNAVAILABLE',industry:'UNAVAILABLE'})});
  const ranked=Ranking.rankResearch([weak,strong],[news()],nowMs);
  assert.equal(ranked.length,2);
  assert.equal(ranked[0].instrumentId,'TWSE:2330');
  assert.equal(ranked[0].rank,1);
  assert.ok(ranked[0].researchScore>=70,ranked[0]);
  assert.equal(ranked[0].priority,'優先覆核');
  assert.ok(ranked[0].components.researchConfidence>ranked[1].components.researchConfidence);
  assert.ok(ranked[0].components.newsCatalyst>ranked[1].components.newsCatalyst);
  assert.ok(ranked[0].reasons.some(x=>/新聞催化/.test(x)));
  assert.equal(ranked[0].researchOnly,true);
  assert.equal(ranked[0].executionWrite,false);
  assert.equal(ranked[0].rankingPurpose,'HUMAN_REVIEW');
  assert.doesNotMatch(JSON.stringify(ranked),/"order"|"buy"|"sell"|"positionSize"|"leverage"/i);
});

test('market-level news can contribute a bounded catalyst but asset-specific news scores higher',()=>{
  const row=opportunity();
  const marketOnly=news({relatedAssets:Object.freeze([]),relatedMarkets:Object.freeze(['TW']),impactScore:80});
  const assetSpecific=news({relatedAssets:Object.freeze(['TWSE:2330']),relatedMarkets:Object.freeze(['TW']),impactScore:80});
  const broad=Ranking.scoreResearch(row,[marketOnly],nowMs);
  const specific=Ranking.scoreResearch(row,[assetSpecific],nowMs);
  assert.ok(specific.components.newsCatalyst>broad.components.newsCatalyst,{broad:broad.components.newsCatalyst,specific:specific.components.newsCatalyst});
  assert.ok(specific.components.newsCatalyst<=15);
});

test('invalidated Early Trend and contradictions reduce ranking without changing research direction',()=>{
  const normal=Ranking.scoreResearch(opportunity(),[],nowMs);
  const invalidated=Ranking.scoreResearch(opportunity({earlyTrend:Object.freeze({stage:'INVALIDATED',confidence:.7,nextConfirmation:Object.freeze([]),invalidations:Object.freeze(['跌破結構'])}),research:Object.freeze({direction:'POSITIVE',confidence:.78,dimensions:Object.freeze({TREND:'POSITIVE'}),missingDimensions:Object.freeze([]),contradictions:Object.freeze([{source:'flow',label:'法人轉賣'}])})}),[],nowMs);
  assert.ok(invalidated.researchScore<normal.researchScore);
  assert.equal(invalidated.direction,'POSITIVE');
  assert.ok(invalidated.components.penalty<0);
});

test('Home view assigns one global human-review rank across US and TW and sorts each market by rank',()=>{
  const tw=opportunity();
  const us=opportunity({market:'US',instrumentId:'NASDAQ:NVDA',research:Object.freeze({direction:'POSITIVE',confidence:.62,dimensions:Object.freeze({TREND:'POSITIVE'}),missingDimensions:Object.freeze(['EXPECTATION']),contradictions:Object.freeze([])}),earlyTrend:Object.freeze({stage:'EARLY_WATCH',confidence:.5,nextConfirmation:Object.freeze([]),invalidations:Object.freeze([])})});
  const tw2=opportunity({instrumentId:'TPEX:6488',research:Object.freeze({direction:'NEUTRAL',confidence:.48,dimensions:Object.freeze({}),missingDimensions:Object.freeze(['TREND','FUNDAMENTAL']),contradictions:Object.freeze([])}),earlyTrend:Object.freeze({stage:'DETECT',confidence:.3,nextConfirmation:Object.freeze([]),invalidations:Object.freeze([])})});
  const view=VM.buildHomeViewModel(readModel([tw2,us,tw],[news()]));
  const all=[...view.opportunities.US,...view.opportunities.TW].sort((a,b)=>a.rank-b.rank);
  assert.deepEqual(all.map(x=>x.rank),[1,2,3]);
  assert.equal(all[0].instrumentId,'TWSE:2330');
  for(const row of all){
    assert.equal(typeof row.researchScore,'number');
    assert.equal(typeof row.priority,'string');
    assert.ok(Array.isArray(row.rankingReasons));
  }
  assert.deepEqual(view.opportunities.TW.map(x=>x.rank),[1,3]);
});

test('Research cards render Chinese rank, score, priority and reasons without trading language',()=>{
  const view=VM.buildHomeViewModel(readModel([opportunity()],[news()]));
  const html=Renderer.renderHomeSections(view).opportunitiesHtml;
  assert.match(html,/研究排名/);
  assert.match(html,/#1/);
  assert.match(html,/研究分數/);
  assert.match(html,/優先覆核/);
  assert.match(html,/排序依據/);
  assert.match(html,/研究可信度|Early Trend|新聞催化|資料完整度/);
  assert.doesNotMatch(html,/建議買進|建議賣出|下單|BUY|SELL/);
});
