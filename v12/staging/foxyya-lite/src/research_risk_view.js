import { EXIT_COSTS } from './target_analysis.js';
export function researchProtectionStop(plan) {
  if (!researchRiskScenario(plan)) return null;
  return protectionLevel(plan);
}
function protectionLevel(plan) {
  const {fee,slippage}=EXIT_COSTS;
  const sign=plan.side==='LONG'?1:-1, entry=plan.entry*(1+sign*slippage);
  const level=sign===1?entry*(1+fee)/((1-slippage)*(1-fee)):entry*(1-fee)/((1+slippage)*(1+fee));
  return sign===1?Math.max(plan.stop,level):Math.min(plan.stop,level);
}
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
    return {entry,loss:-net(plan.stop),reward:(net(plan.tp1)+net(plan.tp2))/2,tp1:net(plan.tp1),net};
  };
  const base=scenario(1),stress=scenario(2);
  if(!(base.loss>0)||![base.entry,base.loss,base.reward,stress.loss,stress.reward].every(Number.isFinite))return null;
  const quantity=Math.floor(Math.min(budget/base.loss,equity/base.entry)*1e8)/1e8;
  if(!Number.isFinite(quantity)||quantity<=0)return null;
  const partialPath=plan.tp1!==plan.tp2;
  const protectedPlan=plan.key==='structured'||(!plan.key&&plan.targetAnalysis);
  return {equity,budget,quantity,notional:quantity*base.entry,stopLoss:quantity*base.loss,targetPnl:quantity*base.reward,netRewardRisk:base.reward/base.loss,stressStopLoss:quantity*stress.loss,stressTargetPnl:quantity*stress.reward,
    stressRewardRisk:stress.reward/stress.loss,
    tp1ThenStop:partialPath?quantity*(base.tp1-base.loss)/2:null,
    tp1ThenProtection:partialPath&&protectedPlan?quantity*(base.tp1+base.net(protectionLevel(plan)))/2:null};
}
const signed=v=>`${v<0?'−':v>0?'+':''}${Math.abs(v).toFixed(2)}`;
export function riskPathView(plan,r=researchRiskScenario(plan)){
  if(!r)return '';
  return `<details class="core-disclosure risk-paths" data-search="risk-paths-${plan.key||'structured'}"><summary>止盈後回吐與成本壓力</summary>
    <dl class="analysis-metrics">${r.tp1ThenStop===null?'':`<div><dt>先止盈 50%，剩餘回原止損</dt><dd>${signed(r.tp1ThenStop)} USDT</dd></div>`}
    ${r.tp1ThenProtection===null?'':`<div><dt>第一止盈後，下根觸及保護止損</dt><dd>${signed(r.tp1ThenProtection)} USDT</dd></div>`}
    <div><dt>雙倍成本 · 直接止損</dt><dd>−${r.stressStopLoss.toFixed(2)} USDT</dd></div>
    <div><dt>雙倍成本 · 兩段目標各 50%</dt><dd>${signed(r.stressTargetPnl)} USDT</dd></div>
    <div><dt>雙倍成本 · 目標淨風報比</dt><dd>${r.stressRewardRisk.toFixed(2)}</dd></div></dl>
    <p>${r.tp1ThenStop===null?'兩個止盈目標相同，不假設中間還有等待第二目標的部位。':r.tp1ThenStop<0?'先到第一止盈仍可能整筆虧損；不能視為已鎖定獲利。':'第一止盈後仍有回吐風險，需依剩餘部位的有效止損處理。'}${r.tp1ThenProtection!==null?'結構止盈的保護止損從下一根起生效；觸及原止損的同根衝突仍先算止損。':''}</p>
    <p>${r.stressRewardRisk<1?'雙倍成本下目標淨風報比低於 1，成本容錯空間較小。':'雙倍成本情境仍有目標空間，但不代表有足夠勝率。'}固定相同研究部位，費率與滑價各加倍；未含資金費率與額外跳空。門檻成交情境不是實際成交結果。</p>
  </details>`;
}
export function researchRiskView(plan){
  const r=researchRiskScenario(plan),n=v=>v.toFixed(2);
  if(!r)return '<p role="alert">風險資料不足或點位方向異常，不提供部位估算。</p>';
  return `<section class="research-risk" aria-label="研究風險情境"><strong>成本後情境 · 非預期收益</strong>
  <dl class="core-metrics"><div><dt>目標淨風報比</dt><dd>${n(r.netRewardRisk)}</dd></div><div><dt>研究部位名目上限</dt><dd>${n(r.notional)} USDT</dd></div><div><dt>直接止損情境</dt><dd>−${n(r.stopLoss)} USDT</dd></div><div><dt>兩段目標各成交一半</dt><dd>${n(r.targetPnl)} USDT</dd></div></dl>
  <p>${r.netRewardRisk<1?'目標淨風報比低於 1，成本後空間不足。':'仍須確認進場門檻與有效期限；情境獲利不等於預期獲利。'}</p>
  <p>固定研究本金 1,000 USDT，風險預算 0.25%（2.50 USDT），名目上限 1 倍；非你的帳戶淨值或可下單額度。</p>
  ${riskPathView(plan,r)}
  <p>單邊費率 0.05%＋滑價 0.02%；未含資金費率、數量精度與額外跳空。止損情境並非最大可能損失。</p>
  </section>`;
}
