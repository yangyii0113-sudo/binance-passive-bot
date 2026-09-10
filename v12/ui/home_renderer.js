(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./product_renderer.js'):root.FOXY_V12_PRODUCT_RENDERER);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_HOME_RENDERER=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Product){
  'use strict';

  const REGION_LABELS=Object.freeze({
    US:'🇺🇸 美國',TW:'🇹🇼 台灣',CN_HK:'🇨🇳🇭🇰 中國／香港',JP:'🇯🇵 日本',KR:'🇰🇷 韓國',EU:'🇪🇺 歐洲',CRYPTO:'₿ 加密市場'
  });
  const MARKET_LABELS=Object.freeze({CRYPTO:'₿ 加密市場',US:'🇺🇸 美股',TW:'🇹🇼 台股'});
  const CRYPTO_PREVIEW_LIMIT=12;
  const CRYPTO_STATUS_PRIORITY=Object.freeze({OPEN:0,PENDING:1,PENDING_INTENT:1,QUALIFIED:2,ARMED:3,WATCH:4,CANDIDATE:5,REJECTED:6,CANCELLED:7,EXITED:8});
  const STATUS_LABELS=Object.freeze({
    AVAILABLE:'可用',UNAVAILABLE:'不可用',HEALTHY:'健康',DEGRADED:'降級',STALE:'過期',
    OPEN:'持倉中',PENDING:'等待成交',PENDING_INTENT:'等待執行',QUALIFIED:'條件成立',ARMED:'準備中',WATCH:'觀察中',CANDIDATE:'候選',REJECTED:'未通過',CANCELLED:'已取消',EXITED:'已結束',
    LIVE:'即時',DELAYED:'延遲',SNAPSHOT:'快照',SAMPLE_INSUFFICIENT:'樣本不足'
  });
  const SIDE_LABELS=Object.freeze({LONG:'多方',SHORT:'空方',NEUTRAL:'中性'});
  const STAGE_LABELS=Object.freeze({DETECT:'偵測',EARLY_WATCH:'早期觀察',ACCUMULATION:'累積',CONFIRMING:'確認中',READY:'條件就緒',INVALIDATED:'已失效'});
  const DIRECTION_LABELS=Object.freeze({
    STRONG_BULLISH:'強勢偏多',BULLISH:'偏多',POSITIVE:'偏正向',UP:'偏多',LONG:'偏多',
    STRONG_BEARISH:'強勢偏空',BEARISH:'偏空',NEGATIVE:'偏負向',DOWN:'偏空',SHORT:'偏空',
    NEUTRAL:'中性',MIXED:'多空混合',UNAVAILABLE:'暫不判斷'
  });
  const EVENT_KIND_LABELS=Object.freeze({CALENDAR:'經濟日曆',NEWS:'重要消息',EVENT:'事件'});
  const IMPACT_LABELS=Object.freeze({EXTREME:'極高',HIGH:'高',MEDIUM:'中',LOW:'低',UNAVAILABLE:'未分級'});
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const safeClass=value=>String(value??'UNAVAILABLE').toLowerCase().replace(/[^a-z0-9_-]+/g,'-');
  const pct=value=>finite(value)?`${Math.round(value*100)}%`:'—';
  const number=value=>finite(value)?value.toLocaleString('en-US',{maximumFractionDigits:4}):(value===Infinity?'∞':'—');
  const time=value=>finite(value)?new Date(value).toISOString():'—';
  const statusLabel=value=>STATUS_LABELS[String(value??'UNAVAILABLE').toUpperCase()]||String(value??'—');
  const sideLabel=value=>SIDE_LABELS[String(value??'').toUpperCase()]||String(value??'—');
  const stageLabel=value=>STAGE_LABELS[String(value??'').trim().toUpperCase().replaceAll(' ','_')]||String(value??'—');
  const directionLabel=value=>DIRECTION_LABELS[String(value??'UNAVAILABLE').toUpperCase()]||String(value??'暫不判斷');

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
    if(directional)return Object.freeze({headline:directionLabel(row.bias),note:`方向可信度 ${pct(row.confidence)}`,dataLabel:'資料已取得',className:'directional'});
    if(hasData)return Object.freeze({headline:'暫不判斷',note:'方向證據不足',dataLabel:'資料已取得',className:'coverage-only'});
    return Object.freeze({headline:'暫不判斷',note:'缺少可用區域資料',dataLabel:'資料未接入',className:'not-connected'});
  }

  function renderRegions(rows){
    if(!rows.length)return '<div class="empty-state" data-raw-status="UNAVAILABLE"><b>資料不足</b><span>等待區域情報資料。</span></div>';
    return rows.map(row=>{
      const region=esc(row.region);
      const coverage=regionalCoverage(row);
      const detail=(Array.isArray(row.facts)&&row.facts.length)
        ?'官方宏觀快照已取得；要形成市場方向仍需要更多跨來源證據。'
        :row.region==='TW'
          ?'台股個股研究已有資料，但區域指數與市場廣度仍待補齊。'
          :'本區域尚未接入足夠來源，或本輪沒有有效觀測；可至「資料來源診斷」查看原因。';
      return `<article class="region-card ${coverage.className} bias-${safeClass(row.bias)}" data-region="${region}" data-raw-status="${esc(row.status||'UNAVAILABLE')}" data-raw-bias="${esc(row.bias||'UNAVAILABLE')}"><span>${esc(REGION_LABELS[row.region]||row.region)}</span><b data-field="bias">${esc(coverage.headline)}</b><small data-field="confidence">${esc(coverage.note)}</small><small>${esc(coverage.dataLabel)}</small>${Product.factsHtml(row.facts)}<p class="muted">${esc(detail)}</p>${Product.lineageLink(row.lineageRef)}</article>`;
    }).join('');
  }

  function pulseStateLabel(row){
    const raw=String(row?.stateLabel||row?.status||'UNAVAILABLE').toUpperCase().replaceAll(' ','_');
    return STATUS_LABELS[raw]||DIRECTION_LABELS[raw]||stageLabel(raw)||statusLabel(raw);
  }

  function renderPulse(rows){
    if(!rows.length)return '<div class="empty-state" data-raw-status="UNAVAILABLE"><b>資料不足</b><span>等待市場資料。</span></div>';
    return rows.map(row=>{
      const market=esc(row.market);
      const status=pulseStateLabel(row);
      const cryptoAvailable=row.market==='CRYPTO'&&row.status==='AVAILABLE';
      const mode=row.market==='CRYPTO'?(cryptoAvailable?'模擬交易只讀':'研究模式 · 執行資料不可用'):'研究模式';
      const reason=row.market==='CRYPTO'
        ?(cryptoAvailable?`執行引擎 ${statusLabel(row.data?.health||'AVAILABLE')} · 等待成交 ${row.data?.pendingCount??'—'} · 持倉 ${row.data?.openPositionCount??'—'}`:'本輪無法讀取正式模擬交易執行資料')
        :'市場指數資料仍待補齊；目前可查看個股官方研究快照';
      const action=row.market==='CRYPTO'?'查看加密市場':row.market==='US'?'查看美股':'查看台股';
      return `<article class="pulse-card ${safeClass(row.market)}" data-market-pulse="${market}" data-filter-market="${market}" data-raw-status="${esc(row.status||'UNAVAILABLE')}"><div class="pulse-title"><div><b>${esc(MARKET_LABELS[row.market]||row.market)}</b><small>${esc(mode)}</small></div></div><strong data-field="state">${esc(status)}</strong><small class="data-state">資料狀態：${esc(statusLabel(row.status))}</small><p class="muted">${esc(reason)}</p><button class="card-action" data-route="${row.market==='CRYPTO'?'POSITIONS':'RESEARCH'}" data-market="${market}">${action}</button></article>`;
    }).join('');
  }

  function directionSign(value){
    const raw=String(value??'').toUpperCase();
    if(['POSITIVE','BULLISH','STRONG_BULLISH','UP','LONG'].includes(raw))return 1;
    if(['NEGATIVE','BEARISH','STRONG_BEARISH','DOWN','SHORT'].includes(raw))return -1;
    return 0;
  }

  function equityDecision(rows,label){
    const list=Array.isArray(rows)?rows:[];
    if(!list.length)return Object.freeze({headline:`${label}研究資料不足`,detail:'目前沒有通過資料品質門檻的研究機會',tone:'neutral'});
    let positive=0,negative=0,neutral=0,confidenceTotal=0,confidenceCount=0;
    for(const row of list){
      const sign=directionSign(row?.direction);
      if(sign>0)positive++;else if(sign<0)negative++;else neutral++;
      const c=row?.research?.confidence;if(finite(c)){confidenceTotal+=c;confidenceCount++;}
    }
    const confidence=confidenceCount?pct(confidenceTotal/confidenceCount):'—';
    if(positive>negative)return Object.freeze({headline:`${label}研究偏正向`,detail:`正向 ${positive} · 負向 ${negative} · 其他 ${neutral} · 平均研究可信度 ${confidence}`,tone:'positive'});
    if(negative>positive)return Object.freeze({headline:`${label}研究偏負向`,detail:`正向 ${positive} · 負向 ${negative} · 其他 ${neutral} · 平均研究可信度 ${confidence}`,tone:'negative'});
    return Object.freeze({headline:`${label}研究方向混合`,detail:`正向 ${positive} · 負向 ${negative} · 其他 ${neutral} · 暫不形成單一方向`,tone:'neutral'});
  }

  function cryptoDecision(rows){
    const list=Array.isArray(rows)?rows:[];
    const inactive=new Set(['REJECTED','CANCELLED','EXITED']);
    const active=list.filter(row=>!inactive.has(String(row?.status||'').toUpperCase()));
    const longs=active.filter(row=>String(row?.side||'').toUpperCase()==='LONG').length;
    const shorts=active.filter(row=>String(row?.side||'').toUpperCase()==='SHORT').length;
    if(!active.length)return Object.freeze({headline:'加密策略暫無有效候選',detail:`總候選 ${list.length} · 尚無通過觀察門檻的項目`,tone:'neutral'});
    if(longs>shorts)return Object.freeze({headline:'策略候選偏多',detail:`有效候選 ${active.length} · 多方 ${longs} · 空方 ${shorts} · 僅代表策略候選，不等於市場趨勢`,tone:'positive'});
    if(shorts>longs)return Object.freeze({headline:'策略候選偏空',detail:`有效候選 ${active.length} · 多方 ${longs} · 空方 ${shorts} · 僅代表策略候選，不等於市場趨勢`,tone:'negative'});
    return Object.freeze({headline:'策略候選多空混合',detail:`有效候選 ${active.length} · 多方 ${longs} · 空方 ${shorts} · 需要進一步覆核`,tone:'neutral'});
  }

  function renderDecisionSummary(value){
    const groups=value.opportunities||{};
    const crypto=cryptoDecision(groups.CRYPTO);
    const us=equityDecision(groups.US,'美股');
    const tw=equityDecision(groups.TW,'台股');
    const available=value.regions.filter(row=>row.status==='AVAILABLE'||(Array.isArray(row.facts)&&row.facts.length)).length;
    const directional=value.regions.filter(row=>row.bias&&row.bias!=='UNAVAILABLE').length;
    const coverage={headline:`資料覆蓋 ${available}/7`,detail:`目前可判方向 ${directional}/7 · 缺資料的區域會直接標示原因`,tone:available>=5?'positive':available>=3?'neutral':'negative'};
    const cards=[['加密市場',crypto],['美股',us],['台股',tw],['全球資料',coverage]];
    return `<section class="decision-summary"><div class="section-head"><div><span class="eyebrow">今日判斷</span><h2>今日決策摘要</h2></div><small class="muted">先看方向，再看資料缺口；不以缺失資料硬推多空。</small></div><div class="decision-grid">${cards.map(([name,item])=>`<article class="decision-card ${item.tone}"><span>${esc(name)}</span><b>${esc(item.headline)}</b><p>${esc(item.detail)}</p></article>`).join('')}</div></section>`;
  }

  function renderEarlyTrend(rows){
    if(!rows.length)return '<div class="empty-state" data-raw-status="UNAVAILABLE"><b>暫無早期趨勢</b><span>尚無通過資料品質門檻的早期趨勢證據。</span></div>';
    return `<div class="signal-list">${rows.map(row=>`<article class="signal-row" data-research-instrument="${esc(row.instrumentId)}" data-filter-market="${esc(row.market)}" data-mode="RESEARCH"><div><span>${esc(MARKET_LABELS[row.market]||row.market)}</span><b>${esc(row.instrumentId)}</b></div><div><strong>${esc(stageLabel(row.stateLabel))}</strong><small>${esc(directionLabel(row.direction))} · 研究可信度 ${esc(pct(row.confidence))}</small></div><em>研究觀察</em></article>`).join('')}</div>`;
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
    if(!rows.length)return '<div class="empty-state compact" data-raw-status="UNAVAILABLE"><b>暫無候選</b><span>本輪沒有可顯示的加密模擬交易候選。</span></div>';
    const sorted=[...rows].sort((a,b)=>cryptoStatusRank(a)-cryptoStatusRank(b)||String(a?.symbol||'').localeCompare(String(b?.symbol||'')));
    const visible=sorted.slice(0,CRYPTO_PREVIEW_LIMIT);
    const inactive=new Set(['REJECTED','CANCELLED','EXITED']);
    const activeCount=rows.filter(row=>!inactive.has(String(row?.status||'').toUpperCase())).length;
    const summary=`<div class="crypto-opportunity-summary" data-raw-summary="${esc(rows.length)} candidates"><div><b>${esc(rows.length)} 個候選</b><small>有效候選 ${esc(activeCount)} · 依執行生命週期優先排序</small></div><span>顯示 ${esc(visible.length)} / ${esc(rows.length)}</span></div>`;
    const list=visible.map(row=>{
      const favoriteId=cryptoFavoriteId(row);
      return `<div class="opportunity-row crypto" data-favorite-card="${esc(favoriteId)}" data-mode="PAPER READ-ONLY" data-raw-status="${esc(row.status)}"><div class="opportunity-main"><b>${esc(row.symbol)}</b><small>策略 ${esc(row.family)} · ${esc(sideLabel(row.side))}</small></div><div class="opportunity-state"><strong>${esc(statusLabel(row.status))}</strong><em>模擬只讀</em><button class="text-btn favorite-btn crypto-favorite" data-favorite-id="${esc(favoriteId)}" aria-pressed="false" title="本機收藏，不同步帳號">☆ 收藏</button></div></div>`;
    }).join('');
    return `${summary}<div class="crypto-opportunity-list">${list}</div>`;
  }

  function renderEquityOpportunities(rows,market){
    if(!rows.length)return `<div class="empty-state compact" data-raw-status="UNAVAILABLE"><b>暫無研究機會</b><span>尚無 ${esc(market==='US'?'美股':'台股')} 研究機會。</span></div>`;
    return rows.map(row=>Product.researchHtml(row)).join('');
  }

  function renderOpportunities(groups){
    const crypto=Array.isArray(groups.CRYPTO)?groups.CRYPTO:[];
    const us=Array.isArray(groups.US)?groups.US:[];
    const tw=Array.isArray(groups.TW)?groups.TW:[];
    return [
      `<article class="opportunity-card" data-opportunity-market="CRYPTO" data-filter-market="CRYPTO"><span>加密策略</span><b>A / B / C / D</b>${renderCryptoOpportunities(crypto)}</article>`,
      `<article class="opportunity-card" data-opportunity-market="US" data-filter-market="US"><span>美股研究</span><b>趨勢 · 財報 · 預期</b>${renderEquityOpportunities(us,'US')}</article>`,
      `<article class="opportunity-card" data-opportunity-market="TW" data-filter-market="TW"><span>台股研究</span><b>趨勢 · 法人 · 產業</b>${renderEquityOpportunities(tw,'TW')}</article>`
    ].join('');
  }

  function renderEventRows(rows,emptyText){
    if(!rows.length)return `<div class="empty-state" data-raw-status="UNAVAILABLE"><b>目前無資料</b><span>${esc(emptyText)}</span></div>`;
    return `<div class="event-list">${rows.map(row=>`<article class="event-row" data-event-id="${esc(row.id)}" data-raw-kind="${esc(row.kind||'EVENT')}" data-raw-impact="${esc(row.impact||'UNAVAILABLE')}"><div><span class="eyebrow">${esc(EVENT_KIND_LABELS[row.kind]||'事件')} · 影響程度 ${esc(IMPACT_LABELS[row.impact]||row.impact||'未分級')}</span><b>${esc(row.title)}</b><small>${esc(row.source)} · ${esc(statusLabel(row.status))}</small>${row.summary?`<p class="muted">${esc(row.summary)}</p>`:''}${row.description?`<p class="muted">${esc(row.description)}</p>`:''}</div><time>${esc(time(row.asOf))}</time></article>`).join('')}</div>`;
  }

  function renderEvents(rows){return renderEventRows(rows,'新聞、經濟日曆與事件來源本輪無可用資料。');}
  function renderCalendar(rows){return renderEventRows(rows,'本輪沒有可用的經濟日曆事件。');}
  function renderNews(rows){return renderEventRows(rows,'本輪沒有可用的重要消息。');}
  function renderTodayFocus(rows){return renderEventRows(rows,'目前沒有高影響等級的已驗證焦點。');}

  function renderPositions(value){
    if(!object(value)||value.status!=='AVAILABLE')return '<div class="empty-state" data-raw-status="UNAVAILABLE"><b>持倉資料不可用</b><span>本輪無法讀取正式模擬交易執行資料；不會把舊持倉顯示成最新狀態。</span></div>';
    const pending=Array.isArray(value.pending)?value.pending:[];
    const open=Array.isArray(value.open)?value.open:[];
    const rows=[...open.map(row=>({label:'OPEN',row})),...pending.map(row=>({label:'PENDING',row}))];
    const body=rows.length?`<div class="position-list">${rows.map(({label,row})=>`<article class="position-row" data-position-kind="${label}" data-raw-status="${esc(row.status||label)}"><div><span class="status-chip">${esc(statusLabel(label))}</span><b>${esc(row.symbol||'—')}</b><small>策略 ${esc(row.family||'—')} · ${esc(sideLabel(row.side))}</small></div><strong>${esc(statusLabel(row.status||label))}</strong></article>`).join('')}</div>`:'<div class="empty-state compact"><b>目前 0 筆活動中</b><span>沒有等待成交或持倉中的模擬交易。</span></div>';
    return `<div class="runtime-summary"><span class="safety-pill">僅模擬交易（PAPER ONLY）</span><small>執行引擎 ${esc(statusLabel(value.health))} · 帳本 ${value.ledgerIntegrity?'正常':'需檢查'} · ${esc(time(value.asOf))}</small></div>${body}`;
  }

  function sampleConfidence(sampleCount){
    const count=finite(sampleCount)?sampleCount:0;
    if(count<30)return Object.freeze({headline:'樣本不足 · 可信度低',detail:`距離初步判讀還差 ${30-count} 筆；目前績效僅供觀察，不作正式策略結論。`});
    if(count<100)return Object.freeze({headline:'已達初步樣本 · 可信度中低',detail:`距離較完整觀察樣本還差 ${100-count} 筆；仍需持續前瞻驗證。`});
    return Object.freeze({headline:'樣本較完整 · 仍需持續驗證',detail:'已達 100 筆以上平倉樣本，但仍需搭配市場環境、成本與回撤一起判讀。'});
  }

  function renderTradingResults(value){
    if(!object(value))return '<div class="empty-state" data-raw-status="UNAVAILABLE"><b>交易結果尚未取得</b><span>尚未取得已平倉模擬交易的正式統計。</span></div>';
    const m=object(value.metrics)?value.metrics:{};
    const confidence=sampleConfidence(value.sampleCount);
    return `<div class="metric-grid" data-raw-sample-status="${esc(value.sampleStatus||'UNAVAILABLE')}"><div><span>樣本數</span><b>${esc(number(value.sampleCount))}</b></div><div><span>勝率</span><b>${finite(m.winRate)?esc(pct(m.winRate)):'—'}</b></div><div><span>淨損益</span><b>${esc(number(m.netPnl))}</b></div><div><span>期望值（R）</span><b>${esc(number(m.expectancyR))}</b></div><div><span>獲利因子</span><b>${esc(number(m.profitFactor))}</b></div><div><span>交易成本</span><b>${esc(number(m.fees))}</b></div></div><div class="sample-confidence"><b>${esc(confidence.headline)}</b><p>${esc(confidence.detail)}</p></div><p class="muted">僅統計已平倉模擬交易 · ${esc(time(value.asOf))}</p>`;
  }

  function renderHomeSections(input){
    const value=assertViewModel(input);
    const unavailable=value.marketPulse.filter(x=>x.status==='UNAVAILABLE').length;
    return Object.freeze({
      schemaVersion:'foxyya-home-render/1',
      asOfLabel:new Date(value.asOf).toISOString(),
      dataHealthLabel:unavailable?`已驗證快照 · ${unavailable} 個市場資料不足`:'已驗證資料快照',
      decisionSummaryHtml:renderDecisionSummary(value),
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