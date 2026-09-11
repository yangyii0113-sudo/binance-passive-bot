'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {createHomeSnapshotStore}=require('../v12/staging/read_api.js');
const {createHomeSnapshotPublisher}=require('../v12/staging/home_publisher.js');
const VM=require('../v12/ui/home_view_model.js');
const Renderer=require('../v12/ui/home_renderer.js');

const asOf=Date.parse('2026-09-11T04:00:00Z');
function emptyInput(){return {asOf,twAssets:[],usAssets:[],regionEvidence:{},regionalContexts:{},pulses:{},events:[],todayFocus:[]};}
function summary(){return Object.freeze({schemaVersion:'foxyya-forward-research-results/1',type:'RESEARCH_RESULTS',validationMode:'FORWARD_ONLY',market:'TW',asOf,source:'FOXYYA_FORWARD_RESEARCH_LEDGER',sampleCount:12,horizons:Object.freeze({'1D':Object.freeze({sampleCount:12,hitRate:.583333333333,meanDirectionalReturnPct:.0125,meanMfePct:.031,meanMaePct:-.018,sampleStatus:'SAMPLE_INSUFFICIENT'}),'5D':Object.freeze({sampleCount:7,hitRate:.571428571429,meanDirectionalReturnPct:.028,meanMfePct:.064,meanMaePct:-.032,sampleStatus:'SAMPLE_INSUFFICIENT'}),'20D':Object.freeze({sampleCount:2,hitRate:.5,meanDirectionalReturnPct:.041,meanMfePct:.12,meanMaePct:-.07,sampleStatus:'SAMPLE_INSUFFICIENT'})}),regimes:Object.freeze({BROAD_ADVANCE:Object.freeze({state:'BROAD_ADVANCE',label:'廣泛上漲',sampleCount:6,horizons:Object.freeze({'1D':Object.freeze({sampleCount:6,hitRate:.666666666667,meanDirectionalReturnPct:.02,meanMfePct:.04,meanMaePct:-.015,sampleStatus:'SAMPLE_INSUFFICIENT'}),'5D':Object.freeze({sampleCount:4,hitRate:.75,meanDirectionalReturnPct:.04,meanMfePct:.08,meanMaePct:-.025,sampleStatus:'SAMPLE_INSUFFICIENT'}),'20D':Object.freeze({sampleCount:1,hitRate:1,meanDirectionalReturnPct:.1,meanMfePct:.14,meanMaePct:-.03,sampleStatus:'SAMPLE_INSUFFICIENT'})})})}),researchOnly:true,executionWrite:false});}

test('Home publisher attaches durable forward research performance without mixing it into trading results',()=>{
  const homeStore=createHomeSnapshotStore();
  const tracker={ingest(read){assert.equal(read.schemaVersion,'foxyya-home-read-model/1');return Object.freeze({tw:Object.freeze({status:'FORWARD_TRACKING',created:0,sessionsRecorded:0,invalidSnapshots:0,activeTracks:3,summary:summary()}),us:Object.freeze({status:'WAITING_LEGAL_DATA_SOURCE',created:0,reason:'US_DAILY_PRICE_SOURCE_NOT_ACTIVATED'}),researchOnly:true,executionWrite:false});}};
  const publisher=createHomeSnapshotPublisher({homeStore,forwardResearchTracker:tracker});
  const read=publisher.publish(emptyInput());
  assert.equal(read.researchPerformance.schemaVersion,'foxyya-research-performance-read/1');
  assert.equal(read.researchPerformance.tw.summary.market,'TW');
  assert.equal(read.researchPerformance.tw.summary.horizons['1D'].sampleCount,12);
  assert.equal(read.researchPerformance.us.status,'WAITING_LEGAL_DATA_SOURCE');
  assert.equal(read.researchPerformance.researchOnly,true);
  assert.equal(read.researchPerformance.executionWrite,false);
  assert.equal(read.cryptoResults,null);
});

test('Home view preserves forward performance and Results renderer shows TW metrics plus explicit US data-source wait state',()=>{
  const homeStore=createHomeSnapshotStore();
  const publisher=createHomeSnapshotPublisher({homeStore,forwardResearchTracker:{ingest(){return Object.freeze({tw:Object.freeze({status:'FORWARD_TRACKING',created:0,sessionsRecorded:0,invalidSnapshots:0,activeTracks:3,summary:summary()}),us:Object.freeze({status:'WAITING_LEGAL_DATA_SOURCE',created:0,reason:'US_DAILY_PRICE_SOURCE_NOT_ACTIVATED'}),researchOnly:true,executionWrite:false});}}});
  const view=VM.buildHomeViewModel(publisher.publish(emptyInput()));
  assert.equal(view.researchPerformance.tw.summary.horizons['1D'].sampleCount,12);
  assert.equal(view.researchPerformance.us.status,'WAITING_LEGAL_DATA_SOURCE');
  const html=Renderer.renderHomeSections(view).researchPerformanceHtml;
  for(const text of ['台股前瞻追蹤','+1 日','+5 日','+20 日','命中率','平均方向報酬','最大有利變動（MFE）','最大不利變動（MAE）','樣本不足','市場環境分層','廣泛上漲','美股前瞻追蹤','等待合法價格資料來源'])assert.match(html,new RegExp(text.replace(/[()+]/g,'\\$&')));
  assert.match(html,/58%/);
  assert.match(html,/12/);
  assert.doesNotMatch(html,/Win Rate|勝率|交易勝率/,'research performance must not be presented as trading win rate');
});

test('publisher without a forward tracker remains backward-compatible and renders an explicit unavailable research-performance state',()=>{
  const homeStore=createHomeSnapshotStore();
  const publisher=createHomeSnapshotPublisher({homeStore});
  const view=VM.buildHomeViewModel(publisher.publish(emptyInput()));
  assert.equal(view.researchPerformance.status,'UNAVAILABLE');
  const html=Renderer.renderHomeSections(view).researchPerformanceHtml;
  assert.match(html,/前瞻研究績效尚未啟用/);
});
