import { researchProtectionStop } from './research_risk_view.js';

// Research prices retain up to 12 significant digits. Formatting never changes
// the strategy levels or pretends to round an executable exchange order.
export function formatPlanPrice(value) {
  if (value===null || value===undefined || value==='' || !Number.isFinite(Number(value)) || Number(value)<=0) return '—';
  const n=Number(value);
  if(n<1e-18) return n.toExponential(11);
  const decimals=Math.min(20,Math.max(3,11-Math.floor(Math.log10(n))));
  return n.toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:decimals});
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
