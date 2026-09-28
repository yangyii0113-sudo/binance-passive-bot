import { escapeHtml } from './ui.js';
const stages=[['dataBlocked','資料不足／異常'],['trendWait','四小時趨勢未成立'],['pullbackWait','一小時回調未成立'],['extendedWait','離均線過遠'],['riskBlocked','風險距離無效'],['skipped','結構空間／成本不合格'],['noEntry','下一根未成交']];
export function comparisonDiagnostics(result){
  const panel=(label,section)=>{
    const entries=[['原版',section.baseline],['新版',section.enhanced],...(section.stress?[['新版雙倍成本',section.stress]]:[])];
    return `<div class="diagnostic-grid">${entries.map(([name,m])=>{
      const d=m.diagnostics;
      if(!d)return `<article class="detail-card"><strong>${label} · ${name}</strong><p>此筆歷史未記錄診斷，重新比較後才會產生；不推估或回填舊數字。</p></article>`;
      const counts=stages.map(([key,text])=>({text,count:key==='skipped'?m.skipped:d[key]}));
      const highest=Math.max(...counts.map(x=>x.count));
      const leading=counts.filter(x=>x.count===highest&&highest>0).map(x=>x.text).join('、');
      return `<article class="detail-card"><strong>${label} · ${name}</strong><p>主要排除階段：${escapeHtml(leading||'沒有排除紀錄')}</p><dl class="diagnostic-counts"><div><dt>實際評估時點</dt><dd>${d.evaluated}</dd></div>${counts.map(x=>`<div><dt>${x.text}</dt><dd>${x.count}</dd></div>`).join('')}<div><dt>研究條件成立</dt><dd>${m.signals}</dd></div><div><dt>完成交易</dt><dd>${m.trades}</dd></div></dl><p>未成交細分：跳空越過進場 ${d.entryGap}、開盤已達止損 ${d.stopGap}、未突破 ${d.noBreakout}、後續資料不足 ${d.missingFuture}。</p>${Object.entries(m.skipReasons||{}).map(([reason,count])=>`<p>${escapeHtml(reason)}：${count} 次</p>`).join('')}</article>`;
    }).join('')}</div>`;
  };
  return `<section aria-label="樣本不足診斷"><h4>樣本不足診斷</h4><p>依第一個未通過條件分類；評估時點＝各排除階段＋完成交易。研究條件成立為中間小計，不重複加總。持倉期間略過的時點不計入；各規則可能因持倉時間不同而有不同分母，主要排除階段不等於應放寬的門檻。</p>${panel('前段 70%',result.development)}${panel('後段 30%',result.holdout)}</section>`;
}
