import { agentPlanStatus } from './agent_trade_plan.js';
import { pullbackReadiness } from './entry_readiness.js';
import { escapeHtml as esc, displayDate } from './ui.js';

export function readinessView(record,now=Date.now()) {
  const p=pullbackReadiness(record,now),gate=agentPlanStatus(record,now);
  return `<div class="entry-readiness" data-readiness="${p.key}"><strong>${p.label}</strong><span>${esc(p.reason)}</span>${!p.complete&&gate.key==='plan'?'<small>下方為其他獨立策略通過的計畫，並非回踩方案。</small>':''}</div>`;
}
export function triggerMonitorStatus(f={},now=Date.now()) {
  if(f.dataError||f.error)return `觸發提醒無法運作：${f.dataError||f.error}`;
  if(f.starting)return '觸發提醒啟用中，尚未開始觀察。';
  if(!f.enabled)return f.note&&!f.note.startsWith('尚未啟動')
    ?`觸發提醒已停止：${f.note}。重新啟用只觀察新結果，不回補中斷期間。`
    :'觸發提醒尚未啟用。';
  const live=(f.feeds||[]).filter(x=>x.status==='LIVE'&&Number.isFinite(x.lastAt)&&now-x.lastAt>=0&&now-x.lastAt<=10000);
  const active=(f.book?.rows||[]).filter(r=>['PENDING','OPEN','PARTIAL'].includes(r.status));
  const observable=active.filter(r=>live.some(x=>x.symbol===r.symbol));
  const pending=observable.filter(r=>r.status==='PENDING'&&r.entryUntil>now).length;
  const opened=observable.filter(r=>['OPEN','PARTIAL'].includes(r.status)).length;
  const blocked=(f.feeds||[]).filter(x=>x.status==='BLOCKED').length;
  const gap=blocked?` ${blocked} 檔行情中斷，該檔暫停判定；中斷樣本不重啟。`:'';
  if(pending||opened)return `觸發提醒運作中：${pending} 個計畫等待觸發，${opened} 個模擬樣本追蹤出場。${gap}`;
  if(live.length)return `即時行情已接通；目前沒有有效的等待觸發樣本。已到期或中斷的樣本不重啟。${gap}`;
  return `觸發提醒：尚無合格連續行情，暫不判定觸發。${gap}`;
}
export function adviceMonitorView(state,now=Date.now()) {
  const m=state.adviceMonitor;if(!m)return '';
  const f=state.forward||{};
  const heading=!m.enabled?'自動判定已關閉':m.paused?'自動判定暫停':m.running?'平台正在自動核對':m.error?'自動核對未完成':'平台自動判定中';
  const newest=m.alerts?.[0];
  const rows=m.alerts||[];
  const alertRow=a=>{
    const r=state.agents?.tradePlans?.[a.symbol],gate=agentPlanStatus(r,now);
    const current=a.kind==='plan'&&gate.plans.some(p=>p.key===a.family&&p.signalAt===a.signalAt);
    return `<li><span>${displayDate(a.at)}</span><strong>${esc(a.symbol)} · ${esc(a.label)}</strong><small>${current?'目前仍有有效計畫；請看最新點位。':'這是發生紀錄；目前是否可用以最新判定為準。'}</small><button type="button" class="secondary-btn" data-agent-advice-symbol="${esc(a.symbol)}">查看最新判定</button></li>`;
  };
  return `<section class="advice-monitor" aria-label="平台自動判定與提醒"><div class="monitor-heading"><strong>${heading}</strong><button type="button" class="secondary-btn" data-auto-check-toggle>${m.enabled?'暫停自動判定':'開啟自動判定'}</button></div>
    <p>${!m.enabled?'新計畫自動判定已關閉；按「開啟自動判定」恢復。':m.error?esc(m.error):!m.paused?'每 30 秒自動核對目前強勢前 10 檔與所選幣種；換根後重新判定。':'回到首頁或交易建議前景後重新核對；不沿用中斷期間的判定。'}${m.lastAt?` 最近完成 ${displayDate(m.lastAt)}。`:''}</p>
    <p class="monitor-trigger-state">${esc(triggerMonitorStatus(f,now))}</p>
    ${f.enabled?'<button type="button" class="secondary-btn" data-forward-stop>停止觸發提醒</button>':`<button type="button" class="secondary-btn" data-monitor-track ${f.starting?'disabled':''}>${f.starting?'正在啟用…':m.enabled?'啟用觸發提醒 · 僅模擬':'開啟判定與觸發提醒 · 僅模擬'}</button>`}
    <p>${f.enabled?(m.enabled?'暫停自動判定只停止尋找新計畫；既有模擬追蹤仍繼續。':'自動判定已關閉，既有模擬追蹤與觸發提醒仍繼續。'):(m.enabled?'觸發提醒停止時，自動判定仍可提供回踩與計畫成立提醒。':'自動判定與觸發提醒皆未運作。')}</p>
    <p class="monitor-boundary">頁面內提醒；鎖屏、切到背景、離線或關閉頁面會停止監控，沒有離線推播。</p>
    <div class="monitor-latest" role="status" aria-live="polite">${newest?`最近提醒：${esc(newest.symbol)} · ${esc(newest.label)}（${displayDate(newest.at)}）`:'尚無新提醒；條件未通過時不提供該策略進場點位。'}</div>
    ${rows.length?`<details class="monitor-alerts" data-search="monitor-alerts"><summary>本次提醒紀錄 · ${rows.length}</summary><ul>${rows.map(alertRow).join('')}</ul></details>`:''}
  </section>`;
}
