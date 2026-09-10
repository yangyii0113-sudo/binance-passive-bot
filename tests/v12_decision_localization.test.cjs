'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const R=require('../v12/ui/home_renderer.js');

const asOf=Date.parse('2026-09-10T11:30:00Z');
const regionIds=['US','TW','CN_HK','JP','KR','EU','CRYPTO'];
function baseView(overrides={}){
  return Object.freeze({
    schemaVersion:'foxyya-home-view-model/1',asOf,researchOnly:true,executionWrite:false,
    regions:Object.freeze(regionIds.map(region=>Object.freeze({region,bias:'UNAVAILABLE',confidence:0,status:'UNAVAILABLE',asOf,facts:[]}))),
    marketPulse:Object.freeze([]),earlyTrend:Object.freeze([]),events:Object.freeze([]),calendar:Object.freeze([]),news:Object.freeze([]),todayFocus:Object.freeze([]),
    opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([]),TW:Object.freeze([])}),
    positions:Object.freeze({status:'AVAILABLE',paperOnly:true,realOrderLock:true,readOnly:true,health:'HEALTHY',asOf,ledgerIntegrity:true,pending:Object.freeze([]),open:Object.freeze([])}),
    tradingResults:null,
    ...overrides
  });
}

test('首頁產出中文今日決策摘要，並清楚區分策略候選方向與研究方向',()=>{
  const crypto=Object.freeze([
    Object.freeze({market:'CRYPTO',symbol:'ETHUSDT',side:'LONG',family:'A',status:'ARMED',mode:'PAPER READ-ONLY',executionReadOnly:true,executionWrite:false}),
    Object.freeze({market:'CRYPTO',symbol:'BTCUSDT',side:'SHORT',family:'B',status:'REJECTED',mode:'PAPER READ-ONLY',executionReadOnly:true,executionWrite:false})
  ]);
  const us=Object.freeze([Object.freeze({market:'US',instrumentId:'NASDAQ:NVDA',direction:'POSITIVE',earlyStage:'EARLY WATCH',research:Object.freeze({confidence:.68}),facts:Object.freeze([]),dataGaps:Object.freeze({}),researchOnly:true,executionWrite:false})]);
  const tw=Object.freeze([Object.freeze({market:'TW',instrumentId:'TWSE:2330',direction:'NEGATIVE',earlyStage:'CONFIRMING',research:Object.freeze({confidence:.61}),facts:Object.freeze([]),dataGaps:Object.freeze({}),researchOnly:true,executionWrite:false})]);
  const out=R.renderHomeSections(baseView({opportunities:Object.freeze({CRYPTO:crypto,US:us,TW:tw})}));
  assert.equal(typeof out.decisionSummaryHtml,'string');
  assert.match(out.decisionSummaryHtml,/今日決策摘要/);
  assert.match(out.decisionSummaryHtml,/策略候選偏多/);
  assert.match(out.decisionSummaryHtml,/美股研究偏正向/);
  assert.match(out.decisionSummaryHtml,/台股研究偏負向/);
  assert.match(out.decisionSummaryHtml,/資料覆蓋/);
  assert.doesNotMatch(out.decisionSummaryHtml,/DATA AVAILABLE|DATA NOT CONNECTED|Confidence|Candidates/);
});

test('區域情報優先顯示中文方向；有資料但方向不足時寫暫不判斷',()=>{
  const regions=Object.freeze([
    Object.freeze({region:'US',bias:'BULLISH',confidence:.72,status:'AVAILABLE',asOf,facts:Object.freeze([])}),
    Object.freeze({region:'TW',bias:'UNAVAILABLE',confidence:0,status:'UNAVAILABLE',asOf,facts:Object.freeze([])}),
    Object.freeze({region:'CN_HK',bias:'UNAVAILABLE',confidence:0,status:'UNAVAILABLE',asOf,facts:Object.freeze([])}),
    Object.freeze({region:'JP',bias:'UNAVAILABLE',confidence:0,status:'UNAVAILABLE',asOf,facts:Object.freeze([])}),
    Object.freeze({region:'KR',bias:'UNAVAILABLE',confidence:0,status:'UNAVAILABLE',asOf,facts:Object.freeze([])}),
    Object.freeze({region:'EU',bias:'UNAVAILABLE',confidence:0,status:'AVAILABLE',asOf,facts:Object.freeze([{field:'inflation.hicp_yoy',value:1.9,unit:'PCT',status:'SNAPSHOT',source:'ECB',observedAt:asOf,receivedAt:asOf}])}),
    Object.freeze({region:'CRYPTO',bias:'BEARISH',confidence:.64,status:'AVAILABLE',asOf,facts:Object.freeze([])})
  ]);
  const out=R.renderHomeSections(baseView({regions}));
  assert.match(out.regionsHtml,/偏多/);
  assert.match(out.regionsHtml,/偏空/);
  assert.match(out.regionsHtml,/暫不判斷/);
  assert.match(out.regionsHtml,/資料未接入/);
  assert.match(out.regionsHtml,/資料已取得/);
  assert.doesNotMatch(out.regionsHtml,/DATA AVAILABLE|DATA NOT CONNECTED|Source status|Confidence —/);
});

test('交易結果把小樣本 100% 勝率標示為低可信度而非成熟績效',()=>{
  const results=Object.freeze({type:'TRADING_RESULTS',market:'CRYPTO',sampleCount:4,sampleStatus:'SAMPLE_INSUFFICIENT',asOf,metrics:Object.freeze({winRate:1,netPnl:21.4447,expectancyR:1.7891,profitFactor:null,fees:.2859}),trades:Object.freeze([]),readOnly:true,paperOnly:true});
  const out=R.renderHomeSections(baseView({tradingResults:results}));
  assert.match(out.tradingResultsHtml,/樣本數/);
  assert.match(out.tradingResultsHtml,/勝率/);
  assert.match(out.tradingResultsHtml,/淨損益/);
  assert.match(out.tradingResultsHtml,/期望值/);
  assert.match(out.tradingResultsHtml,/樣本不足/);
  assert.match(out.tradingResultsHtml,/可信度低/);
  assert.match(out.tradingResultsHtml,/距離初步判讀還差 26 筆/);
  assert.match(out.tradingResultsHtml,/data-raw-sample-status="SAMPLE_INSUFFICIENT"/,'raw machine status stays traceable for diagnostics');
  const visible=out.tradingResultsHtml.replace(/\sdata-raw-[^=]+="[^"]*"/g,'');
  assert.doesNotMatch(visible,/Samples|Win Rate|Net PnL|Expectancy R|Profit Factor|Fees|SAMPLE_INSUFFICIENT/);
});

test('主要靜態頁面與 Lab 動態介面以繁體中文為主',()=>{
  const html=fs.readFileSync('v12/ui/index.html','utf8');
  const app=fs.readFileSync('v12/ui/app.js','utf8');
  for(const text of ['每日決策台','全球市場狀態','今日焦點','早期趨勢情報','三市場脈動','策略與研究機會','全球風險與事件','市場探索','研究','模擬交易結果','研究結果','全球情報','資料來源診斷'])assert.match(html,new RegExp(text));
  for(const text of ['策略實驗室狀態','執行引擎','候選數','已平倉樣本','樣本狀態','美股研究實驗室','台股研究實驗室','找不到符合項目'])assert.match(app,new RegExp(text));
});
