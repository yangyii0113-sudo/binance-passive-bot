import { researchRiskScenario } from './research_risk_view.js';
import { formatPlanPrice, exactPlanLevelsView } from './plan_levels_view.js';
import { escapeHtml as esc } from './ui.js';

// Price increases left to right for BOTH directions. This is a snapshot, not a fill.
export function planPriceMap(plan, snapshotPrice) {
  if (!researchRiskScenario(plan)) return null;
  const values=[plan.stop,plan.entry,plan.tp1,plan.tp2];
  const quote=typeof snapshotPrice==='number'&&Number.isFinite(snapshotPrice)&&snapshotPrice>0?snapshotPrice:null;
  const min=Math.min(...values,...(quote===null?[]:[quote])),max=Math.max(...values,...(quote===null?[]:[quote]));
  if(!(max>min))return null;
  const position=value=>5+90*(value-min)/(max-min);
  return {stop:position(plan.stop),entry:position(plan.entry),tp1:position(plan.tp1),tp2:position(plan.tp2),quote:quote===null?null:position(quote)};
}
export function planPriceMapView(plan,quote) {
  const map=planPriceMap(plan,quote);if(!map)return '';
  const segment=(a,b,tone)=>`<span class="price-map-zone ${tone}" style="left:${Math.min(a,b)}%;width:${Math.abs(a-b)}%"></span>`;
  return `<div class="plan-price-map" aria-label="價格位置圖，價格由左向右遞增">
    <div class="price-map-caption"><span>價格位置 · ${plan.side==='LONG'?'做多':'做空'}</span><span>低價 → 高價</span></div>
    <div class="price-map-track" aria-hidden="true">${segment(map.stop,map.entry,'risk')}${segment(map.entry,map.tp2,'reward')}${[['stop','損'],['entry','進'],['tp1','一'],['tp2','二']].map(([key,label])=>`<i class="price-map-mark ${key}" style="left:${map[key]}%"><b>${label}</b></i>`).join('')}${map.quote===null?'':`<i class="price-map-quote" style="left:${map.quote}%"></i>`}</div>
    <p class="price-map-key">損＝止損 · 進＝進場 · 一／二＝止盈${plan.tp1===plan.tp2?'（目標重合）':''}${map.quote===null?' · 參考價待更新':`<br>● 核對時參考價 ${esc(formatPlanPrice(quote))} USDT · 非即時串流`}</p>
  </div>`;
}
export function homePlanVisual(plan,quote) {
  const risk=researchRiskScenario(plan);if(!risk)return '';
  return `${planPriceMapView(plan,quote)}${exactPlanLevelsView(plan)}<dl class="action-risk-metrics"><div><dt>目標淨風報</dt><dd>${risk.netRewardRisk.toFixed(2)} 倍</dd></div><div><dt>預估止損損失</dt><dd class="risk-money">−${risk.stopLoss.toFixed(2)} USDT</dd></div></dl><details class="core-disclosure action-risk-detail"><summary>模擬部位與成本假設</summary><p>固定研究本金 1,000 USDT、風險預算 0.25%；模擬名目部位 ${risk.notional.toFixed(2)} USDT。不是你的帳戶淨值或可下單額度。</p><p>兩段目標各 50% 的成本後情境損益 ${risk.targetPnl.toFixed(2)} USDT，非預期收益。單邊費率 0.05%＋滑價 0.02%，未含資金費率及額外跳空，止損損失並非保證上限。多策略獨立比較，不累加部位。</p></details>`;
}
