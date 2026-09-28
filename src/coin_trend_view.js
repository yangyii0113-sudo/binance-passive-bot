import { agentPlanStatus } from './agent_trade_plan.js';
import { displayDate, escapeHtml as esc } from './ui.js';
const direction={LONG:'偏多',SHORT:'偏空',MIXED:'整理／未同向'};

export function coinTrendSummary(record,now=Date.now()){
 const gate=agentPlanStatus(record,now),a=record?.row?.analysis;
 if(!['plan','wait','conflict'].includes(gate.key)||record.symbol!==record.row?.symbol)return {valid:false,reason:'行情過期或資料尚未核對，暫停趨勢判讀。'};
 if(!Object.hasOwn(direction,a.hourlyDirection)||!Object.hasOwn(direction,a.fourHourlyDirection)||
   ![a.atrPct,a.emaDistanceAtr,a.lastClose].every(Number.isFinite)||a.atrPct<=0||a.lastClose<=0||
   (a.volumeRatio!==null&&(!Number.isFinite(a.volumeRatio)||a.volumeRatio<0)))return {valid:false,reason:'趨勢、波幅或量能欄位缺漏，請更新這檔建議。'};
 const aligned=a.hourlyDirection!=='MIXED'&&a.hourlyDirection===a.fourHourlyDirection;
 const opposed=a.hourlyDirection!=='MIXED'&&a.fourHourlyDirection!=='MIXED'&&!aligned;
 return {valid:true,hourly:direction[a.hourlyDirection],fourHourly:direction[a.fourHourlyDirection],
  label:aligned?`短線與大方向同向${direction[a.hourlyDirection]}`:opposed?'1 小時與 4 小時方向分歧':'趨勢尚未同向',
  reason:aligned?'趨勢背景同向；進場仍由各策略獨立核對。':opposed?'不同週期方向相反，不用多數票抵銷；各策略分別觀察。':'整理或轉折尚未確認；區間與回歸策略也須通過自己的條件。',
  volumeRatio:a.volumeRatio,atrPct:a.atrPct,emaDistanceAtr:a.emaDistanceAtr,closedAt:a.closedAt,
  extended:Math.abs(a.emaDistanceAtr)>1,opposed};
}
export function coinTrendView(record,{now=Date.now()}={}){
 const t=coinTrendSummary(record,now);
 if(!t.valid)return `<section class="decision-trend" aria-label="幣種趨勢判讀"><h4>幣種趨勢</h4><p>${esc(t.reason)}</p></section>`;
 return `<section class="decision-trend" aria-label="幣種趨勢判讀"><div class="analysis-heading"><h4>幣種趨勢</h4><strong>${t.label}</strong></div>
 <dl class="analysis-metrics"><div><dt>1 小時方向</dt><dd>${t.hourly}</dd></div><div><dt>4 小時方向</dt><dd>${t.fourHourly}</dd></div></dl>
 <p>收盤棒量能／前 20 根均量：${t.volumeRatio===null?'無法計算':`${t.volumeRatio.toFixed(2)} 倍`}。</p>
 <p>${t.reason}</p><details class="core-disclosure" data-search="trend-facts-${esc(record.symbol)}"><summary>波動、均線距離與收盤依據</summary>
 <p>1 小時平均波幅占收盤價 ${t.atrPct.toFixed(2)}%；收盤在 20 期均線${t.emaDistanceAtr>=0?'上':'下'}方 ${Math.abs(t.emaDistanceAtr).toFixed(2)} 倍波幅。${t.extended?'距均線超過 1 倍波幅，回調方案有不追價限制。':''}</p>
 <p>完整收盤 ${displayDate(t.closedAt)}。量能、趨勢與波幅是條件資訊，並非勝率；日線／週線另見短中長期情勢對照。</p></details></section>`;
}
