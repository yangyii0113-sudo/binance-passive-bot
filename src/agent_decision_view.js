import { coinLogo } from './coin_logo.js';
import { agentPlanStatus } from './agent_trade_plan.js';
import { FAMILY_NAMES } from './strategy_families.js';
import { researchRiskScenario } from './research_risk_view.js';
import { escapeHtml as esc, displayDate } from './ui.js';
import { formatPlanPrice as quote, priceMove, planExitGuide } from './plan_levels_view.js';

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

export function agentActionLabel(record, now=Date.now()) {
  const {result,data}=agentPlanPresentation(record,now);
  return ({empty:'尚未分析',loading:'分析核對中',blocked:'暫不進場 · 資料不足',expired:'暫不進場 · 請更新',conflict:'暫不進場 · 方向衝突',wait:data==='部分待核對'?'暫不進場 · 部分待核對':'暫不進場 · 等待條件',plan:'等待觸發 · 僅模擬'})[result.key];
}
export function agentDecisionCard(record, {now=Date.now()}={}) {
  const {result}=agentPlanPresentation(record,now), symbol=esc(record.symbol);
  const waits=result.key==='wait'?(record.row?.analysis?.strategies || []).map(p=>`<li><strong>${esc(FAMILY_NAMES[p.key])}</strong>：${esc(p.reason || '等待收盤條件成立')}</li>`).join(''):'';
  return `<article class="agent-decision-card" aria-label="${symbol} 進退場摘要">
    <div class="decision-heading"><div class="coin-identity">${coinLogo(record.symbol,undefined,true)}<h3>${symbol}</h3></div><span>短線 · 1 小時策略</span></div>
    <div class="decision-verdict" data-advice-verdict="${result.key}"><span>目前建議</span><strong>${agentActionLabel(record,now)}</strong></div>
    <p class="decision-reason" role="status">${result.key==='plan'?'僅列入條件式模擬觀察，尚未確認觸發或成交。只在下列條件與期限內觀察。':esc(result.reason)}</p>
    ${result.plans.length?result.plans.map(plan=>{
      const risk=researchRiskScenario(plan), snapshot=record.marketSnapshot;
      return `<section class="decision-scenario" aria-label="${esc(FAMILY_NAMES[plan.key])} 點位摘要">
        <h4>${plan.side==='LONG'?'做多方案':'做空方案'} · ${esc(FAMILY_NAMES[plan.key])}</h4>
        <div class="decision-quote"><span>核對時參考價 <strong>${quote(snapshot.price)} USDT</strong></span><span>${priceMove(snapshot.price,plan.entry,{pending:true})} 才到進場門檻</span><small>合約當根 K 線快照 · 非串流報價 · 取得 ${displayDate(snapshot.receivedAt)}</small></div>
        <dl class="decision-levels" aria-label="進場與出場點位">
          <div class="decision-entry"><dt>進場門檻 · ${plan.side==='LONG'?'向上突破':'向下跌破'}</dt><dd>${quote(plan.entry)} <small>USDT</small></dd></div>
          <div class="decision-target"><dt>第一止盈 · 平倉 50%</dt><dd>${quote(plan.tp1)} <small>USDT</small></dd><small>從進場${priceMove(plan.entry,plan.tp1)}</small></div>
          <div class="decision-target"><dt>第二止盈 · 平倉剩餘 50%</dt><dd>${quote(plan.tp2)} <small>USDT</small></dd><small>從進場${priceMove(plan.entry,plan.tp2)}</small></div>
          <div class="decision-stop"><dt>止損點 · 退出全部剩餘部位</dt><dd>${quote(plan.stop)} <small>USDT</small></dd><small>從進場${priceMove(plan.entry,plan.stop)} · 不放寬止損</small></div>
        </dl>
        <p class="decision-price-note">以上價格變動不是淨報酬；尚未扣除成本與計入分批比例。</p>
        <p class="decision-trigger"><strong>何時考慮：</strong>先重新核對行情；確認仍有效後，${plan.side==='LONG'?'向上突破':'向下跌破'} ${quote(plan.entry)} USDT 才觀察觸發。已觸及門檻、已失效或過期，就取消本次計畫，不追價。</p>
        ${planExitGuide(plan)}
        <dl class="decision-money" aria-label="成本後研究情境"><div><dt>直接止損情境</dt><dd>−${risk.stopLoss.toFixed(2)} <small>USDT</small></dd></div><div><dt>兩段止盈各 50%</dt><dd>${risk.targetPnl.toFixed(2)} <small>USDT</small></dd></div></dl>
        <p class="decision-reward">成本後目標風報比 <strong>${risk.netRewardRisk.toFixed(2)}</strong><span>固定研究本金 1,000 USDT、風險預算 0.25%，非你的帳戶額度。以上為情境，非預期收益；未含資金費率與額外跳空，止損金額不是最大可能損失。</span></p>
        <p class="decision-validity">進場有效至 ${displayDate(plan.expiresAt)}；點位核對有效至 ${displayDate(record.snapshotUntil)}，先到者為準。</p>
      </section>`;
    }).join(''):`<div class="decision-no-levels"><strong>${result.key==='loading'?'正在核對，暫不顯示點位。':'進場／止盈／止損：目前不提供'}</strong><span>${result.key==='wait'?'下一步：等下列收盤條件成立，再重新核對行情。':result.key==='loading'?'完成後會顯示結論。':'下一步：重新核對行情後，再決定是否建立計畫。'}</span></div>`}
    ${waits?`<section class="decision-waits" aria-label="各策略等待條件"><h4>各策略在等什麼？</h4><ul class="agent-plan-waits">${waits}</ul></section>`:''}
    ${result.plans.length>1?'<p>同幣多方案沒有經驗證的優先順序，請分別判讀，不可重複累加部位。</p>':''}
    <div class="decision-actions"><button type="button" class="primary-inline-btn" data-agent-plan-refresh="${symbol}" ${result.key==='loading'?'disabled':''}>${result.key==='loading'?'核對中…':'更新這檔建議'}</button><button type="button" class="secondary-btn" data-agent-plan-open="${symbol}">查看完整策略依據</button></div>
    <details class="core-disclosure" data-search="advice-integrity-${symbol}"><summary>資料狀態與核對時間</summary>${agentPlanStateView(record,now)}<p>行情核對：${Number.isFinite(record.checkedAt)?displayDate(record.checkedAt):'尚未完成'}。從行情請求開始計算，點位核對最長一分鐘；換根後需重新分析。研究價格未對齊交易所委託精度。</p></details>
    <p class="decision-lock">真實下單鎖定 · 正式帳本、最新淨值與完整部位尚未核對。</p>
  </article>`;
}
