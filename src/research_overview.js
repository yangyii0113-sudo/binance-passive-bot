import { agentPlanStatus } from './agent_trade_plan.js';
import { MARKET_REFRESH_MS } from './config.js';
import { escapeHtml as esc, displayDate } from './ui.js';

// Read-only summary. Counts never authorize a trade or rank expected returns.
export function researchOverview(state,now=Date.now()){
  const market=state.market||{},at=Date.parse(market.updatedAt);
  const fresh=market.status==='LIVE'&&Number.isFinite(at)&&now>=at&&now-at<=MARKET_REFRESH_MS*3;
  const rows=(market.universeRows||market.rows||[]).filter(r=>Number.isFinite(r[3]));
  const up=rows.filter(r=>r[3]>0).length,down=rows.filter(r=>r[3]<0).length;
  const records=Object.values(state.agents?.tradePlans||{}).filter(Boolean);
  const ready=records.filter(r=>agentPlanStatus(r,now).key==='plan').length;
  const f=state.forward||{},dataError='dataError' in f?f.dataError:f.error;
  const closed=dataError?null:(f.book?.rows||[]).filter(r=>r.status==='CLOSED').length;
  return `<section class="panel research-home" aria-label="研究工作台">
    <div class="research-home-heading"><span class="research-eyebrow">選幣 · 決策 · 驗證</span><span class="research-mode">僅模擬研究</span></div>
    <h1>先看機會，再決定是否進場</h1><p class="research-lead">從強勢幣篩選，到進退場條件與成本後風險，把每次建議接上可追蹤的結果。</p>
    <div class="research-home-actions"><button type="button" class="primary-inline-btn" data-home-research>篩選強勢幣</button><a class="secondary-btn" href="#/advice">查看交易建議</a></div>
    <div class="research-market-context"><strong>${fresh?'24 小時市場概況':'行情待更新'}</strong>${fresh?`<span>追蹤範圍 ${rows.length} 檔 · 上漲 ${up} · 下跌 ${down} · 持平 ${rows.length-up-down}</span>`:'<span>目前行情尚未完成最新核對；請更新後再選幣。</span>'}<small>${fresh?'僅反映追蹤幣種的漲跌分布，不代表多週期趨勢。':'保留舊資料供參考，不視為現在的進場依據。'}${Number.isFinite(at)?` 更新：${esc(displayDate(at))}`:''}</small></div>
    <dl class="research-progress"><div><dt>本次研究</dt><dd>${records.length}<small> 檔</small></dd></div><div><dt>有效研究計畫</dt><dd>${ready}<small> 檔</small></dd></div><div><dt>本機完整結案</dt><dd>${closed??'—'}<small>${closed===null?'':' 筆'}</small></dd></div></dl>
    <div class="research-evidence-note"><span>${closed===null?'前向紀錄異常，成效暫停顯示。':closed?'結案僅為本機研究樣本，請檢查缺漏與樣本數。':'尚無完整結案，暫不能判定建議的獲利能力。'}</span><a href="#/advice-results">查看成效與缺漏</a></div>
  </section>`;
}
