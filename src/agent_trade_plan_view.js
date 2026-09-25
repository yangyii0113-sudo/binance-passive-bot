import { agentPlanStateView } from './agent_decision_view.js';
import { agentPlanStatus } from './agent_trade_plan.js';
import { FAMILY_NAMES } from './strategy_families.js';
import { entryPlan } from './entry_plan.js';
import { escapeHtml as esc, displayDate } from './ui.js';
import { agentComparisonView } from './agent_comparison_view.js';
import { researchProtectionStop } from './research_risk_view.js';

const rules = {
  structured:'4 小時價格、50／200 期指數均線與斜率同向；1 小時回踩 20 期均線後收回，以同向實體收盤，距均線不超過一倍平均真實波幅。',
  breakout:'1 小時收盤突破前 20 根最高／最低價，且成交量至少為前 20 根均量的 1.5 倍。',
  meanReversion:'20／50 期均線距離不超過半倍平均真實波幅；偏離事先固定的兩倍標準差區間後收回，回到均價方向。'
};
export function agentTradePlanView(record, {symbol=record?.symbol || '', now=Date.now(), link=false, comparison, comparisonBusy=false}={}) {
  const state=agentPlanStatus(record,now), a=record?.row?.analysis;
  const name=esc(symbol), loading=state.key==='loading';
  const waiting=state.key==='wait' || state.key==='plan' ? (a?.strategies || []).filter(p=>p.status!=='SETUP').map(p=>`<li><strong>${esc(FAMILY_NAMES[p.key] || '研究策略')}</strong>：${esc(p.reason || '等待收盤條件成立')}</li>`).join('') : '';
  return `<section class="agent-trade-plan" aria-label="${name} 完整交易計畫" data-plan-symbol="${name}">
    <div class="agent-plan-heading"><div><span class="research-kicker">分析結果 → 交易計畫 · 僅模擬研究</span><h3>${name} · 交易計畫</h3></div><button type="button" class="secondary-btn" data-agent-plan-refresh="${name}" ${loading?'disabled':''}>${loading?'擬定中…':'重新產生計畫'}</button></div>
    ${agentPlanStateView(record,now)}
    <p role="status">${esc(state.reason)}</p>
    ${record?.checkedAt?`<p class="strategy-note">行情核對：${displayDate(record.checkedAt)} · 點位顯示核對有效一分鐘</p>`:''}
    ${state.plans.map(plan=>`<article class="agent-plan-scenario">
      <h4>${esc(FAMILY_NAMES[plan.key])} · ${plan.side==='LONG'?'做多':'做空'}</h4>
      <p class="agent-plan-expiry">進場有效至 ${displayDate(plan.expiresAt)}，到時未觸發即取消。</p>
      ${entryPlan(plan,{research:true})}
      ${plan.key==='structured'?`<p class="agent-plan-expiry">第一止盈後的成本保護止損：${researchProtectionStop(plan)?.toLocaleString('en-US',{maximumFractionDigits:8}) ?? '—'} USDT；下一根起生效，含假設手續費與滑價，仍有跳空風險。</p>`:''}
      <details class="core-disclosure" data-search="${name} ${plan.key} 完整進退場規則"><summary>完整進退場規則與失效條件</summary><p>${esc(rules[plan.key])}</p><ol>
        <li>進場：僅下一根一小時 K 棒內，${plan.side==='LONG'?'向上突破':'向下跌破'}門檻才形成觸發條件；門檻為訊號棒${plan.side==='LONG'?'最高':'最低'}價加上方向性 0.1 倍平均真實波幅。不追已觸發或跳過門檻的行情。</li>
        <li>止損：最近五根${plan.side==='LONG'?'最低':'最高'}價外加 0.2 倍平均真實波幅；觸及止損即退出全部剩餘部位，不放寬止損、不攤平。</li>
        <li>分批止盈：第一目標平倉 50%，第二目標平倉剩餘 50%。${plan.key==='structured'?'第一目標後，從下一根起將剩餘止損移至含成本的保護價；不在同根回溯移動。':plan.key==='meanReversion'?'第一目標是進場到固定均價的一半距離，第二目標是固定均價；止損維持原位。':'目標依序為一倍、兩倍風險距離；止損維持原位。'}</li>
        <li>時間退出：沿用研究比較規則，最長持有 48 根一小時 K 棒（含進場棒），到期以當根收盤退出剩餘部位。</li>
        <li>取消：未進場前觸及失效價、開盤跳過進場價、訊號到期、資料過期或方向衝突，均不沿用原點位。同根止盈與止損的研究回放採止損優先。</li>
      </ol></details>
    </article>`).join('')}
    ${waiting?`<ul class="agent-plan-waits">${waiting}</ul>`:''}
    ${agentComparisonView(comparison,symbol,{allowed:record?.status==='LIVE' && a?.status==='VALID',busy:comparisonBusy})}
    <details class="core-disclosure" data-search="${name} 交易計畫資料與驗證"><summary>資料依據、績效與風險限制</summary><p>重新取得幣安加密貨幣穩定幣本位永續合約的 1 小時／4 小時完整收盤 K 線；不使用現貨備援資料產生合約點位。多週期共識是背景資訊，三策略各依固定條件判斷。</p>${a?.closedAt?`<p>訊號收盤：${displayDate(a.closedAt)}</p>`:''}<p>90 天比較只提供固定基礎規則的歷史證據；目前計畫仍未通過跨期、前向與完整成交驗證，不沿用其他均線基準回測的勝率。可另開啟本機前向追蹤以觀察新建議；僅限頁面前景，操作前仍需重新核對。</p><p>正式帳本、最新帳戶淨值與完整部位尚不可核對，無法確認真實額度與組合風險上限；真實下單維持鎖定，不補造紀錄。</p></details>
    ${link?'<button type="button" class="primary-inline-btn" data-agent-key="advice">查看進退場摘要</button>':''}
  </section>`;
}
