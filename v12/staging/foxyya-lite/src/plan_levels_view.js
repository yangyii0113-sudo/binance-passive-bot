import { researchProtectionStop } from './research_risk_view.js';

// Display prices to two decimal places; strategy levels keep their full precision.
export function formatPlanPrice(value) {
  if (value===null || value===undefined || value==='' || !Number.isFinite(Number(value)) || Number(value)<=0) return '—';
  const n=Number(value);
  // A positive sub-cent price must not look like a zero-price entry or stop.
  if(n<0.005) return '小於 0.01';
  return n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}

// Keep the compact two-decimal display, but make distinct research thresholds
// readable when that display collapses them to the same price.
export function exactPlanLevelsView(plan){
  const fields=[['進場門檻',plan?.entry],['第一止盈',plan?.tp1],['第二止盈',plan?.tp2],['止損點',plan?.stop]];
  if(fields.some(([,v])=>typeof v!=='number'||!Number.isFinite(v)||v<=0))return '';
  const values=fields.map(([,v])=>v),labels=values.map(formatPlanPrice);
  if(!labels.includes('小於 0.01')&&new Set(labels).size===new Set(values).size)return '';
  return `<details class="core-disclosure exact-plan-levels" data-search="exact-plan-${plan.entry}-${plan.stop}"><summary>兩位顯示不足以區分，查看精確研究點位</summary><dl class="analysis-metrics">${fields.map(([name,value])=>`<div><dt>${name}</dt><dd>${String(value)} USDT</dd></div>`).join('')}</dl><p>以上保留策略計算值；仍未對齊交易所委託精度，僅供研究核對。</p></details>`;
}

export function priceMove(from,to,{pending=false}={}) {
  if (![from,to].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)) return '價格距離待核對';
  const change=(to/from-1)*100, magnitude=Math.abs(change);
  const amount=magnitude>0&&magnitude<0.01?'小於 0.01':magnitude.toFixed(2);
  return `${pending?'尚需':'價格'}${change>=0?'上漲':'下跌'} ${amount}%`;
}

export function planExitGuide(plan) {
  const protection=(plan.key==='structured'||(!plan.key&&plan.targetAnalysis))?researchProtectionStop(plan):null;
  return `<section class="plan-exit-guide" aria-label="分批出場與止損規則">
    <h5>第一止盈之後</h5>
    <p>${protection!==null?`下一根一小時 K 棒起，剩餘部位改用成本保護止損 <strong>${formatPlanPrice(protection)} USDT</strong>；當根仍用原止損。此為門檻成交的成本估算，前向模擬依實際觀測進場價重算。`:`剩餘 50% 等第二止盈；止損維持 <strong>${formatPlanPrice(plan.stop)} USDT</strong>，不放寬、不攤平。`}</p>
    <p>持有中先觸及有效止損，就退出全部剩餘部位。跳空可能成交更差。</p>
    <details class="core-disclosure"><summary>最長持有 48 根一小時 K 棒</summary><p>含進場棒。歷史比較以第 48 根收盤退出；本機前向模擬在到期邊界後第一筆連續觀測價格退出。行情中斷就停止判定，不補算成交。</p></details>
  </section>`;
}
