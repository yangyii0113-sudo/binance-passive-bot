'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Impact=require('../v12/intelligence/news_impact_engine.js');
const VM=require('../v12/ui/home_view_model.js');
const Renderer=require('../v12/ui/home_renderer.js');

const nowMs=Date.parse('2026-09-11T02:00:00Z');

function news(overrides={}){
  return Object.freeze({
    kind:'NEWS',
    id:'news:test',
    title:'Federal Reserve publishes monetary policy statement',
    source:'Federal Reserve',
    asOf:nowMs-30*60*1000,
    impact:'HIGH',
    status:'LIVE_SOURCE',
    summary:'Federal Reserve policy statement and banking conditions update.',
    tags:Object.freeze(['MACRO']),
    assets:Object.freeze([]),
    ...overrides
  });
}

function readModel(events){
  return Object.freeze({
    schemaVersion:'foxyya-home-read-model/1',
    asOf:nowMs,
    home:Object.freeze({
      regions:Object.freeze([]),
      marketPulse:Object.freeze([]),
      earlyTrend:Object.freeze([]),
      opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([]),TW:Object.freeze([])}),
      events:Object.freeze(events),
      todayFocus:Object.freeze([])
    }),
    cryptoExecution:null,
    cryptoResults:null,
    providerDiagnostics:null,
    researchOnly:true,
    executionWrite:false
  });
}

test('official fresh macro news scores above the same stale news and remains research-only',()=>{
  const recent=Impact.evaluateNewsImpact(news(),nowMs);
  const stale=Impact.evaluateNewsImpact(news({id:'news:stale',asOf:nowMs-96*60*60*1000}),nowMs);
  assert.ok(recent.impactScore>stale.impactScore,{recent:recent.impactScore,stale:stale.impactScore});
  assert.ok(recent.impactScore>=80&&recent.impactScore<=100);
  assert.ok(recent.impactConfidence>=0.8&&recent.impactConfidence<=1);
  assert.ok(recent.freshnessWeight>=0.95&&recent.freshnessWeight<=1);
  assert.deepEqual(recent.relatedMarkets,['GLOBAL','US']);
  assert.equal(recent.researchOnly,true);
  assert.equal(recent.executionWrite,false);
  assert.equal(Object.isFrozen(recent),true);
  assert.doesNotMatch(JSON.stringify(recent),/"bias"|"side"|"buy"|"sell"|"order"/i);
});

test('stock-token news maps explicit assets and affected US plus Crypto markets without inventing execution',()=>{
  const result=Impact.evaluateNewsImpact(news({
    id:'news:token',
    title:"Robinhood CEO responds to AMC over stock tokens",
    source:'CoinDesk',
    summary:'Third-party tokenized securities reference public-company shares and crypto rails.',
    tags:Object.freeze(['TOKENIZATION']),
    assets:Object.freeze(['HOOD','AMC'])
  }),nowMs);
  assert.deepEqual(result.relatedMarkets,['CRYPTO','US']);
  assert.deepEqual(result.relatedAssets,['AMC','HOOD']);
  assert.equal(result.topic,'股票代幣化與證券規則');
  assert.match(result.impactRationale,/證券|代幣|合規/);
  assert.equal(result.executionWrite,false);
});

test('KYC cybersecurity news maps to Crypto but does not fabricate unrelated assets',()=>{
  const result=Impact.evaluateNewsImpact(news({
    id:'news:kyc',
    title:'KYC data is a honey pot for hackers',
    source:'CoinDesk',
    summary:'Privacy-preserving identity systems could reduce centralized identity-data risk.',
    tags:Object.freeze(['KYC','SECURITY']),
    assets:Object.freeze([])
  }),nowMs);
  assert.deepEqual(result.relatedMarkets,['CRYPTO']);
  assert.deepEqual(result.relatedAssets,[]);
  assert.equal(result.topic,'加密身分驗證與資安風險');
});

test('known asset names can be deterministically linked while explicit assets remain authoritative',()=>{
  const result=Impact.evaluateNewsImpact(news({
    id:'news:assets',
    title:'NVIDIA and TSMC capacity outlook meets Bitcoin liquidity story',
    source:'Reuters',
    summary:'NVIDIA, TSMC and Bitcoin are explicitly discussed.',
    tags:Object.freeze([]),
    assets:Object.freeze(['NVDA'])
  }),nowMs);
  assert.deepEqual(result.relatedAssets,['BTC','NVDA','TWSE:2330']);
  assert.deepEqual(result.relatedMarkets,['CRYPTO','TW','US']);
});

test('Home view ranks focus by impact score and preserves impact intelligence fields',()=>{
  const low={...news({id:'news:low',title:'Low priority company update',impact:'LOW'}),...Impact.evaluateNewsImpact(news({id:'news:low',title:'Low priority company update',impact:'LOW'}),nowMs)};
  const high={...news({id:'news:high',title:'Federal Reserve emergency policy statement',impact:'EXTREME'}),...Impact.evaluateNewsImpact(news({id:'news:high',title:'Federal Reserve emergency policy statement',impact:'EXTREME'}),nowMs)};
  const view=VM.buildHomeViewModel(readModel([low,high]));
  assert.equal(view.todayFocus[0].id,'news:high');
  assert.ok(view.todayFocus[0].impactScore>view.todayFocus[1].impactScore);
  assert.ok(Array.isArray(view.todayFocus[0].relatedMarkets));
  assert.ok(Array.isArray(view.todayFocus[0].relatedAssets));
  assert.equal(typeof view.todayFocus[0].impactRationale,'string');
  assert.equal(typeof view.todayFocus[0].topic,'string');
});

test('Today Focus renders Chinese impact score, confidence, markets and related assets with original title as evidence',()=>{
  const raw=news({
    id:'news:ui',
    title:"Robinhood CEO responds to AMC over stock tokens",
    source:'CoinDesk',
    summary:'Tokenized securities reference public-company shares.',
    tags:Object.freeze(['TOKENIZATION']),
    assets:Object.freeze(['HOOD','AMC'])
  });
  const enriched={...raw,...Impact.evaluateNewsImpact(raw,nowMs)};
  const view=VM.buildHomeViewModel(readModel([enriched]));
  const html=Renderer.renderHomeSections(view).todayFocusHtml;
  assert.match(html,/影響分數\s*\d+\s*\/\s*100/);
  assert.match(html,/可信度/);
  assert.match(html,/新鮮度/);
  assert.match(html,/影響市場/);
  assert.match(html,/美股/);
  assert.match(html,/加密市場/);
  assert.match(html,/相關資產/);
  assert.match(html,/AMC/);
  assert.match(html,/HOOD/);
  assert.match(html,/為什麼重要/);
  assert.match(html,/原始標題/);
  assert.match(html,/Robinhood CEO responds to AMC/);
});
