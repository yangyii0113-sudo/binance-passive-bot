(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./product_renderer.js'):root.FOXY_V12_PRODUCT_RENDERER);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_HOME_RENDERER=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Product){
  'use strict';

  const REGION_LABELS=Object.freeze({
    US:'🇺🇸 美國',TW:'🇹🇼 台灣',CN_HK:'🇨🇳🇭🇰 中國／香港',JP:'🇯🇵 日本',KR:'🇰🇷 韓國',EU:'🇪🇺 歐洲',CRYPTO:'₿ Crypto'
  });
  const MARKET_LABELS=Object.freeze({CRYPTO:'₿ Crypto',US:'🇺🇸 US Stocks',TW:'🇹🇼 Taiwan Stocks'});
  const CRYPTO_PREVIEW_LIMIT=12;
  const CRYPTO_STATUS_PRIORITY=Object.freeze({OPEN:0,PENDING:1,PENDING_INTENT:1,QUALIFIED:2,ARMED:3,WATCH:4,CANDIDATE:5,REJECTED:6,CANCELLED:7,EXITED:8});
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const safeClass=value=>String(value??'UNAVAILABLE').toLowerCase().replace(/[^a-z0-9_-]+/g,'-');
  const pct=value=>finite(value)?`${Math.round(value*100)}%`:'—';
  const number=value=>finite(value)?value.toLocaleString('en-US',{maximumFractionDigits:4}):(value===Infinity?'∞':'—');
  const time=value=>finite(value)?new Date(value).toISOString():'UNAVAILABLE';

  function assertViewModel(value){
    if(!object(value)||value.schemaVersion!=='foxyya-home-view-model/1')throw Error('HOME_VIEW_MODEL_REQUIRED');
    if(value.researchOnly!==true||value.executionWrite!==false)throw Error('HOME_VIEW_READ_ONLY_REQUIRED');
    if(!finite(value.asOf)||value.asOf<0)throw Error('ASOF_INVALID');
    for(const key of ['regions','marketPulse','earlyTrend','events'])if(!Array.isArray(value[key]))throw Error(key.toUpperCase()+'_REQUIRED');
    if(!object(value.opportunities))throw Error('OPPORTUNITIES_REQUIRED');
    return value;
  }

  function regionalCoverage(row){
    const directional=typeof row.bias==='string'&&row.bias&&row.bias!=='UNAVAILABLE';
    const hasFacts=Array.isArray(row.facts)&&row.facts.length>0;
    const hasData=row.status==='AVAILABLE'||hasFacts;
    if(directional)return Object.freeze({headline:row.bias,note:`Confidence ${pct(row.confidence)}`,className:'directional'});
    if(hasData)return Object.freeze({headline:'DATA AVAILABLE',note:'方向證據不足',className:'coverage-only'});
    return Object.freeze({headline:'DATA NOT CONNECTED',note:'本輪無有效區域來源',className:'not-connected'});
  }

  function renderRegions(rows){
    if(!rows.length)return '<div class="empty-state"><b>UNAVAILABLE</b><span>等待 Regional Intelligence verified data。</span></div>';
    return rows.map(row=>{
      const region=esc(row.region);
      const coverage=regionalCoverage(row);
      const sourceState=row.status==='AVAILABLE'?'Source status AVAILABLE':'Source status UNAVAILABLE';
      const detail=(Array.isArray(row.facts)&&row.facts.length)
        ?'官方宏觀快照已取得；方向評級需更多跨來源證據。'
        :row.region==='TW'
          ?'區域指數尚未接入；個股資料可至台股研究查看。'
          :'區域來源尚未接入或本輪無有效觀測；詳見系統診斷。';
      return `<article class="region-card ${coverage.className} bias-${safeClass(row.bias)}" data-region="${region}"><span>${esc(REGION_LABELS[row.region]||row.region)}</span><b data-field="bias">${esc(coverage.headline)}</b><small data-field="confidence">${esc(coverage.note)}</small><small>${esc(sourceState)}</small>${Product.factsHtml(row.facts)}<p class="muted">${esc(detail)}</p>${Product.lineageLink(row.lineageRef)}</article>`;
    }).join('');
  }

  function renderPulse(rows){
    if(!rows.length)return '<div class="empty-state"><b>UNAVAILABLE</b><span>等待 verified market data。</span></div>';
    return rows.map(row=>{
      const market=esc(row.market);
      const status=esc(row.stateLabel||row.status||'UNAVAILABLE');
      const cryptoAvailable=row.market==='CRYPTO'&&row.status==='AVAILABLE';
      const mode=row.market==='CRYPTO'?(cryptoAvailable?'PAPER READ-ONLY':'Research · Execution unavailable'):'Research';
      const reason=row.market==='CRYPTO'
        ?(cryptoAvailable?`Runtime ${row.data?.health||'AVAILABLE'} · Pending ${row.data?.pendingCount??'—'} · Open ${row.data?.openPositionCount??'—'}`:'Unavailable：Production Paper Runtime 本輪無法讀取')
        :'市場指數資料未接入；可查看個股官方研究快照';
      const action=row.market==='CRYPTO'?'查看 Crypto':row.market==='US'?'查看美股':'查看台股';
      return `<article class="pulse-card ${safeClass(row.market)}" data-market-pulse="${market}" data-filter-market="${market}"><div class="pulse-title"><div><b>${esc(MARKET_LABELS[row.market]||row.market)}</b><small>${esc(mode)}</small></div></div><strong data-field="state">${status}</strong><small class="data-state">${esc(row.status||'UNAVAILABLE')}</small><p class="muted">${esc(reason)}</p><button class="card-action" data-route="${row.market==='CRYPTO'?'POSITIONS':'RESEARCH'}" data-market="${market}">${action}</button></article>`;
    }).join('');
  }

  function renderEarlyTrend(rows){
    if(!rows.length)return '<div class="empty-state"><b>UNAVAILABLE</b><span>尚無通過資料品質 Gate 的 Early Trend 證據。</span></div>';
    return `<div class="signal-list">${rows.map(row=>`<article class="signal-row" data-research-instrument="${esc(row.instrumentId)}" data-filter-market="${esc(row.market)}"><div><span>${esc(row.market)}</span><b>${esc(row.instrumentId)}</b></div><div><strong>${esc(row.stateLabel||'UNAVAILABLE')}</strong><small>${esc(row.direction||'UNAVAILABLE')} · Confidence ${esc(pct(row.confidence))}</small></div><em>RESEARCH</em></article>`).join('')}</div>`;
  }

  function cryptoStatusRank(row){
    const status=String(row?.status||'UNAVAILABLE').toUpperCase();
    return Object.hasOwn(CRYPTO_STATUS_PRIORITY,status)?CRYPTO_STATUS_PRIORITY[status]:50;
  }

  function cryptoFavoriteId(row){
    const raw=`CRYPTO:${row?.symbol||'UNAVAILABLE'}:${row?.family||'NA'}:${row?.side||'NA'}`;
    return raw.slice(0,80);
  }

  function renderCryptoOpportunities(rows){
    if(!rows.length)return '<div class="empty-state compact"><b>UNAVAILABLE</b><span>本輪沒有可顯示的 Crypto Paper candidate。</span></div>';
    const sorted=[...rows].sort((a,b)=>cryptoStatusRank(a)-cryptoStatusRank(b)||String(a?.symbol||'').localeCompare(String(b?.symbol||'')));
    const visible=sorted.slice(0,CRYPTO_PREVIEW_LIMIT);
    const inactive=new Set(['REJECTED','CANCELLED','EXITED']);
    const activeCount=rows.filter(row=>!inactive.has(String(row?.status||'').toUpperCase())).length;
    const summary=`<div class="crypto-opportunity-summary"><div><b>${esc(rows.length)} candidates</b><small>Active ${esc(activeCount)} · 依 Execution lifecycle 優先排序</small></div><span>顯示 ${esc(visible.length)} / ${esc(rows.length)}</span></div>`;
    const list=visible.map(row=>{
      const favoriteId=cryptoFavoriteId(row);
      return `<div class="opportunity-row crypto" data-favorite-card="${esc(favoriteId)}"><div class="opportunity-main"><b>${esc(row.symbol)}</b><small>${esc(row.family)} · ${esc(row.side)}</small></div><div class="opportunity-state"><strong>${esc(row.status)}</strong><em>PAPER READ-ONLY</em><button class="text-btn favorite-btn crypto-favorite" data-favorite-id="${esc(favoriteId)}" aria-pressed="false" title="本機收藏，不同步帳號">☆ 收藏</button></div></div>`;
    }).join('');
    return `${summary}<div class="crypto-opportunity-list">${list}</div>`;
  }

  function renderEquityOpportunities(rows,market){
    if(!rows.length)return `<div class="empty-state compact"><b>UNAVAILABLE</b><span>尚無 ${esc(market)} Research opportunity。</span></div>`;
    return rows.map(row=>Product.researchHtml(row)).join('');
  }

  function renderOpportunities(groups){
    const crypto=Array.isArray(groups.CRYPTO)?groups.CRYPTO:[];
    const us=Array.isArray(groups.US)?groups.US:[];
    const tw=Array.isArray(groups.TW)?groups.TW:[];
    return [
      `<article class="opportunity-card" data-opportunity-market="CRYPTO" data-filter-market="CRYPTO"><span>Crypto Strategies</span><b>A / B / C / D</b>${renderCryptoOpportunities(crypto)}</article>`,
      `<article class="opportunity-card" data-opportunity-market="US" data-filter-market="US"><span>US Research</span><b>Trend · Earnings · Expectation</b>${renderEquityOpportunities(us,'US')}</article>`,
      `<article class="opportunity-card" data-opportunity-market="TW" data-filter-market="TW"><span>TW Research</span><b>Trend · 法人 · 產業</b>${renderEquityOpportunities(tw,'TW')}</article>`
    ].join('');
  }

  function renderEventRows(rows,emptyText){
    if(!rows.length)return `<div class="empty-state"><b>UNAVAILABLE</b><span>${esc(emptyText)}</span></div>`;
    return `<div class="event-list">${rows.map(row=>`<article class="event-row" data-event-id="${esc(row.id)}"><div><span class="eyebrow">${esc(row.kind||'EVENT')} · ${esc(row.impact||'UNAVAILABLE')}</span><b>${esc(row.title)}</b><small>${esc(row.source)} · ${esc(row.status||'UNAVAILABLE')}</small>${row.summary?`<p class="muted">${esc(row.summary)}</p>`:''}${row.description?`<p class="muted">${esc(row.description)}</p>`:''}</div><time>${esc(time(row.asOf))}</time></article>`).join('')}</div>`;
  }

  function renderEvents(rows){return renderEventRows(rows,'新聞、經濟日曆與事件來源本輪無可用資料。');}
  function renderCalendar(rows){return renderEventRows(rows,'BLS Calendar 本輪無可用事件。');}
  function renderNews(rows){return renderEventRows(rows,'News feed 本輪無可用項目。');}
  function renderTodayFocus(rows){return renderEventRows(rows,'目前沒有 HIGH / EXTREME verified focus。');}

  function renderPositions(value){
    if(!object(value)||value.status!=='AVAILABLE')return '<div class="empty-state"><b>UNAVAILABLE</b><span>Production Paper Runtime 本輪無法讀取；不顯示舊持倉為最新狀態。</span></div>';
    const pending=Array.isArray(value.pending)?value.pending:[];
    const open=Array.isArray(value.open)?value.open:[];
    const rows=[
      ...open.map(row=>({label:'OPEN',row})),
      ...pending.map(row=>({label:'PENDING',row}))
    ];
    const body=rows.length?`<div class="position-list">${rows.map(({label,row})=>`<article class="position-row" data-position-kind="${label}"><div><span class="status-chip">${label}</span><b>${esc(row.symbol||'UNAVAILABLE')}</b><small>${esc(row.family||'—')} · ${esc(row.side||'—')}</small></div><strong>${esc(row.status||label)}</strong></article>`).join('')}</div>`:'<div class="empty-state compact"><b>0 ACTIVE</b><span>目前沒有 Pending / Open Paper position。</span></div>';
    return `<div class="runtime-summary"><span class="safety-pill">PAPER ONLY</span><small>Runtime ${esc(value.health)} · Ledger ${value.ledgerIntegrity?'OK':'DEGRADED'} · ${esc(time(value.asOf))}</small></div>${body}`;
  }

  function renderTradingResults(value){
    if(!object(value))return '<div class="empty-state"><b>UNAVAILABLE</b><span>尚未取得 canonical closed paper trade results。</span></div>';
    const m=object(value.metrics)?value.metrics:{};
    return `<div class="metric-grid"><div><span>Samples</span><b>${esc(number(value.sampleCount))}</b></div><div><span>Win Rate</span><b>${finite(m.winRate)?esc(pct(m.winRate)):'—'}</b></div><div><span>Net PnL</span><b>${esc(number(m.netPnl))}</b></div><div><span>Expectancy R</span><b>${esc(number(m.expectancyR))}</b></div><div><span>Profit Factor</span><b>${esc(number(m.profitFactor))}</b></div><div><span>Fees</span><b>${esc(number(m.fees))}</b></div></div><p class="muted">${esc(value.sampleStatus)} · closed PAPER trades only · ${esc(time(value.asOf))}</p>`;
  }

  function renderHomeSections(input){
    const value=assertViewModel(input);
    const unavailable=value.marketPulse.filter(x=>x.status==='UNAVAILABLE').length;
    return Object.freeze({
      schemaVersion:'foxyya-home-render/1',
      asOfLabel:new Date(value.asOf).toISOString(),
      dataHealthLabel:unavailable?`VERIFIED · ${unavailable} MARKET DATA UNAVAILABLE`:'VERIFIED DATA',
      diagnosticsHtml:Product.diagnosticsHtml(value.providerDiagnostics),
      regionsHtml:renderRegions(value.regions),
      marketPulseHtml:renderPulse(value.marketPulse),
      earlyTrendHtml:renderEarlyTrend(value.earlyTrend),
      opportunitiesHtml:renderOpportunities(value.opportunities),
      eventsHtml:renderEvents(value.events),
      positionsHtml:renderPositions(value.positions),
      tradingResultsHtml:renderTradingResults(value.tradingResults),
      calendarHtml:renderCalendar(Array.isArray(value.calendar)?value.calendar:[]),
      newsHtml:renderNews(Array.isArray(value.news)?value.news:[]),
      todayFocusHtml:renderTodayFocus(Array.isArray(value.todayFocus)?value.todayFocus:[]),
      researchOnly:true,
      executionWrite:false
    });
  }

  return Object.freeze({escapeHtml:esc,renderHomeSections});
});