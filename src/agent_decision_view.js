import { agentPlanStatus } from './agent_trade_plan.js';
import { FAMILY_NAMES } from './strategy_families.js';
import { researchRiskScenario } from './research_risk_view.js';
import { escapeHtml as esc, displayDate } from './ui.js';

// Presentation only: the existing gate is the sole source of displayable levels.
export function agentPlanPresentation(record, now=Date.now()) {
  const result=agentPlanStatus(record,now);
  const strategies=record?.row?.analysis?.strategies;
  const incomplete=Array.isArray(strategies) && strategies.some(p=>p?.status==='BLOCKED');
  const labels={
    empty:['尚未分析','尚未取得','neutral'],
    loading:['核對中','讀取中','neutral'],
    blocked:['停止判斷','不足或異常','blocked'],
    expired:['需重新判斷','已過期','caution'],
    conflict:['方向衝突','本次核對完整','caution'],
    wait:['等待條件','本次核對完整','neutral'],
    plan:['研究條件成立','本次核對完整','ready']
  };
  const [strategy,data,tone]=labels[result.key];
  return {result,strategy:incomplete && result.key==='wait'?'尚待核對':strategy,
    data:incomplete && ['plan','wait','conflict'].includes(result.key)?'部分待核對':data,tone};
}

export function agentPlanStateView(record, now=Date.now()) {
  const p=agentPlanPresentation(record,now);
  return `<dl class="plan-status-pair" aria-label="策略與行情資料狀態">
    <div data-strategy-state="${p.result.key}" class="plan-state-${p.tone}"><dt>策略條件</dt><dd>${p.strategy}</dd></div>
    <div data-plan-data-state><dt>行情資料</dt><dd>${p.data}</dd></div>
  </dl>`;
}

const quote=value=>value.toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:value<1?8:3});
export function agentDecisionCard(record, {now=Date.now()}={}) {
  const {result}=agentPlanPresentation(record,now), symbol=esc(record.symbol);
  const waits=result.key==='wait'?(record.row?.analysis?.strategies || []).map(p=>`<li><strong>${esc(FAMILY_NAMES[p.key])}</strong>：${esc(p.reason || '等待收盤條件成立')}</li>`).join(''):'';
  return `<article class="agent-decision-card" aria-label="${symbol} 進退場摘要">
    <div class="decision-heading"><h3>${symbol}</h3><span>僅模擬觀察</span></div>
    ${agentPlanStateView(record,now)}
    ${result.plans.length?result.plans.map(plan=>{
      const risk=researchRiskScenario(plan);
      return `<section class="decision-scenario" aria-label="${esc(FAMILY_NAMES[plan.key])} 點位摘要">
        <h4>${esc(FAMILY_NAMES[plan.key])} · ${plan.side==='LONG'?'做多':'做空'}</h4>
        <dl class="decision-levels">
          <div class="decision-entry"><dt>進場門檻 · ${plan.side==='LONG'?'向上突破':'向下跌破'}</dt><dd>${quote(plan.entry)} <small>USDT</small></dd></div>
          <div class="decision-stop"><dt>止損點 · 全部剩餘部位</dt><dd>${quote(plan.stop)} <small>USDT</small></dd></div>
          <div><dt>第一止盈 · 50%</dt><dd>${quote(plan.tp1)} <small>USDT</small></dd></div>
          <div><dt>第二止盈 · 剩餘 50%</dt><dd>${quote(plan.tp2)} <small>USDT</small></dd></div>
        </dl>
        <p class="decision-reward">成本後目標風報比 <strong>${risk.netRewardRisk.toFixed(2)}</strong><span>兩段目標各成交一半的情境，非預期收益；未含資金費率。</span></p>
        <p class="decision-validity">進場有效至 ${displayDate(plan.expiresAt)}；點位核對有效至 ${displayDate(record.snapshotUntil)}，先到者為準。</p>
      </section>`;
    }).join(''):`<p class="decision-conclusion">${result.key==='loading'?'正在核對，暫不顯示點位。':'建議：暫不進場。'}</p>`}
    <p class="decision-reason" role="status">${result.key==='plan'?'建議：僅列入條件式模擬觀察；觸發前不進場，同幣多方案不可重複累加部位。':esc(result.reason)}</p>
    ${waits?`<ul class="agent-plan-waits">${waits}</ul>`:''}
    <p class="decision-lock">真實下單鎖定 · 正式帳本、最新淨值與完整部位尚未核對。</p>
    <div class="decision-actions"><button type="button" class="primary-inline-btn" data-agent-plan-refresh="${symbol}" ${result.key==='loading'?'disabled':''}>${result.key==='loading'?'核對中…':'重新核對行情'}</button><button type="button" class="secondary-btn" data-agent-plan-open="${symbol}">策略依據與完整規則</button></div>
  </article>`;
}
