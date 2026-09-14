(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const baseRenderer=node?require('./home_renderer.js'):root.FOXY_V12_HOME_RENDERER;
  const baseDom=node?null:root.FOXY_V12_HOME_DOM;
  const api=factory(baseRenderer,baseDom);
  if(node)module.exports=api.renderer;
  else{
    root.FOXY_V12_HOME_RENDERER=api.renderer;
    if(api.dom)root.FOXY_V12_HOME_DOM=api.dom;
    if(typeof document!=='undefined')api.ensureCoverageTarget(document);
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(BaseRenderer,BaseDOM){
  'use strict';

  if(!BaseRenderer||typeof BaseRenderer.renderHomeSections!=='function')throw Error('BASE_HOME_RENDERER_REQUIRED');

  const MARKET_ORDER=Object.freeze(['CRYPTO','US','TW','CN_HK','JP','KR','EU']);
  const MARKET_LABELS=Object.freeze({CRYPTO:'₿ 加密市場',US:'🇺🇸 美國',TW:'🇹🇼 台灣',CN_HK:'🇨🇳🇭🇰 中國／香港',JP:'🇯🇵 日本',KR:'🇰🇷 韓國',EU:'🇪🇺 歐洲'});
  const STATUS_LABELS=Object.freeze({READY:'可用',PARTIAL:'部分可用',BLOCKED:'外部阻擋',UNAVAILABLE:'尚未接入'});
  const DIRECTION_LABELS=Object.freeze({READY:'可判方向',PARTIAL:'方向證據部分可用',NOT_READY:'不可判方向'});
  const RESEARCH_LABELS=Object.freeze({READY:'個股研究可用',PARTIAL:'個股研究部分可用',NOT_READY:'個股研究未就緒'});
  const RANKING_LABELS=Object.freeze({ELIGIBLE:'可進研究排序',LIMITED:'限制排序',NOT_ELIGIBLE:'不可進排序'});
  const FRESHNESS_LABELS=Object.freeze({FRESH:'資料新鮮',STALE:'資料過期',UNKNOWN:'新鮮度未知'});
  const CAPABILITY_LABELS=Object.freeze({
    QUOTE:'行情',HISTORICAL_PRICE:'歷史價格',INDEX:'指數',MARKET_BREADTH:'市場廣度',SECTOR_ROTATION:'產業輪動',
    INSTITUTIONAL_FLOW:'法人資金',FUNDAMENTAL:'基本面',MACRO:'宏觀',VOLATILITY_CONTEXT:'波動環境',DERIVATIVES_CONTEXT:'衍生品資料',
    REGIME_CLASSIFICATION:'市場環境分類',EXECUTION_RUNTIME_READ:'模擬執行只讀',CANDIDATE_UNIVERSE:'策略候選集',NEWS:'新聞',EVENT_CALENDAR:'經濟日曆',FORWARD_VALIDATION:'前瞻驗證'
  });
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const list=value=>Array.isArray(value)?value:[];
  const safe=value=>String(value??'UNAVAILABLE').toLowerCase().replace(/[^a-z0-9_-]+/g,'-');
  const capLabel=value=>CAPABILITY_LABELS[String(value||'')]||String(value||'資料');

  function assertCoverage(value){
    if(!object(value)||value.schemaVersion!=='foxyya-market-coverage/1'||!object(value.markets))throw Error('MARKET_COVERAGE_REQUIRED');
    if(value.researchOnly!==true||value.executionWrite!==false)throw Error('MARKET_COVERAGE_READ_ONLY_REQUIRED');
    return value;
  }

  function pill(label,className=''){return `<span class="coverage-pill ${esc(className)}">${esc(label)}</span>`;}

  function capabilityText(row){
    const available=list(row.availableCapabilities).map(capLabel);
    const missing=list(row.missingCapabilities).map(capLabel);
    const availableHtml=available.length?`<div class="coverage-capability available"><span>已具備</span><b>${esc(available.join('、'))}</b></div>`:'';
    const missingHtml=missing.length?`<div class="coverage-capability missing"><span>主要缺口</span><b>${esc(missing.join('、'))}</b></div>`:'<div class="coverage-capability complete"><span>主要缺口</span><b>無</b></div>';
    return availableHtml+missingHtml;
  }

  function blockerText(row){
    const blockers=list(row.blockers).slice(0,2);
    if(!blockers.length)return '<p class="coverage-blocker clear">目前沒有阻擋項目。</p>';
    return `<div class="coverage-blockers">${blockers.map(blocker=>`<p class="coverage-blocker${blocker.externalActionRequired?' external':''}"><span>${esc(blocker.userFacingLabel||'資料限制')}</span>${blocker.capability?`<small>${esc(capLabel(blocker.capability))}</small>`:''}</p>`).join('')}</div>`;
  }

  function coverageCard(row){
    if(!object(row)||row.researchOnly!==true||row.executionWrite!==false)throw Error('MARKET_COVERAGE_ROW_READ_ONLY_REQUIRED');
    const status=String(row.coverageStatus||'UNAVAILABLE').toUpperCase();
    const direction=String(row.directionReadiness||'NOT_READY').toUpperCase();
    const research=String(row.researchReadiness||'NOT_READY').toUpperCase();
    const ranking=String(row.rankingEligibility||'NOT_ELIGIBLE').toUpperCase();
    const freshness=String(row.freshness?.status||'UNKNOWN').toUpperCase();
    return `<article class="coverage-card ${safe(status)}" data-coverage-market="${esc(row.market)}" data-raw-coverage-status="${esc(status)}" data-raw-direction-readiness="${esc(direction)}" data-raw-research-readiness="${esc(research)}" data-raw-ranking-eligibility="${esc(ranking)}"><div class="coverage-card-head"><div><span>${esc(MARKET_LABELS[row.market]||row.market)}</span><b>${esc(STATUS_LABELS[status]||'尚未接入')}</b></div>${pill(FRESHNESS_LABELS[freshness]||'新鮮度未知',freshness.toLowerCase())}</div><div class="coverage-readiness">${pill(DIRECTION_LABELS[direction]||'不可判方向','direction')}${pill(RESEARCH_LABELS[research]||'個股研究未就緒','research')}${pill(RANKING_LABELS[ranking]||'不可進排序','ranking')}</div>${capabilityText(row)}${blockerText(row)}</article>`;
  }

  function renderMarketCoverage(value){
    if(value===null||value===undefined)return '<section class="coverage-panel"><div class="section-head"><div><span class="eyebrow">資料完整度</span><h2>市場資料覆蓋</h2></div></div><div class="empty-state"><b>覆蓋狀態尚未取得</b><span>等待後端 Coverage Gate 提供市場資料真相，不以前端猜測。</span></div></section>';
    const coverage=assertCoverage(value);
    const cards=MARKET_ORDER.map(market=>coverage.markets[market]).filter(Boolean).map(coverageCard).join('');
    return `<section class="coverage-panel" data-market-coverage-panel><div class="section-head"><div><span class="eyebrow">資料完整度</span><h2>市場資料覆蓋</h2></div><small class="muted">方向、個股研究與排序資格分開判定；缺資料不硬推多空。</small></div><div class="coverage-grid">${cards}</div></section>`;
  }

  function renderHomeSections(value){
    const base=BaseRenderer.renderHomeSections(value);
    return Object.freeze({...base,coverageHtml:renderMarketCoverage(value?.marketCoverage)});
  }

  function ensureCoverageTarget(doc){
    if(!doc||typeof doc.querySelector!=='function'||typeof doc.createElement!=='function')return null;
    let target=doc.querySelector('[data-home-content="market-coverage"]');
    if(target)return target;
    const home=doc.querySelector('#home');
    if(!home)return null;
    target=doc.createElement('section');
    target.className='home-section coverage-section';
    target.id='market-coverage';
    target.setAttribute('data-home-content','market-coverage');
    target.innerHTML='<div class="empty-state"><b>市場資料覆蓋載入中</b><span>正在整理七大市場的資料可用性、方向資格與外部阻擋。</span></div>';
    const before=doc.querySelector('#global-status');
    if(before&&before.parentNode===home)home.insertBefore(target,before);else home.appendChild(target);
    return target;
  }

  function wrapDom(dom){
    if(!dom||typeof dom.applyHomeRender!=='function')return dom||null;
    return Object.freeze({...dom,applyHomeRender(doc,plan){
      const target=ensureCoverageTarget(doc);
      const result=dom.applyHomeRender(doc,plan);
      if(target&&typeof plan?.coverageHtml==='string')target.innerHTML=plan.coverageHtml;
      return result;
    }});
  }

  return Object.freeze({
    renderer:Object.freeze({...BaseRenderer,renderHomeSections,renderMarketCoverage}),
    dom:wrapDom(BaseDOM),
    ensureCoverageTarget
  });
});
