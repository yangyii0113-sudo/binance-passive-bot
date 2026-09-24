import { EXIT_COSTS } from './target_analysis.js';
// Independent display scenarios. No live NAV, ledger mutation, or execution authorization.
export function researchRiskScenario(plan) {
  const sign=plan?.side==='LONG'?1:plan?.side==='SHORT'?-1:0;
  const prices=[plan?.entry,plan?.stop,plan?.tp1,plan?.tp2];
  if(!sign||prices.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<=0)||sign*(plan.entry-plan.stop)<=0||sign*(plan.tp1-plan.entry)<=0||sign*(plan.tp2-plan.tp1)<0)return null;
  const equity=1000,budget=equity*.0025;
  const scenario=multiplier=>{
    const fee=EXIT_COSTS.fee*multiplier,slippage=EXIT_COSTS.slippage*multiplier;
    const entry=plan.entry*(1+sign*slippage);
    const net=price=>{const exit=price*(1-sign*slippage);return sign*(exit-entry)-fee*(entry+exit);};
    return {entry,loss:-net(plan.stop),reward:(net(plan.tp1)+net(plan.tp2))/2};
  };
  const base=scenario(1),stress=scenario(2);
  if(!(base.loss>0)||![base.entry,base.loss,base.reward,stress.loss,stress.reward].every(Number.isFinite))return null;
  const quantity=Math.floor(Math.min(budget/base.loss,equity/base.entry)*1e8)/1e8;
  if(!Number.isFinite(quantity)||quantity<=0)return null;
  return {equity,budget,quantity,notional:quantity*base.entry,stopLoss:quantity*base.loss,targetPnl:quantity*base.reward,netRewardRisk:base.reward/base.loss,stressStopLoss:quantity*stress.loss,stressTargetPnl:quantity*stress.reward};
}
export function researchRiskView(plan){
  const r=researchRiskScenario(plan),n=v=>v.toFixed(2);
  if(!r)return '<p role="alert">風險資料不足或點位方向異常，不提供部位估算。</p>';
  return `<section class="research-risk" aria-label="研究風險情境"><strong>成本後情境 · 非預期收益</strong>
  <dl class="core-metrics"><div><dt>目標淨風報比</dt><dd>${n(r.netRewardRisk)}</dd></div><div><dt>研究部位名目上限</dt><dd>${n(r.notional)} USDT</dd></div><div><dt>直接止損情境</dt><dd>−${n(r.stopLoss)} USDT</dd></div><div><dt>兩段目標各成交一半</dt><dd>${n(r.targetPnl)} USDT</dd></div></dl>
  <p>${r.netRewardRisk<1?'目標淨風報比低於 1，成本後空間不足。':'仍須確認進場門檻與有效期限；情境獲利不等於預期獲利。'}</p>
  <p>固定研究本金 1,000 USDT，風險預算 0.25%（2.50 USDT），名目上限 1 倍；非你的帳戶淨值或可下單額度。</p>
  <p>同一部位雙倍成本：止損情境 −${n(r.stressStopLoss)} USDT，兩段目標情境 ${n(r.stressTargetPnl)} USDT。費率與滑價假設各加倍，不重新放大部位。</p>
  <p>單邊費率 0.05%＋滑價 0.02%；未含資金費率、數量精度與額外跳空。止損情境並非最大可能損失。</p>
  </section>`;
}
