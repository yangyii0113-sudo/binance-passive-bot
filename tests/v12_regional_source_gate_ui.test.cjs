'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Renderer=require('../v12/ui/home_renderer.js');

function view(){
  const regions=['US','TW','CN_HK','JP','KR','EU','CRYPTO'].map(region=>Object.freeze({region,bias:'UNAVAILABLE',confidence:0,status:'UNAVAILABLE',asOf:null,facts:Object.freeze([]),lineageRef:null}));
  return Object.freeze({
    schemaVersion:'foxyya-home-view-model/1',asOf:Date.parse('2026-09-11T05:30:00Z'),
    providerDiagnostics:null,regions:Object.freeze(regions),marketPulse:Object.freeze([]),earlyTrend:Object.freeze([]),
    opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([]),TW:Object.freeze([])}),events:Object.freeze([]),calendar:Object.freeze([]),news:Object.freeze([]),todayFocus:Object.freeze([]),
    positions:Object.freeze({status:'UNAVAILABLE'}),tradingResults:null,researchPerformance:Object.freeze({status:'UNAVAILABLE'}),researchOnly:true,executionWrite:false
  });
}

test('regional cards explain the exact legal activation gate instead of generic unavailable copy',()=>{
  const html=Renderer.renderHomeSections(view()).regionsHtml;
  assert.match(html,/J-Quants API V2/);
  assert.match(html,/API Key/);
  assert.match(html,/免費方案.*12 週延遲/);
  assert.match(html,/KRX Data Marketplace OPEN API/);
  assert.match(html,/會員.*API Key/);
  assert.match(html,/HKEX Data Marketplace/);
  assert.match(html,/付費授權/);
  assert.match(html,/EOD/);
  assert.match(html,/尚未接入/);
  assert.doesNotMatch(html,/日本.*可判方向|韓國.*可判方向|中國／香港.*可判方向/s);
});
