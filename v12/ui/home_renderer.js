(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_HOME_RENDERER=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const REGION_LABELS=Object.freeze({
    US:'🇺🇸 美國',TW:'🇹🇼 台灣',CN_HK:'🇨🇳🇭🇰 中國／香港',JP:'🇯🇵 日本',KR:'🇰🇷 韓國',EU:'🇪🇺 歐洲',CRYPTO:'₿ Crypto'
  });
  const MARKET_LABELS=Object.freeze({CRYPTO:'₿ Crypto',US:'🇺🇸 US Stocks',TW:'🇹🇼 Taiwan Stocks'});
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const safeClass=value=>String(value??'UNAVAILABLE').toLowerCase().replace(/[^a-z0-9_-]+/g,'-');
  const pct=value=>finite(value)?`${Math.round(value*100)}%`:'—';

  function assertViewModel(value){
    if(!object(value)||value.schemaVersion!=='foxyya-home-view-model/1')throw Error('HOME_VIEW_MODEL_REQUIRED');
    if(value.researchOnly!==true||value.executionWrite!==false)throw Error('HOME_VIEW_READ_ONLY_REQUIRED');
    if(!finite(value.asOf)||value.asOf<0)throw Error('ASOF_INVALID');
    for(const key of ['regions','marketPulse','earlyTrend','events'])if(!Array.isArray(value[key]))throw Error(key.toUpperCase()+'_REQUIRED');
    if(!object(value.opportunities))throw Error('OPPORTUNITIES_REQUIRED');
    return value;
  }

  function renderRegions(rows){
    if(!rows.length)return '<div class="empty-state"><b>UNAVAILABLE</b><span>等待 Regional Intelligence verified data。</span></div>';
    return rows.map(row=>{
      const region=esc(row.region);
      const bias=esc(row.bias||'UNAVAILABLE');
      const confidence=row.bias==='UNAVAILABLE'?'Confidence —':`Confidence ${pct(row.confidence)}`;
      return `<article class="region-card bias-${safeClass(row.bias)}" data-region="${region}"><span>${esc(REGION_LABELS[row.region]||row.region)}</span><b data-field="bias">${bias}</b><small data-field="confidence">${esc(confidence)}</small></article>`;
    }).join('');
  }

  function renderPulse(rows){
    if(!rows.length)return '<div class="empty-state"><b>UNAVAILABLE</b><span>等待 verified market data。</span></div>';
    return rows.map(row=>{
      const market=esc(row.market);
      const status=esc(row.stateLabel||row.status||'UNAVAILABLE');
      const mode=row.market==='CRYPTO'?'Automation · PAPER ONLY':'Research';
      return `<article class="pulse-card ${safeClass(row.market)}" data-market-pulse="${market}"><div class="pulse-title"><div><b>${esc(MARKET_LABELS[row.market]||row.market)}</b><small>${esc(mode)}</small></div></div><strong data-field="state">${status}</strong><small class="data-state">${esc(row.status||'UNAVAILABLE')}</small></article>`;
    }).join('');
  }

  function renderEarlyTrend(rows){
    if(!rows.length)return '<div class="empty-state"><b>UNAVAILABLE</b><span>尚無通過資料品質 Gate 的 Early Trend 證據。</span></div>';
    return `<div class="signal-list">${rows.map(row=>`<article class="signal-row" data-research-instrument="${esc(row.instrumentId)}"><div><span>${esc(row.market)}</span><b>${esc(row.instrumentId)}</b></div><div><strong>${esc(row.stateLabel||'UNAVAILABLE')}</strong><small>${esc(row.direction||'UNAVAILABLE')} · Confidence ${esc(pct(row.confidence))}</small></div><em>RESEARCH</em></article>`).join('')}</div>`;
  }

  function renderCryptoOpportunities(rows){
    if(!rows.length)return '<div class="empty-state compact"><b>UNAVAILABLE</b><span>沒有可顯示的 Crypto Paper 候選。</span></div>';
    return rows.map(row=>`<div class="opportunity-row crypto"><div><b>${esc(row.symbol)}</b><small>${esc(row.family)} · ${esc(row.side)}</small></div><div><strong>${esc(row.status)}</strong><em>PAPER READ-ONLY</em></div></div>`).join('');
  }

  function renderEquityOpportunities(rows,market){
    if(!rows.length)return `<div class="empty-state compact"><b>UNAVAILABLE</b><span>尚無 ${esc(market)} Research opportunity。</span></div>`;
    return rows.map(row=>`<div class="opportunity-row research"><div><b>${esc(row.instrumentId)}</b><small>${esc(row.earlyStage||'UNAVAILABLE')}</small></div><div><strong>${esc(row.direction||'UNAVAILABLE')}</strong><em>RESEARCH</em></div></div>`).join('');
  }

  function renderOpportunities(groups){
    const crypto=Array.isArray(groups.CRYPTO)?groups.CRYPTO:[];
    const us=Array.isArray(groups.US)?groups.US:[];
    const tw=Array.isArray(groups.TW)?groups.TW:[];
    return [
      `<article class="opportunity-card" data-opportunity-market="CRYPTO"><span>Crypto Strategies</span><b>A / B / C / D</b>${renderCryptoOpportunities(crypto)}</article>`,
      `<article class="opportunity-card" data-opportunity-market="US"><span>US Research</span><b>Trend · Earnings · Expectation</b>${renderEquityOpportunities(us,'US')}</article>`,
      `<article class="opportunity-card" data-opportunity-market="TW"><span>TW Research</span><b>Trend · 法人 · 產業</b>${renderEquityOpportunities(tw,'TW')}</article>`
    ].join('');
  }

  function renderEvents(rows){
    if(!rows.length)return '<div class="empty-state"><b>UNAVAILABLE</b><span>等待 News / Macro / Calendar verified sources。</span></div>';
    return `<div class="event-list">${rows.map(row=>`<article class="event-row" data-event-id="${esc(row.id)}"><div><b>${esc(row.title)}</b><small>${esc(row.source)}</small></div><time>${finite(row.asOf)?esc(new Date(row.asOf).toISOString()):'UNAVAILABLE'}</time></article>`).join('')}</div>`;
  }

  function renderHomeSections(input){
    const value=assertViewModel(input);
    const unavailable=value.marketPulse.filter(x=>x.status==='UNAVAILABLE').length;
    return Object.freeze({
      schemaVersion:'foxyya-home-render/1',
      asOfLabel:new Date(value.asOf).toISOString(),
      dataHealthLabel:unavailable?`VERIFIED · ${unavailable} MARKET DATA UNAVAILABLE`:'VERIFIED DATA',
      regionsHtml:renderRegions(value.regions),
      marketPulseHtml:renderPulse(value.marketPulse),
      earlyTrendHtml:renderEarlyTrend(value.earlyTrend),
      opportunitiesHtml:renderOpportunities(value.opportunities),
      eventsHtml:renderEvents(value.events),
      researchOnly:true,
      executionWrite:false
    });
  }

  return Object.freeze({escapeHtml:esc,renderHomeSections});
});
