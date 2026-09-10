(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_PRODUCT_RENDERER=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const list=value=>Array.isArray(value)?value:[];
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const time=value=>finite(value)?new Date(value).toISOString():'—';
  const number=value=>finite(value)?value.toLocaleString('en-US',{maximumFractionDigits:4}):'—';
  const labels={
    'price.close':'收盤價','flow.foreign_net':'外資買賣超','flow.investment_trust_net':'投信買賣超','flow.dealer_net':'自營商買賣超',
    'fundamental.revenue.monthly':'月營收','fundamental.revenue.yoy_pct':'月營收年增率',
    'inflation.cpi_index':'美國 CPI 指數','labor.unemployment_rate':'美國失業率','employment.nonfarm_payroll':'美國非農就業人數',
    'inflation.hicp_yoy':'歐元區 HICP 年增率','rates.main_refinancing':'歐元區主要再融資利率','rates.deposit_facility':'歐元區存款機制利率',
    realtimeQuote:'即時價格',consensus:'市場共識',options:'選擇權'
  };
  const statusLabels={AVAILABLE:'可用',UNAVAILABLE:'不可用',SNAPSHOT:'快照',DELAYED:'延遲',LIVE:'即時',LIVE_SOURCE:'即時來源',STALE:'過期',HEALTHY:'健康',DEGRADED:'降級',READY:'就緒',OPEN:'啟用',CLOSED:'關閉'};
  const directionLabels={POSITIVE:'偏正向',NEGATIVE:'偏負向',BULLISH:'偏多',BEARISH:'偏空',STRONG_BULLISH:'強勢偏多',STRONG_BEARISH:'強勢偏空',NEUTRAL:'中性',UNAVAILABLE:'暫不判斷'};
  const stageLabels={DETECT:'偵測',EARLY_WATCH:'早期觀察',ACCUMULATION:'累積',CONFIRMING:'確認中',READY:'條件就緒',INVALIDATED:'已失效',UNAVAILABLE:'尚未形成'};
  const unitLabels={PCT:'%',INDEX:'指數',USD:'美元',TWD:'新台幣',SHARES:'股',THOUSANDS:'千人'};
  const status=value=>statusLabels[String(value??'UNAVAILABLE').toUpperCase()]||String(value??'—');
  const direction=value=>directionLabels[String(value??'UNAVAILABLE').toUpperCase()]||String(value??'暫不判斷');
  const stage=value=>stageLabels[String(value??'UNAVAILABLE').toUpperCase().replaceAll(' ','_')]||String(value??'—');
  const unit=value=>unitLabels[String(value??'').toUpperCase()]||String(value??'');
  const selected=field=>labels[field]||String(field).startsWith('fundamental.sec.');
  const label=field=>labels[field]||(String(field).startsWith('fundamental.sec.')?'SEC 申報營收':field);
  function lineageLink(ref){
    if(!/^out_[a-f0-9]{64}$/.test(ref))return '<small class="muted" data-raw-status="UNAVAILABLE">來源追溯尚未建立</small>';
    return `<a class="evidence-link" href="/v12/api/lineage/output/${ref}" data-lineage-ref="${ref}" aria-haspopup="dialog">查看來源證據 →</a>`;
  }
  function factsHtml(facts,{compact=false}={}){
    const rows=list(facts).filter(row=>!compact||selected(row.field));
    if(!rows.length)return '<p class="muted" data-raw-status="UNAVAILABLE">來源數值尚未取得</p>';
    return `<dl class="fact-list">${rows.map(row=>`<div data-raw-status="${esc(row.status||'UNAVAILABLE')}"><dt>${esc(label(row.field))}</dt><dd><b>${esc(number(row.status==='UNAVAILABLE'?null:row.value))}</b> <span>${esc(unit(row.unit))}</span></dd><small>${esc(status(row.status))} · ${esc(row.source)}</small>${row.reportPeriod?`<small>資料月份 ${esc(row.reportPeriod)}</small>`:''}${row.reportEnd?`<small class="fact-age">${finite(row.receivedAt)&&row.receivedAt-Date.parse(row.reportEnd)>550*86400000?'歷史申報資料，非近期財報 · ':''}報告期間 ${esc(row.reportStart||'—')} → ${esc(row.reportEnd)} · 申報 ${esc(row.filedDate)}</small><small>以取得時間為準 · 歷史時點安全性 ${row.pointInTimeSafe?'已驗證':'未驗證'}</small>`:''}<small>觀測 ${esc(time(row.observedAt))}</small><small>取得 ${esc(time(row.receivedAt))}</small></div>`).join('')}</dl>`;
  }
  function researchHtml(row){
    const research=row.research||{},early=row.earlyTrend||{};
    const missing=[...list(research.missingDimensions),...Object.entries(row.dataGaps||{}).filter(([,value])=>value==='UNAVAILABLE').map(([key])=>labels[key]||key)];
    const confidence=finite(research.confidence)?`${Math.round(research.confidence*100)}%`:'—';
    return `<article class="research-card" data-research-card="${esc(row.instrumentId)}" data-favorite-card="${esc(row.instrumentId)}" data-mode="RESEARCH"><div class="research-title"><b>${esc(row.instrumentId)}</b><div><span class="status-chip">研究</span><button class="text-btn favorite-btn" data-favorite-id="${esc(row.instrumentId)}" aria-pressed="false" title="本機收藏，不同步帳號">☆ 收藏</button></div></div><p>${esc(direction(row.direction))} · 研究可信度 ${esc(confidence)} · ${esc(stage(row.earlyStage))}</p><small class="muted">研究更新 ${esc(time(row.asOf))}</small>${factsHtml(row.facts,{compact:true})}<details><summary>研究依據與資料缺口</summary><p>研究維度 ${esc(Object.keys(research.dimensions||{}).join(' · ')||'尚未建立')}</p><p>尚缺 ${esc(missing.join(' · ')||'無')}</p><p>下一步確認：${esc(list(early.nextConfirmation).join('；')||'等待可驗證的研究證據')}</p><p>失效條件：${esc(list(early.invalidations).join('；')||'尚未定義')}</p><p>相反證據：${esc(list(research.contradictions).map(x=>x.label||x.source).join('；')||'目前未提供')}</p></details>${lineageLink(row.lineageRef)}</article>`;
  }
  function diagnosticsHtml(value){
    if(!value)return '<p class="muted" data-raw-status="UNAVAILABLE">資料來源診斷尚不可用</p>';
    const datasets=list(value.datasets);
    return `<p class="muted">${esc(status(value.status))} · 檢查時間 ${esc(time(value.asOf))} · 連線成功與資料可用性分開顯示</p><div class="diagnostics-grid">${list(value.providers).map(row=>`<article class="provider-card"><div class="research-title"><b>${esc(row.name)}</b><span class="status-chip" data-raw-health="${esc(row.health||'UNAVAILABLE')}">${esc(status(row.health))}</span></div><small>HTTP 狀態 ${esc(row.lastHttpStatus??'—')} · 延遲 ${esc(row.lastLatencyMs??'—')} 毫秒</small><small>最後成功 ${esc(time(row.lastSuccessAt))}</small><small>最後失敗 ${esc(time(row.lastFailureAt))}</small><small>限流 ${esc(status(row.rateLimit?.state))} · 熔斷 ${esc(status(row.circuit?.state))}</small>${datasets.filter(x=>x.sourceId===row.providerId).map(x=>`<div class="dataset-row" data-raw-status="${esc(x.status||'UNAVAILABLE')}"><b>${esc(x.datasetId)}</b><span>${esc(x.subjectId||'')} · ${esc(status(x.status))}</span>${x.reason?`<strong>${esc(x.reason)}</strong>`:''}<small>觀測 ${esc(time(x.observedAt))}</small><small>取得 ${esc(time(x.receivedAt))}</small></div>`).join('')||'<p class="muted" data-raw-status="UNAVAILABLE">本輪未請求</p>'}</article>`).join('')}</div>`;
  }
  return Object.freeze({factsHtml,researchHtml,diagnosticsHtml,lineageLink,escapeHtml:esc,time,number});
});