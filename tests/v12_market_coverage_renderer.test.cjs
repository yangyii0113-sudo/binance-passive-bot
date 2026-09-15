'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Renderer=require('../v12/ui/market_coverage_renderer.js');
const {decoratePreviewIndex}=require('../v12/staging/preview_app.js');

const asOf=Date.parse('2026-09-14T10:30:00Z');
const marketOrder=['CRYPTO','US','TW','CN_HK','JP','KR','EU'];

function row(market,overrides={}){
  return Object.freeze({
    market,
    coverageStatus:'UNAVAILABLE',
    activationState:'NONE',
    directionReadiness:'NOT_READY',
    researchReadiness:'NOT_READY',
    rankingEligibility:'NOT_ELIGIBLE',
    availableCapabilities:Object.freeze([]),
    missingCapabilities:Object.freeze(['INDEX','MARKET_BREADTH']),
    blockers:Object.freeze([Object.freeze({type:'NOT_IMPLEMENTED',capability:'INDEX',sourceId:null,reason:'NO_APPROVED_SOURCE_PATH',externalActionRequired:false,userFacingLabel:'尚未完成程式接線'})]),
    sources:Object.freeze([]),
    freshness:Object.freeze({status:'UNKNOWN',freshestObservedAt:null,freshestReceivedAt:null,oldestRequiredObservedAt:null}),
    evidenceCounts:Object.freeze({providerCount:0,availableDatasetCount:0,unavailableDatasetCount:0,researchInstrumentCount:0,regionalFactCount:0,highImpactEventCount:0}),
    summaryCode:`${market}_UNAVAILABLE`,researchOnly:true,executionWrite:false,
    ...overrides
  });
}

function coverage(){
  return Object.freeze({schemaVersion:'foxyya-market-coverage/1',asOf,researchOnly:true,executionWrite:false,markets:Object.freeze({
    CRYPTO:row('CRYPTO',{coverageStatus:'READY',activationState:'ACTIVE',directionReadiness:'READY',researchReadiness:'NOT_READY',rankingEligibility:'NOT_ELIGIBLE',availableCapabilities:Object.freeze(['REGIME_CLASSIFICATION','EXECUTION_RUNTIME_READ','CANDIDATE_UNIVERSE']),missingCapabilities:Object.freeze([]),blockers:Object.freeze([]),freshness:Object.freeze({status:'FRESH',freshestObservedAt:asOf-1000,freshestReceivedAt:asOf-500,oldestRequiredObservedAt:asOf-1000}),summaryCode:'CRYPTO_READY'}),
    US:row('US',{coverageStatus:'BLOCKED',activationState:'PARTIAL',directionReadiness:'PARTIAL',researchReadiness:'PARTIAL',rankingEligibility:'LIMITED',availableCapabilities:Object.freeze(['FUNDAMENTAL','MACRO']),missingCapabilities:Object.freeze(['INDEX','MARKET_BREADTH','VOLATILITY_CONTEXT','QUOTE']),blockers:Object.freeze([Object.freeze({type:'LICENSE_REVIEW_REQUIRED',capability:'INDEX',sourceId:'nasdaq-eod',reason:'SOURCE_REQUIRES_LICENSE_REVIEW',externalActionRequired:true,userFacingLabel:'授權審查中'})]),summaryCode:'US_BLOCKED'}),
    TW:row('TW',{coverageStatus:'PARTIAL',activationState:'ACTIVE',directionReadiness:'PARTIAL',researchReadiness:'READY',rankingEligibility:'ELIGIBLE',availableCapabilities:Object.freeze(['QUOTE','INSTITUTIONAL_FLOW','INDEX']),missingCapabilities:Object.freeze(['MARKET_BREADTH','SECTOR_ROTATION']),blockers:Object.freeze([Object.freeze({type:'PROVIDER_UNAVAILABLE',capability:'MARKET_BREADTH',sourceId:'twse-market',reason:'RUNTIME_DATASET_UNAVAILABLE',externalActionRequired:false,userFacingLabel:'Provider 本輪失敗'})]),summaryCode:'TW_PARTIAL'}),
    CN_HK:row('CN_HK',{coverageStatus:'BLOCKED',activationState:'BLOCKED',blockers:Object.freeze([Object.freeze({type:'DATA_PRODUCT_REQUIRED',capability:'INDEX',sourceId:'hkex-marketplace',reason:'COMMERCIAL_DATA_PRODUCT_REQUIRED',externalActionRequired:true,userFacingLabel:'需要資料產品'})]),summaryCode:'CN_HK_BLOCKED'}),
    JP:row('JP',{coverageStatus:'BLOCKED',activationState:'BLOCKED',blockers:Object.freeze([Object.freeze({type:'API_KEY_REQUIRED',capability:'INDEX',sourceId:'jpx-jquants',reason:'SOURCE_ACTIVATION_REQUIRES_API_KEY',externalActionRequired:true,userFacingLabel:'需要 API 金鑰'})]),summaryCode:'JP_BLOCKED'}),
    KR:row('KR',{coverageStatus:'BLOCKED',activationState:'BLOCKED',blockers:Object.freeze([Object.freeze({type:'ENTITLEMENT_REQUIRED',capability:'INDEX',sourceId:'krx-openapi',reason:'SOURCE_ACTIVATION_REQUIRES_ENTITLEMENT',externalActionRequired:true,userFacingLabel:'需要資料方案權限'})]),summaryCode:'KR_BLOCKED'}),
    EU:row('EU',{coverageStatus:'BLOCKED',activationState:'PARTIAL',directionReadiness:'PARTIAL',availableCapabilities:Object.freeze(['MACRO']),missingCapabilities:Object.freeze(['INDEX','MARKET_BREADTH']),blockers:Object.freeze([Object.freeze({type:'PROVIDER_DECISION_REQUIRED',capability:'INDEX',sourceId:'stooq-eod',reason:'PROVIDER_SELECTION_REQUIRED',externalActionRequired:true,userFacingLabel:'需要確認資料供應方案'})]),summaryCode:'EU_BLOCKED'})
  })});
}

function viewModel(marketCoverage=coverage()){
  return Object.freeze({
    schemaVersion:'foxyya-home-view-model/1',asOf,researchOnly:true,executionWrite:false,marketCoverage,
    providerDiagnostics:null,
    regions:Object.freeze(marketOrder.map(region=>Object.freeze({region,bias:'UNAVAILABLE',confidence:0,status:'UNAVAILABLE',asOf:null,facts:Object.freeze([])}))),
    marketPulse:Object.freeze(['CRYPTO','US','TW'].map(market=>Object.freeze({market,status:'UNAVAILABLE',stateLabel:'UNAVAILABLE',asOf:null,data:null}))),
    earlyTrend:Object.freeze([]),
    opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([]),TW:Object.freeze([])}),
    events:Object.freeze([]),calendar:Object.freeze([]),news:Object.freeze([]),todayFocus:Object.freeze([]),
    positions:Object.freeze({status:'UNAVAILABLE',paperOnly:true,realOrderLock:true,readOnly:true,health:'UNAVAILABLE',asOf:null,candidates:Object.freeze([]),pending:Object.freeze([]),open:Object.freeze([])}),
    tradingResults:null,
    researchPerformance:Object.freeze({schemaVersion:'foxyya-research-performance-read/1',status:'UNAVAILABLE',asOf,tw:Object.freeze({status:'UNAVAILABLE',summary:null}),us:Object.freeze({status:'UNAVAILABLE',summary:null}),researchOnly:true,executionWrite:false})
  });
}

test('coverage renderer shows four active markets with Chinese readiness labels and backend blocker reasons',()=>{
  const html=Renderer.renderHomeSections(viewModel()).coverageHtml;
  assert.equal(typeof html,'string');
  assert.match(html,/市場資料覆蓋/);
  assert.equal((html.match(/data-coverage-market=/g)||[]).length,4);
  assert.match(html,/data-raw-coverage-status="READY"/);
  assert.match(html,/>可用</);
  assert.match(html,/>部分可用</);
  assert.match(html,/>外部阻擋</);
  assert.match(html,/可判方向/);
  assert.match(html,/方向證據部分可用/);
  assert.match(html,/不可判方向/);
  assert.match(html,/個股研究可用/);
  assert.match(html,/個股研究部分可用/);
  assert.match(html,/可進研究排序/);
  assert.match(html,/限制排序/);
  assert.match(html,/不可進排序/);
  assert.match(html,/市場廣度/);
  assert.match(html,/產業輪動/);
  assert.match(html,/波動環境/);
  assert.match(html,/授權審查中/);
  assert.doesNotMatch(html,/data-coverage-market="JP"/);
  assert.match(html,/需要資料方案權限/);
  assert.doesNotMatch(html,/data-coverage-market="CN_HK"|data-coverage-market="EU"/);
  assert.equal(/>BUY<|>SELL<|PLACEORDER|SUBMITORDER|AUTHORIZEEXECUTION/i.test(html),false);
});

test('coverage renderer renders an explicit empty state when backend coverage is absent',()=>{
  const html=Renderer.renderHomeSections(viewModel(null)).coverageHtml;
  assert.match(html,/覆蓋狀態尚未取得/);
  assert.match(html,/等待後端 Coverage Gate/);
});

test('coverage renderer translates capability names instead of exposing only backend machine labels',()=>{
  const html=Renderer.renderHomeSections(viewModel()).coverageHtml;
  for(const label of ['指數','市場廣度','產業輪動','行情','法人資金','基本面','宏觀','波動環境','市場環境分類','模擬執行只讀','策略候選集']){
    assert.match(html,new RegExp(label));
  }
});

test('coverage browser module installs a Home target and preview server injects the required assets',()=>{
  const moduleText=fs.readFileSync(path.join(__dirname,'../v12/ui/market_coverage_renderer.js'),'utf8');
  assert.match(moduleText,/market-coverage/);
  assert.match(moduleText,/市場資料覆蓋載入中/);
  const base='<html><head><link rel="stylesheet" href="styles.css"></head><body><script src="home_renderer.js"></script><script src="home_dom.js"></script><script src="../staging/read_client.js"></script><script src="app.js"></script></body></html>';
  const decorated=decoratePreviewIndex(base);
  assert.match(decorated,/coverage\.css/);
  assert.match(decorated,/market_coverage_renderer\.js/);
  assert.ok(decorated.indexOf('home_dom.js')<decorated.indexOf('market_coverage_renderer.js'));
  assert.ok(decorated.indexOf('market_coverage_renderer.js')<decorated.indexOf('app.js'));
});

test('coverage panel has responsive grid styles for desktop and mobile',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../v12/ui/coverage.css'),'utf8');
  assert.match(css,/\.coverage-grid\s*\{/);
  assert.match(css,/\.coverage-card\s*\{/);
  assert.match(css,/@media\(max-width:820px\)[\s\S]*\.coverage-grid/);
});
