import { planPriceMapView } from './plan_price_map.js';
import { coinIdentity } from './coin_logo.js';
import { readinessView } from './advice_monitor_view.js';
import { adviceDisplayStatus } from './advice_display_status.js';
import { agentPlanStatus } from './agent_trade_plan.js';
import { FAMILY_NAMES } from './strategy_families.js';
import { researchRiskScenario, riskPathView } from './research_risk_view.js';
import { coinTrendView } from './coin_trend_view.js';
import { agentComparisonView } from './agent_comparison_view.js';
import { escapeHtml as esc, displayDate } from './ui.js';
import { formatPlanPrice as quote, priceMove, planExitGuide, exactPlanLevelsView } from './plan_levels_view.js';
import { strategyActionSummary, strategyEvidenceView } from './strategy_evidence_view.js';

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
  return {result,strategy:result.key==='wait'?(incomplete?'尚待核對':adviceDisplayStatus(record,now).label):strategy,
    data:incomplete && ['plan','wait','conflict'].includes(result.key)?'部分待核對':data,tone};
}

export function agentPlanStateView(record, now=Date.now()) {
  const p=agentPlanPresentation(record,now);
  return `<dl class="plan-status-pair" aria-label="策略與行情資料狀態">
    <div data-strategy-state="${p.result.key}" class="plan-state-${p.tone}"><dt>策略條件</dt><dd>${p.strategy}</dd></div>
    <div data-plan-data-state><dt>行情資料</dt><dd>${p.data}</dd></div>
  </dl>`;
}

export function agentActionLabel(record, now=Date.now()) {
  const display=adviceDisplayStatus(record,now);
  return ['empty','loading','plan'].includes(display.gate.key)?`◷ ${display.label}`:`${display.gate.key==='wait'?'◷ 等待確認':'! 暫停'} · 暫不進場 · ${display.label}`;
}
export function agentDecisionCard(record, {now=Date.now(),comparison,comparisonBusy=false}={}) {
  if(record.row && record.row.symbol!==record.symbol)record={...record,status:'BLOCKED',reason:'分析標的與本幣不符，請重新核對。'};
  const display=adviceDisplayStatus(record,now), result=display.gate, symbol=esc(record.symbol);
  return `<article class="agent-decision-card" aria-label="${symbol} 進退場摘要">
    <div class="decision-heading">${coinIdentity(record.symbol,{large:true})}<span>短線 · 1 小時策略</span></div>
    <div class="decision-verdict ${result.key==='plan'?'priority-entry':''}" data-advice-verdict="${result.key}"><span>目前建議</span><strong>${result.key==='plan'?'✓ 條件成立・待觸發':agentActionLabel(record,now)}</strong></div>
    ${strategyActionSummary(record,{now,includeNext:false})}
    <p class="decision-reason" role="status">${result.key==='plan'?'僅列入條件式模擬觀察，尚未確認觸發或成交。只在下列條件與期限內觀察。':esc(display.reason)}</p>

    ${result.key==='plan'?'':`<details class="core-disclosure" data-search="decision-evidence-${symbol}"><summary>查看平台判定依據</summary>${strategyEvidenceView(record,{now})}</details>`}
    ${result.plans.length?result.plans.map((plan,index)=>{
      const risk=researchRiskScenario(plan), snapshot=record.marketSnapshot;
      return `${index?`<details class="core-disclosure decision-other-plan"><summary>其他策略 · ${esc(FAMILY_NAMES[plan.key])} · ${plan.side==='LONG'?'做多':'做空'}</summary>`:''}<section class="decision-scenario" aria-label="${esc(FAMILY_NAMES[plan.key])} 點位摘要">
        <h4>${plan.side==='LONG'?'做多方案':'做空方案'} · ${esc(FAMILY_NAMES[plan.key])}</h4>
        <div class="decision-quote"><span>核對時參考價 <strong>${quote(snapshot.price)} USDT</strong></span><span>${priceMove(snapshot.price,plan.entry,{pending:true})} 才到進場門檻</span><small>合約當根 K 線快照 · 非串流報價 · 取得 ${displayDate(snapshot.receivedAt)}</small></div>
        ${planPriceMapView(plan,snapshot.price)}
        ${exactPlanLevelsView(plan)}
        <p class="decision-price-note">止盈一／二各退出原部位 50%；止損退出剩餘部位，不放寬、不攤平。跳空可能超過止損情境損失。</p>
        <p class="decision-trigger"><strong>何時考慮：</strong>先重新核對行情；確認仍有效後，${plan.side==='LONG'?'向上突破':'向下跌破'} ${quote(plan.entry)} USDT 才觀察觸發。已觸及門檻、已失效或過期，就取消本次計畫，不追價。</p>
        <details class="core-disclosure decision-cost-detail"><summary>出場規則與成本情境</summary>
        <p>第一止盈${priceMove(plan.entry,plan.tp1)}；第二止盈${priceMove(plan.entry,plan.tp2)}；止損${priceMove(plan.entry,plan.stop)}。價格變動不是淨報酬；尚未扣除成本。</p>
        ${planExitGuide(plan)}
        <dl class="decision-money" aria-label="成本後研究情境"><div><dt>直接止損情境</dt><dd>−${risk.stopLoss.toFixed(2)} <small>USDT</small></dd></div><div><dt>兩段止盈各 50%</dt><dd>${risk.targetPnl.toFixed(2)} <small>USDT</small></dd></div></dl>
        <p class="decision-reward">成本後目標風報比 <strong>${risk.netRewardRisk.toFixed(2)}</strong><span>固定研究本金 1,000 USDT、風險預算 0.25%，非你的帳戶額度。以上為情境，非預期收益；未含資金費率與額外跳空，止損金額不是最大可能損失。</span></p>
        ${riskPathView(plan,risk)}
        </details>
        <p class="decision-validity">進場有效至 ${displayDate(plan.expiresAt)}；點位核對有效至 ${displayDate(record.snapshotUntil)}，先到者為準。</p>
      </section>${index?'</details>':''}`;
    }).join(''):`<div class="decision-no-levels"><strong>${result.key==='loading'?'正在核對，暫不顯示點位。':'進場／止盈／止損：目前不提供'}</strong>${result.key==='wait'?'':`<span>${result.key==='loading'?'完成後會顯示結論。':`下一步：${esc(display.next)}`}</span>`}</div>`}
    ${result.plans.length>1?'<p>同幣多方案沒有經驗證的優先順序，請分別判讀，不可重複累加部位。</p>':''}
    ${result.key==='plan'?`<details class="core-disclosure" data-search="decision-evidence-${symbol}"><summary>查看平台判定依據</summary>${strategyEvidenceView(record,{now})}</details>`:''}
    <details class="core-disclosure"><summary>歷史盈利證據與三策略比較</summary>${agentComparisonView(comparison,record.symbol,{now,compact:true,busy:comparisonBusy,allowed:record.status==='LIVE'&&record.row?.analysis?.status==='VALID'})}</details>
    <p class="decision-next"><strong>下一步：</strong>${esc(display.next)}</p>
    <div class="decision-actions"><button type="button" class="primary-inline-btn" data-agent-plan-refresh="${symbol}" ${result.key==='loading'?'disabled':''}>${result.key==='loading'?'核對中…':'更新這檔建議'}</button><button type="button" class="secondary-btn" data-agent-plan-open="${symbol}">查看完整策略依據</button></div>
    <details class="core-disclosure" data-search="decision-trend-${symbol}"><summary>趨勢與資料核對</summary>${readinessView(record,now)}${coinTrendView(record,{now})}</details>
    <details class="core-disclosure" data-search="advice-integrity-${symbol}"><summary>資料狀態與核對時間</summary>${agentPlanStateView(record,now)}<p>行情核對：${Number.isFinite(record.checkedAt)?displayDate(record.checkedAt):'尚未完成'}。從行情請求開始計算，點位核對最長一分鐘；換根後需重新分析。研究價格未對齊交易所委託精度。</p></details>
    <p class="decision-lock">真實下單鎖定 · 正式帳本、最新淨值與完整部位尚未核對。</p>
  </article>`;
}

