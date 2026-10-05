import { escapeHtml as esc } from './ui.js';
// Closed-hourly research observations only; never creates entry or exit levels.
export function huntAnalysis(rows,{atr,ema,breakout}){
 const recent=rows.slice(-5),prior=rows.slice(-25,-5),last=rows.at(-1);
 const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
 const range=r=>+r[2]-r[3];
 const compression=mean(prior.map(range))>0?mean(recent.map(range))/mean(prior.map(range)):null;
 const priorVolume=mean(prior.map(r=>+r[5]));
 const volumeChange=priorVolume>0?mean(recent.map(r=>+r[5]))/priorVolume:null;
 const extensionAtr=atr>0?Math.abs(+last[4]-ema)/atr:null;
 const confirmed=breakout?.observations?.breakout===true&&breakout.observations.volumePassed===true;
 const stage=extensionAtr>2?'EXTENDED':confirmed?'BREAKOUT':compression!==null&&compression<=.7?'ACCUMULATION':'WATCH';
 return {version:'hunt-v1',closedAt:+last[6],stage,compression,volumeChange,extensionAtr};
}
const labels={EXTENDED:'⚠ 追高／追空風險',BREAKOUT:'◉ 放量突破證據',ACCUMULATION:'◷ 波幅收斂・蓄勢觀察',WATCH:'◷ 流動性觀察'};
export function huntView(analysis,now=Date.now()){
 const h=analysis?.hunt;
 if(analysis?.status!=='VALID'||analysis.validUntil<=now||h?.version!=='hunt-v1'||h.closedAt!==analysis.closedAt||!labels[h.stage])return '';
 const n=v=>Number.isFinite(v)?v.toFixed(2):'—';
 return `<div class="hunt-observation"><p class="guard-note">${esc(labels[h.stage])} · 研究訊號</p><details class="core-disclosure"><summary>蓄勢／突破依據</summary><p>近 5 根平均波幅／前 20 根：${n(h.compression)} 倍；均量：${n(h.volumeChange)} 倍；距 20 期均線：${n(h.extensionAtr)} ATR。</p><p>波幅比 ≤ 0.70 為收斂觀察；距均線超過 2 ATR 標記延伸風險。放量突破沿用原有 20 根區間與 1.5 倍量能規則。這些是固定研究分組，不是暴漲機率；蓄勢可能失敗，不產生可用點位，也不更改 Gate。</p></details></div>`;
}
