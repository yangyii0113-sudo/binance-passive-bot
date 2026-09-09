(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_PRODUCT_RENDERER=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const list=value=>Array.isArray(value)?value:[];
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const time=value=>finite(value)?new Date(value).toISOString():'UNAVAILABLE';
  const number=value=>finite(value)?value.toLocaleString('en-US',{maximumFractionDigits:4}):'UNAVAILABLE';
  const labels={
    'price.close':'收盤價','flow.foreign_net':'外資買賣超','flow.investment_trust_net':'投信買賣超','flow.dealer_net':'自營商買賣超',
    'fundamental.revenue.monthly':'月營收','fundamental.revenue.yoy_pct':'月營收年增率',
    'inflation.cpi_index':'美國 CPI 指數','inflation.hicp_yoy':'歐元區 HICP 年增率',
    realtimeQuote:'即時價格',consensus:'市場共識',options:'選擇權'
  };
  const selected=field=>labels[field]||String(field).startsWith('fundamental.sec.');
  const label=field=>labels[field]||(String(field).startsWith('fundamental.sec.')?'SEC 申報營收':field);
  function lineageLink(ref){
    if(!/^out_[a-f0-9]{64}$/.test(ref))return '<small class="muted">Lineage UNAVAILABLE</small>';
    return `<a class="evidence-link" href="/v12/api/lineage/output/${ref}" data-lineage-ref="${ref}" aria-haspopup="dialog">查看來源證據 →</a>`;
  }
  function factsHtml(facts,{compact=false}={}){
    const rows=list(facts).filter(row=>!compact||selected(row.field));
    if(!rows.length)return '<p class="muted">來源數值 UNAVAILABLE</p>';
    return `<dl class="fact-list">${rows.map(row=>`<div><dt>${esc(label(row.field))}</dt><dd><b>${esc(number(row.status==='UNAVAILABLE'?null:row.value))}</b> <span>${esc(row.unit)}</span></dd><small>${esc(row.status)} · ${esc(row.source)}</small>${row.reportPeriod?`<small>資料月份 ${esc(row.reportPeriod)}</small>`:''}${row.reportEnd?`<small class="fact-age">${finite(row.receivedAt)&&row.receivedAt-Date.parse(row.reportEnd)>550*86400000?'歷史申報資料，非近期財報 · ':''}報告期間 ${esc(row.reportStart||'—')} → ${esc(row.reportEnd)} · 申報 ${esc(row.filedDate)}</small><small>以取得時間為準 · 歷史時點安全性 ${row.pointInTimeSafe?'已驗證':'未驗證'}</small>`:''}<small>觀測 ${esc(time(row.observedAt))}</small><small>取得 ${esc(time(row.receivedAt))}</small></div>`).join('')}</dl>`;
  }
  function researchHtml(row){
    const research=row.research||{},early=row.earlyTrend||{};
    const missing=[...list(research.missingDimensions),...Object.entries(row.dataGaps||{}).filter(([,value])=>value==='UNAVAILABLE').map(([key])=>labels[key]||key)];
    return `<article class="research-card" data-research-card="${esc(row.instrumentId)}"><div class="research-title"><b>${esc(row.instrumentId)}</b><span class="status-chip">RESEARCH</span></div><p>${esc(row.direction)} · Confidence ${number(finite(research.confidence)?research.confidence*100:null)}% · ${esc(row.earlyStage)}</p><small class="muted">研究更新 ${esc(time(row.asOf))}</small>${factsHtml(row.facts,{compact:true})}<details><summary>研究依據與資料缺口</summary><p>研究維度 ${esc(Object.keys(research.dimensions||{}).join(' · ')||'UNAVAILABLE')}</p><p>尚缺 ${esc(missing.join(' · ')||'無')} · UNAVAILABLE</p><p>下一步確認：${esc(list(early.nextConfirmation).join('；')||'等待可驗證的研究證據')}</p><p>失效條件：${esc(list(early.invalidations).join('；')||'UNAVAILABLE')}</p><p>相反證據：${esc(list(research.contradictions).map(x=>x.label||x.source).join('；')||'目前未提供')}</p></details>${lineageLink(row.lineageRef)}</article>`;
  }
  function diagnosticsHtml(value){
    if(!value)return '<p class="muted">Provider Diagnostics UNAVAILABLE</p>';
    const datasets=list(value.datasets);
    return `<p class="muted">${esc(value.status)} · 檢查時間 ${esc(time(value.asOf))} · 連線成功與資料可用性分開顯示</p><div class="diagnostics-grid">${list(value.providers).map(row=>`<article class="provider-card"><div class="research-title"><b>${esc(row.name)}</b><span class="status-chip">${esc(row.health)}</span></div><small>HTTP ${esc(row.lastHttpStatus??'—')} · ${esc(row.lastLatencyMs??'—')} ms</small><small>最後成功 ${esc(time(row.lastSuccessAt))}</small><small>最後失敗 ${esc(time(row.lastFailureAt))}</small><small>限流 ${esc(row.rateLimit?.state||'UNAVAILABLE')} · Circuit ${esc(row.circuit?.state||'UNAVAILABLE')}</small>${datasets.filter(x=>x.sourceId===row.providerId).map(x=>`<div class="dataset-row"><b>${esc(x.datasetId)}</b><span>${esc(x.subjectId||'')} · ${esc(x.status)}</span>${x.reason?`<strong>${esc(x.reason)}</strong>`:''}<small>觀測 ${esc(time(x.observedAt))}</small><small>取得 ${esc(time(x.receivedAt))}</small></div>`).join('')||'<p class="muted">本輪未請求 · UNAVAILABLE</p>'}</article>`).join('')}</div>`;
  }
  return Object.freeze({factsHtml,researchHtml,diagnosticsHtml,lineageLink,escapeHtml:esc,time,number});
});
