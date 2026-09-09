'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Home=require('../v12/read_model/home_snapshot.js');
const VM=require('../v12/ui/home_view_model.js');
const Renderer=require('../v12/ui/home_renderer.js');

const asOf=Date.parse('2026-09-09T06:30:00Z');
function execution(){return Object.freeze({
  schema:'foxyya-v12-crypto-execution-read/1',paperOnly:true,realOrderLock:true,readOnly:true,
  strategyVersion:'FOXYYA-EXEC-V2-20260908',cycleCount:9,ledgerIntegrity:true,health:'HEALTHY',asOf,ledgerEvents:12,
  candidates:Object.freeze([{symbol:'ETHUSDT',family:'A',side:'LONG',status:'ARMED'}]),
  pending:Object.freeze([{symbol:'BTCUSDT',family:'B',side:'SHORT',status:'PENDING_INTENT'}]),
  openPositions:Object.freeze([{symbol:'SOLUSDT',family:'C',side:'LONG',status:'OPEN',closed:false,entry_price:200}]),
  closedTrades:Object.freeze([{symbol:'ETHUSDT',family:'A',side:'LONG',closed:true,net_pnl_usdt:120,realized_r:1.2,fees_usdt:4,funding_usdt:1}]),
  books:Object.freeze({'5x':{}}),diagnostics:Object.freeze({qualified_24h:2,filled_24h:1})
});}
function read(){return Home.buildHomeReadModel({
  asOf,cryptoExecution:execution(),twAssets:[],usAssets:[],regionalContexts:{},
  pulses:{},todayFocus:[],providerDiagnostics:null,
  events:[
    {kind:'CALENDAR',id:'c1',title:'Consumer Price Index',source:'BLS',asOf:asOf+3600000,impact:'EXTREME',status:'LIVE_SOURCE',description:'scheduled release'},
    {kind:'NEWS',id:'n1',title:'Fed statement',source:'Federal Reserve',asOf:asOf-1800000,impact:'HIGH',summary:'policy statement',tags:['MACRO'],assets:[]}
  ]
});}

test('Home read model preserves validated Crypto execution and derives completed paper trading results',()=>{
  const out=read();
  assert.equal(out.cryptoExecution.paperOnly,true);
  assert.equal(out.cryptoExecution.realOrderLock,true);
  assert.equal(out.cryptoExecution.readOnly,true);
  assert.equal(out.cryptoExecution.pending.length,1);
  assert.equal(out.cryptoExecution.openPositions.length,1);
  assert.equal(out.cryptoResults.type,'TRADING_RESULTS');
  assert.equal(out.cryptoResults.sampleCount,1);
  assert.equal(out.cryptoResults.metrics.winRate,1);
  assert.equal(out.cryptoResults.metrics.netPnl,120);
  assert.equal(out.executionWrite,false);
});

test('view model exposes read-only Positions Results Calendar News and Today Focus without direction inference',()=>{
  const vm=VM.buildHomeViewModel(read());
  assert.equal(vm.positions.paperOnly,true);
  assert.equal(vm.positions.pending.length,1);
  assert.equal(vm.positions.open.length,1);
  assert.equal(vm.tradingResults.sampleCount,1);
  assert.equal(vm.calendar.length,1);
  assert.equal(vm.news.length,1);
  assert.ok(vm.todayFocus.length>=1);
  for(const row of [...vm.calendar,...vm.news,...vm.todayFocus]){
    assert.equal(Object.hasOwn(row,'direction'),false);
    assert.equal(Object.hasOwn(row,'side'),false);
    assert.equal(Object.hasOwn(row,'bias'),false);
  }
});

test('renderer produces usable operational sections while keeping every execution surface read-only',()=>{
  const plan=Renderer.renderHomeSections(VM.buildHomeViewModel(read()));
  assert.match(plan.positionsHtml,/BTCUSDT/);
  assert.match(plan.positionsHtml,/SOLUSDT/);
  assert.match(plan.positionsHtml,/PAPER ONLY/);
  assert.match(plan.tradingResultsHtml,/120/);
  assert.match(plan.calendarHtml,/Consumer Price Index/);
  assert.match(plan.newsHtml,/Fed statement/);
  assert.match(plan.todayFocusHtml,/Consumer Price Index|Fed statement/);
  const text=JSON.stringify(plan).toUpperCase();
  assert.equal(/PLACEORDER|SUBMITORDER|AUTHORIZEEXECUTION|>BUY<|>SELL</.test(text),false);
});