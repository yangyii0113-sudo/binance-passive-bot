import { activeForward, forwardSummary, samplePnl } from './advice_forward.js';
import { FAMILY_NAMES } from './strategy_families.js';
import { escapeHtml as esc, displayDate, section, metric } from './ui.js';

const labels={PENDING:'等待觸發',OPEN:'模擬持倉',PARTIAL:'第一止盈已完成',CLOSED:'完整結案',GAP:'資料中斷 · 待覆核',EXPIRED:'未觸發到期',CANCELLED:'取消觀察',NOT_TRACKED:'未建立追蹤',NO_SETUP:'無可追蹤計畫',REGISTERED:'登錄建議',WATCHING:'開始觀察',TRIGGERED:'條件觸發',ENTRY:'模擬進場',TP1:'第一止盈',TP2:'第二止盈',STOP:'止損出場',TIME:'時間出場',PROTECTION:'成本保護生效'};
const num=(n,suffix='')=>Number.isFinite(n)?`${n.toLocaleString('zh-TW',{maximumFractionDigits:2,minimumFractionDigits:2})}${suffix}`:'—';
const price=n=>Number.isFinite(n)?n.toLocaleString('zh-TW',{maximumFractionDigits:8}):'—';
export function forwardFeedFacts(feed){
  const count=Number.isInteger(feed.received)?feed.received:0;
  return `已接收 ${count.toLocaleString('zh-TW')} 筆合格行情${Number.isFinite(feed.lastAt)?` · 最後收到 ${displayDate(feed.lastAt)} · 最新觀測價 ${price(feed.lastPrice)}`:' · 尚無合格行情'}`;
}
function feedCard(feed,state){
  const enabled=state.forward?.enabled,loading=state.agents?.tradePlans?.[feed.symbol]?.status==='LOADING';
  const stage={CONNECTING:'正在建立即時連線',WAITING:'連線已建立 · 等待首筆行情',LIVE:'連續行情觀察中',BLOCKED:'行情檢查未通過',STOPPED:'已停止 · 保留最後觀測'}[feed.status]||'尚未接通';
  return `<li><strong>${esc(feed.symbol)} · ${stage}</strong><p data-forward-facts="${esc(feed.symbol)}">${esc(forwardFeedFacts(feed))}</p>
    ${feed.status==='BLOCKED'?`<p>${esc(feed.reason||'行情中斷；未完成樣本待覆核')}${Number.isInteger(feed.closeCode)?`（連線關閉代碼 ${feed.closeCode}）`:''}</p>`:''}
    ${enabled&&feed.status==='BLOCKED'?`<div class="history-actions"><button type="button" class="secondary-btn" data-forward-reconnect="${esc(feed.symbol)}">重新檢查行情</button></div><p>接通後請重新核對新建議；舊中斷樣本不會恢復。</p>`:''}
    ${enabled&&feed.status==='LIVE'?`<div class="history-actions"><button type="button" class="secondary-btn" data-agent-plan-refresh="${esc(feed.symbol)}" ${loading?'disabled':''}>${loading?'核對中…':'重新核對新建議'}</button></div>`:''}
  </li>`;
}
export function forwardTrackingBar(state,{full=false}={}){
  const f=state.forward||{},rows=f.book?.rows||[];
  const feeds=f.feeds||[],live=feeds.filter(x=>x.status==='LIVE').length;
  const heading=!f.enabled?'本機前向追蹤未啟動':!feeds.length?'追蹤已啟動 · 等待新分析':live?`本機前向追蹤中 · ${live} 檔行情接通`:feeds.some(x=>x.status==='WAITING')?'連線已建立 · 等待首筆行情':feeds.some(x=>x.status==='CONNECTING')?'追蹤已啟動 · 行情連接中':'追蹤暫停 · 行情中斷';
  return `<section class="forward-control" aria-label="建議前向追蹤"><div><strong>${heading}</strong><p>${esc(f.note||'開啟後再分析幣種，才會登錄新建議。')}</p></div>
    ${[...new Set([f.error,f.dataError].filter(Boolean))].map(e=>`<p role="alert">${esc(e)}</p>`).join('')}
    <div class="history-actions">${f.enabled?'<button type="button" class="secondary-btn" data-forward-stop>停止追蹤</button>':`<button type="button" class="primary-inline-btn" data-forward-start ${f.starting?'disabled':''}>${f.starting?'正在啟動…':'開始本機前向追蹤'}</button>`}${full?'<a class="secondary-btn" href="#/advice">回到交易建議</a>':`<a class="secondary-btn" href="#/advice-results">建議成效 · ${rows.length} 筆</a>`}</div>
    <p>只在此頁保持前景時觀察；關閉、背景或斷線即停止未完成樣本。不補造過往成交。</p>
    ${feeds.length?`<details class="forward-diagnostics" data-search="forward-diagnostics" ${full||feeds.some(x=>x.status==='BLOCKED')?'open':''}><summary>${f.enabled?'行情連線狀態':'上次行情觀測'} · ${feeds.length} 檔</summary><ul class="forward-feeds">${feeds.map(x=>feedCard(x,state)).join('')}</ul></details>`:''}
  </section>`;
}
function sampleCard(row,enabled){
  const p=row.plan,pnl=samplePnl(row),pendingReview=activeForward(row)&&!enabled;
  return `<details class="core-disclosure forward-record" data-search="${esc(row.id)}"><summary><span>${esc(row.symbol)} · ${p?esc(FAMILY_NAMES[p.key]):'分析結論'}</span><span>${pendingReview?'未完成 · 本頁未追蹤':labels[row.status]}${pnl!==null?` · ${num(pnl)} USDT`:''}</span></summary>
    <p>登錄於 ${displayDate(row.createdAt)} · ${labels[row.reason]||esc(row.reason)}</p>
    ${p?`<p>原始建議（唯讀）：${p.side==='LONG'?'做多':'做空'} · ${esc(FAMILY_NAMES[p.key])}</p><dl class="core-metrics"><div><dt>原進場門檻</dt><dd>${price(p.entry)}</dd></div><div><dt>原止損</dt><dd>${price(p.stop)}</dd></div><div><dt>第一止盈</dt><dd>${price(p.tp1)}</dd></div><div><dt>第二止盈</dt><dd>${price(p.tp2)}</dd></div></dl><p>進場核對期限 ${displayDate(row.entryUntil)}；歷史點位不可直接用於現在下單。</p>`:''}
    ${pendingReview?'<p>本頁沒有持續觀察這筆樣本；重新啟動會將未完成紀錄標為待覆核，不回補。</p>':''}
    ${row.fills.length?`<ul class="forward-fills">${row.fills.map(f=>`<li>${labels[f.kind]} · ${displayDate(f.at)}<br>模擬價 ${price(f.price)} × ${price(f.qty)}；手續費 ${price(f.fee)} USDT</li>`).join('')}</ul>`:''}
    ${pnl!==null?`<p><strong>研究淨損益 ${num(pnl)} USDT · ${num(pnl/row.initialRisk)} R</strong>（未含資金費率）</p>`:'<p>尚無可計入成效的完整結案，損益不推算。</p>'}
    <ol class="forward-events">${row.events.map(e=>`<li>${displayDate(e.at)} · ${labels[e.type]||esc(e.type)}${e.tick?` · 觀測價 ${price(e.tick.price)}`:''}</li>`).join('')}</ol>
    <p>策略版本 ${esc(row.strategyVersion)} · 觀察版本 ${esc(row.version)}</p>
  </details>`;
}
function grouped(rows,key){
  const groups=new Map();
  for(const row of rows){const k=key(row);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);}
  return [...groups].map(([name,items])=>{const s=forwardSummary(items);return `<tr><th scope="row">${esc(name)}</th><td>${s.closed}／${s.total}</td><td>${num(s.winRate,'%')}</td><td>${num(s.average)}</td><td>${s.gap+s.notTracked}</td></tr>`;}).join('');
}
export function adviceResultsPage(state){
  const f=state.forward||{},dataError='dataError' in f?f.dataError:f.error,rows=f.book?.rows||[],s=forwardSummary(dataError?[]:rows),file=dataError?null:f.exportFile;
  const unresolved=!f.enabled?rows.filter(activeForward).length:0;
  return `<div class="page-stack forward-page">${section('建議成效',`
    <div class="advice-intro"><strong>${s.closed?'已累積本機研究結案，仍須檢查樣本與缺漏':'尚無足夠證據判定建議是否有效'}</strong><p>這裡追蹤建議提出之後的結果。每筆都是獨立模擬研究，與歷史回測、手動模擬交易及正式帳本分開。</p></div>
    ${forwardTrackingBar(state,{full:true})}
    <div class="metric-grid">${metric('完整結案',s.closed)}${metric('結案勝率',num(s.winRate,'%'))}${metric('平均研究淨損益',num(s.average,' USDT'))}${metric('獲利因子',num(s.profitFactor))}</div>
    <p class="guard-note">${dataError?'資料異常，停止計算成效。':'僅完整結案納入勝率；零損益也列入分母。無虧損樣本時不顯示獲利因子。少量樣本不能證明策略有效。'}</p>
    <dl class="core-metrics forward-coverage"><div><dt>全部登錄</dt><dd>${rows.length}</dd></div><div><dt>等待觸發</dt><dd>${f.enabled?s.pending:0}</dd></div><div><dt>模擬持倉／分段出場</dt><dd>${f.enabled?s.open:0}</dd></div><div><dt>中斷或未完成待確認</dt><dd>${s.gap+unresolved}</dd></div><div><dt>未觸發到期／取消</dt><dd>${s.cancelled}</dd></div><div><dt>無可追蹤計畫／未追蹤</dt><dd>${s.noSetup+s.notTracked}</dd></div></dl>
    <p>所有等待、取消、未追蹤與中斷都保留，避免只看到成功案例。背景停止會造成樣本偏差，這不是全天候策略績效。</p>
    <details class="core-disclosure" data-search="forward-assumptions"><summary>追蹤範圍、成本與出場規則</summary><p>每筆獨立以 1,000 USDT、0.25% 風險預算、名目上限 1 倍觀察。不同樣本可同時存在，不能相加當成帳戶報酬或組合風險核准。</p><p>只登錄啟動後的新分析；沿用原策略與核對期限。登錄後需連續成交越過門檻才模擬進場，跳價超過 0.02% 取消；不是保證成交。</p><p>第一止盈平一半、第二止盈平剩餘。止損使用較差觀測價；結構策略的成本保護於下一個小時生效。第 48 根一小時棒結束後以首筆連續觀測價格退出；與歷史收盤回測模型不同。</p><p>每邊費率 0.05%、滑價 0.02%；未含資金費率、交易所數量精度及市場深度。R 為研究淨損益除以原始成本後止損風險，跳空虧損可能超過 1 R。</p><p>只保存於此瀏覽器，上限 500 筆，不自動刪除。匯出包含點位與事件，但未經外部認證。即時行情缺漏、超過十秒無資料或進入背景即停止，不能補算。</p><p>僅模擬研究、真實下單鎖定、不回補。正式帳本、最新帳戶淨值與 Production Execution V2 不由此模組核准。</p></details>
    ${rows.length&&!dataError?`<details class="core-disclosure" data-search="forward-groups"><summary>依幣種／策略比較</summary><div class="forward-table-wrap"><table><thead><tr><th scope="col">組別</th><th scope="col">結案／登錄</th><th scope="col">勝率</th><th scope="col">平均淨損益</th><th scope="col">中斷／未追蹤</th></tr></thead><tbody>${grouped(rows,r=>r.symbol)}${grouped(rows,r=>FAMILY_NAMES[r.plan?.key]||'無可追蹤計畫')}</tbody></table></div><p>單位 USDT，未含資金費率；組別樣本少或缺漏多時不可排名。</p></details>`:''}
    <div class="history-actions"><button type="button" class="secondary-btn" data-forward-export ${!rows.length||dataError?'disabled':''}>匯出完整追蹤紀錄</button></div>
    ${file?`<section class="agent-export-preview" aria-label="前向追蹤匯出預覽"><strong>${esc(file.filename)}</strong><textarea aria-label="前向追蹤匯出內容" readonly rows="8">${esc(file.text)}</textarea><div class="history-actions"><button type="button" class="secondary-btn" data-forward-download>下載紀錄</button><button type="button" class="secondary-btn" data-forward-copy>複製紀錄</button></div>${f.exportMessage?`<p role="status">${esc(f.exportMessage)}</p>`:''}</section>`:''}
    <h3>逐筆追蹤 · 最新在前</h3>${dataError?'<p>紀錄異常，暫停展示逐筆成效；原始資料保留。</p>':rows.length?[...rows].reverse().map(r=>sampleCard(r,f.enabled)).join(''):'<div class="empty-state"><strong>尚無前向紀錄</strong><span>先開始本機前向追蹤，再回到交易建議重新分析幣種。舊研究紀錄不會變成成交。</span></div>'}
  `)}</div>`;
}
