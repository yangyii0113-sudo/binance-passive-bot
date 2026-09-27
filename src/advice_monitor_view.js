import { agentPlanStatus } from './agent_trade_plan.js';
import { pullbackReadiness } from './entry_readiness.js';
import { escapeHtml as esc, displayDate } from './ui.js';

export function readinessView(record,now=Date.now()) {
  const p=pullbackReadiness(record,now),gate=agentPlanStatus(record,now);
  return `<div class="entry-readiness" data-readiness="${p.key}"><strong>${p.label}</strong><span>${esc(p.reason)}</span>${!p.complete&&gate.key==='plan'?'<small>下方為其他獨立策略通過的計畫，並非回踩方案。</small>':''}</div>`;
}
export function adviceMonitorView(state,now=Date.now()) {
  const m=state.adviceMonitor;if(!m)return '';
  const f=state.forward||{},live=f.enabled&&f.feeds?.some(x=>x.status==='LIVE'&&Number.isFinite(x.lastAt)&&now-x.lastAt>=0&&now-x.lastAt<=10000);
  const pending=live&&!f.error&&!f.dataError?(f.book?.rows||[]).filter(r=>r.status==='PENDING'&&r.entryUntil>now&&f.feeds?.some(x=>x.symbol===r.symbol&&x.status==='LIVE'&&now-x.lastAt>=0&&now-x.lastAt<=10000)).length:0;
  const heading=!m.enabled?'自動判定已關閉':m.paused?'自動判定暫停':m.running?'平台正在自動核對':m.error?'自動核對未完成':'平台自動判定中';
  const newest=m.alerts?.[0];
  const rows=m.alerts||[];
  const alertRow=a=>{
    const r=state.agents?.tradePlans?.[a.symbol],gate=agentPlanStatus(r,now);
    const current=a.kind==='plan'&&gate.plans.some(p=>p.key===a.family&&p.signalAt===a.signalAt);
    return `<li><span>${displayDate(a.at)}</span><strong>${esc(a.symbol)} · ${esc(a.label)}</strong><small>${current?'目前仍有有效計畫；請看最新點位。':'這是發生紀錄；目前是否可用以最新判定為準。'}</small><button type="button" class="secondary-btn" data-agent-advice-symbol="${esc(a.symbol)}">查看最新判定</button></li>`;
  };
  return `<section class="advice-monitor" aria-label="平台自動判定與提醒"><div class="monitor-heading"><strong>${heading}</strong><button type="button" class="secondary-btn" data-auto-check-toggle>${m.enabled?'暫停自動判定':'開啟自動判定'}</button></div>
    <p>${m.error?esc(m.error):m.enabled&&!m.paused?'每 30 秒自動核對目前強勢前 10 檔與所選幣種；換根後重新判定。':'回到首頁或交易建議前景後重新核對；不沿用中斷期間的判定。'}${m.lastAt?` 最近完成 ${displayDate(m.lastAt)}。`:''}</p>
    <p class="monitor-trigger-state">${pending?`觸發提醒：${pending} 個有效計畫正在連續觀察。`:live?'即時行情已接通；目前沒有有效的等待觸發樣本。已到期或中斷的樣本不重啟。':f.enabled?'觸發提醒：尚無合格連續行情，暫不判定觸發。':'觸發提醒：尚未啟用。回踩與計畫成立提醒仍會自動顯示。'}</p>
    ${!f.enabled?`<button type="button" class="secondary-btn" data-monitor-track ${f.starting?'disabled':''}>${f.starting?'正在啟用…':'啟用觸發提醒 · 僅模擬'}</button>`:''}
    <p class="monitor-boundary">頁面內提醒；鎖屏、切到背景、離線或關閉頁面會停止監控，沒有離線推播。</p>
    <div class="monitor-latest" role="status" aria-live="polite">${newest?`最近提醒：${esc(newest.symbol)} · ${esc(newest.label)}（${displayDate(newest.at)}）`:'尚無新提醒；條件未通過時不提供該策略進場點位。'}</div>
    ${rows.length?`<details class="monitor-alerts" data-search="monitor-alerts"><summary>本次提醒紀錄 · ${rows.length}</summary><ul>${rows.map(alertRow).join('')}</ul></details>`:''}
  </section>`;
}
