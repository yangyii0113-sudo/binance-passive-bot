'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../v12/ui/home_renderer.js');

const asOf=Date.parse('2026-09-09T08:30:00Z');
const regions=['US','TW','CN_HK','JP','KR','EU','CRYPTO'];

function taiwanData({partial=false}={}){
  return Object.freeze({
    directionCoverage:partial?'PARTIAL':'COMPLETE',
    industryCoverage:partial?'PARTIAL':'COMPLETE',
    missingSources:Object.freeze(partial?['TPEX_MARKET_CORE','TPEX_INDUSTRY_TURNOVER']:[]),
    taiex:Object.freeze({close:25500,change:250,changePct:.99}),
    otc:partial?null:Object.freeze({close:300,change:3,changePct:1.01}),
    breadth:Object.freeze({
      twse:Object.freeze({advancers:700,decliners:200,unchanged:50,limitUp:20,limitDown:3,advanceDeclineRatio:3.5}),
      tpex:partial?null:Object.freeze({advancers:600,decliners:200,unchanged:50,limitUp:18,limitDown:4,advanceDeclineRatio:3}),
      combined:partial?null:Object.freeze({advancers:1300,decliners:400,unchanged:100,limitUp:38,limitDown:7,advanceDeclineRatio:3.25})
    }),
    industries:Object.freeze({
      twseLeaders:Object.freeze([Object.freeze({name:'半導體類',changePct:2}),Object.freeze({name:'電機機械類',changePct:.9})]),
      twseLaggards:Object.freeze([Object.freeze({name:'鋼鐵類',changePct:-.8})]),
      tpexTurnoverLeaders:Object.freeze(partial?[]:[Object.freeze({name:'電子零組件業',tradeWeightPct:50.11}),Object.freeze({name:'半導體業',tradeWeightPct:14.84})])
    })
  });
}

function viewModel({partial=false}={}){
  return Object.freeze({
    schemaVersion:'foxyya-home-view-model/1',asOf,researchOnly:true,executionWrite:false,
    regions:Object.freeze(regions.map(region=>Object.freeze({region,bias:region==='TW'&&!partial?'BULLISH':'UNAVAILABLE',confidence:region==='TW'&&!partial?.82:0,status:region==='TW'?'AVAILABLE':'UNAVAILABLE',asOf,facts:Object.freeze([]),lineageRef:null}))),
    marketPulse:Object.freeze([
      Object.freeze({market:'CRYPTO',status:'UNAVAILABLE',stateLabel:'UNAVAILABLE',asOf:null,data:null}),
      Object.freeze({market:'US',status:'UNAVAILABLE',stateLabel:'UNAVAILABLE',asOf:null,data:null}),
      Object.freeze({market:'TW',status:'AVAILABLE',stateLabel:partial?'UNAVAILABLE':'BROAD_ADVANCE',asOf,data:taiwanData({partial})})
    ]),
    earlyTrend:Object.freeze([]),
    opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([]),TW:Object.freeze([])}),
    events:Object.freeze([])
  });
}

test('Taiwan market pulse renders broad advance in Traditional Chinese with index breadth and sector evidence',()=>{
  const out=R.renderHomeSections(viewModel());
  const html=out.marketPulseHtml;
  const twHtml=html.slice(html.indexOf('data-market-pulse="TW"'));
  assert.match(twHtml,/廣泛上漲/);
  assert.doesNotMatch(twHtml,/BROAD_ADVANCE/);
  assert.match(twHtml,/加權指數/);
  assert.match(twHtml,/25,500/);
  assert.match(twHtml,/0\.99%/);
  assert.match(twHtml,/櫃買指數/);
  assert.match(twHtml,/300/);
  assert.match(twHtml,/1\.01%/);
  assert.match(twHtml,/上漲家數/);
  assert.match(twHtml,/1,300/);
  assert.match(twHtml,/下跌家數/);
  assert.match(twHtml,/400/);
  assert.match(twHtml,/A\/D 比/);
  assert.match(twHtml,/3\.25/);
  assert.match(twHtml,/強勢類股/);
  assert.match(twHtml,/半導體類/);
  assert.match(twHtml,/弱勢類股/);
  assert.match(twHtml,/鋼鐵類/);
  assert.match(twHtml,/上櫃成交集中/);
  assert.match(twHtml,/電子零組件業/);
  assert.match(twHtml,/50\.11%/);
  assert.match(twHtml,/成交比重，不代表類股漲跌幅/);
  assert.doesNotMatch(twHtml,/市場指數資料仍待補齊/);
});

test('Taiwan market partial coverage keeps TAIEX visible and explicitly refuses a whole-market direction call',()=>{
  const out=R.renderHomeSections(viewModel({partial:true}));
  const html=out.marketPulseHtml;
  assert.match(html,/部分資料可用，暫不判斷全台股方向/);
  assert.match(html,/加權指數/);
  assert.match(html,/25,500/);
  assert.match(html,/上市上漲/);
  assert.match(html,/700/);
  assert.match(html,/上市下跌/);
  assert.match(html,/200/);
  assert.doesNotMatch(html,/櫃買指數[^<]*300/);
});

test('Taiwan region card reflects market-core availability and removes obsolete missing-index copy',()=>{
  const full=R.renderHomeSections(viewModel()).regionsHtml;
  assert.match(full,/台股大盤與市場廣度已接入/);
  assert.match(full,/加權\/櫃買/);
  assert.doesNotMatch(full,/仍缺台股大盤指數、漲跌家數與市場廣度/);

  const partial=R.renderHomeSections(viewModel({partial:true})).regionsHtml;
  assert.match(partial,/台股市場資料部分可用/);
  assert.match(partial,/暫不判斷全台股方向/);
});
