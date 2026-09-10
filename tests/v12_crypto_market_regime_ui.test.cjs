'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../v12/ui/home_renderer.js');

const asOf=Date.parse('2026-09-11T01:00:00Z');
function view(crypto){return Object.freeze({
  schemaVersion:'foxyya-home-view-model/1',asOf,researchOnly:true,executionWrite:false,
  regions:Object.freeze(['US','TW','CN_HK','JP','KR','EU','CRYPTO'].map(region=>Object.freeze({region,bias:'UNAVAILABLE',confidence:0,status:'UNAVAILABLE',asOf:null,facts:Object.freeze([]),lineageRef:null}))),
  marketPulse:Object.freeze([
    crypto,
    Object.freeze({market:'US',status:'UNAVAILABLE',stateLabel:'UNAVAILABLE',asOf:null,data:null}),
    Object.freeze({market:'TW',status:'UNAVAILABLE',stateLabel:'UNAVAILABLE',asOf:null,data:null})
  ]),earlyTrend:Object.freeze([]),opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([]),TW:Object.freeze([])}),events:Object.freeze([])
});}
function fresh(state='RISK_ON'){return Object.freeze({
  market:'CRYPTO',status:'AVAILABLE',stateLabel:state,asOf:asOf-60_000,
  data:Object.freeze({
    health:'HEALTHY',cycleCount:77,candidateCount:4,pendingCount:2,openPositionCount:1,ledgerIntegrity:true,
    regimeStatus:'AVAILABLE',regimeState:state,lastRegimeState:null,regimeAsOf:asOf-60_000,regimeAgeMs:60_000,
    regimeSource:'PRODUCTION_REGIME_ROUTER_READ_ONLY',rawRegimeInputsAvailable:false,regimeEvidenceCompleteness:'CLASSIFICATION_ONLY',
    decisionCutoffMs:asOf-3_600_000,eligibleUniverseCount:120,dataInsufficientCount:1,decisionBarPolicy:'FULLY_CLOSED_1H'
  })
});}

test('fresh Production Crypto regime renders as a market environment, not a trade signal',()=>{
  const html=R.renderHomeSections(view(fresh('RISK_ON'))).marketPulseHtml;
  const crypto=html.slice(html.indexOf('data-market-pulse="CRYPTO"'),html.indexOf('data-market-pulse="US"'));
  assert.match(crypto,/風險偏好開啟/);
  assert.doesNotMatch(crypto,/RISK_ON/);
  assert.match(crypto,/Production Regime Router（唯讀）/);
  assert.match(crypto,/市場環境判讀/);
  assert.match(crypto,/僅模擬交易（PAPER ONLY）/);
  assert.match(crypto,/引擎健康/);
  assert.match(crypto,/等待成交 2/);
  assert.match(crypto,/持倉 1/);
  assert.match(crypto,/可用幣種 120/);
  assert.match(crypto,/資料不足 1/);
  assert.match(crypto,/完整收盤 1H/);
  assert.match(crypto,/決策截止/);
  assert.match(crypto,/更新/);
  assert.match(crypto,/major_returns \/ breadth \/ volatility/);
  assert.match(crypto,/不生成 Regime confidence/);
  assert.match(crypto,/不是交易訊號/);
});

test('all Production regime states have clear Traditional Chinese labels',()=>{
  const cases=[['RISK_ON','風險偏好開啟'],['RISK_OFF','風險偏好關閉'],['NEUTRAL_ROTATION','中性輪動']];
  for(const [state,label] of cases){
    const html=R.renderHomeSections(view(fresh(state))).marketPulseHtml;
    assert.match(html,new RegExp(label));
    assert.doesNotMatch(html,new RegExp(state));
  }
});

test('stale regime never presents the last Production classification as current',()=>{
  const stale=Object.freeze({market:'CRYPTO',status:'AVAILABLE',stateLabel:'PAPER ONLY',asOf,
    data:Object.freeze({health:'HEALTHY',cycleCount:78,candidateCount:0,pendingCount:0,openPositionCount:0,ledgerIntegrity:true,
      regimeStatus:'STALE',regimeState:'UNAVAILABLE',lastRegimeState:'RISK_ON',regimeAsOf:asOf-(3*60*60*1000),regimeAgeMs:3*60*60*1000,
      regimeSource:'PRODUCTION_REGIME_ROUTER_READ_ONLY',rawRegimeInputsAvailable:false,regimeEvidenceCompleteness:'CLASSIFICATION_ONLY',
      decisionCutoffMs:asOf-(4*60*60*1000),eligibleUniverseCount:118,dataInsufficientCount:3,decisionBarPolicy:'FULLY_CLOSED_1H'})});
  const html=R.renderHomeSections(view(stale)).marketPulseHtml;
  const crypto=html.slice(html.indexOf('data-market-pulse="CRYPTO"'),html.indexOf('data-market-pulse="US"'));
  assert.match(crypto,/Regime 尚未更新/);
  assert.match(crypto,/上次狀態：風險偏好開啟/);
  assert.doesNotMatch(crypto,/>風險偏好開啟<\/strong>/);
  assert.match(crypto,/目前不形成市場環境結論/);
  assert.match(crypto,/僅模擬交易（PAPER ONLY）/);
});
