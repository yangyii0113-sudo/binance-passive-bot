import { agentPlanStatus } from './agent_trade_plan.js';
import { adviceDisplayStatus, strategyWaitDetail } from './advice_display_status.js';
import { researchRiskScenario } from './research_risk_view.js';
import { formatPlanPrice as price } from './plan_levels_view.js';
import { escapeHtml as esc, displayDate } from './ui.js';

const names={structured:'趨勢回調',breakout:'區間突破',meanReversion:'均值回歸'};
const number=(v,d=2)=>Number.isFinite(v)?v.toFixed(d):'—';
const direction=v=>({LONG:'偏多',SHORT:'偏空',MIXED:'未一致'})[v]||'未確認';
const mark=v=>v===true?['pass','已通過']:v===false?['wait','未通過']:['unknown','資料不足'];
const field=(name,value,threshold,passed,unknownLabel='資料不足')=>{
  const [state,status]=mark(passed),label=state==='unknown'?unknownLabel:status;
  return `<div class="evidence-check" data-check-state="${state}"><dt>${esc(name)}<span>${label}</span></dt><dd>${esc(value)}<small>條件：${esc(threshold)}</small></dd></div>`;
};
function observations(p,a){
  const o=p.observations;
  if(o?.version!=='strategy-conditions-v1'||o.closedAt!==a.closedAt)return null;
  const required=({structured:['open','high','low','close','ema20','atr','closeFour','ema50Four','ema200Four','ema50FourPrevious'],breakout:['close','upper','lower','averageVolume','lastVolume'],meanReversion:['close','previousClose','center','sd','lower','upper','atr','ma20','ma50']})[p.key];
  return required?.every(k=>Number.isFinite(o[k]))?o:null;
}
function stateLabel(p,gate){
  if(p.status==='SETUP')return gate.key==='plan'&&gate.plans.some(x=>x.key===p.key)?'等待觸發 · 僅模擬':'方向衝突 · 暫停';
  return strategyWaitDetail(p).label;
}
function compactValue(p,o){
  if(!o)return '分項數值待更新';
  if(p.key==='structured')return `收盤距均線 ${number((o.close/o.ema20-1)*100)}% · ${number(Math.abs(o.close-o.ema20)/o.atr)} 倍波幅`;
  if(p.key==='breakout')return `收盤棒量能 ${number(o.volumeRatio)} 倍／門檻 ≥ 1.50 倍`;
  return `均線距離 ${number(Math.abs(o.ma20-o.ma50)/o.atr)} 倍波幅／門檻 ≤ 0.50`;
}
function checks(p,o,a,gate){
  if(!o)return '<p class="evidence-missing">本次沒有可核對的分項數值，請更新這檔建議。</p>';
  let html='',notes='';
  if(p.key==='structured'){
    const long=o.side==='LONG',hasSide=['LONG','SHORT'].includes(o.side);
    html+=field('4 小時趨勢',`收盤 ${price(o.closeFour)}；50 期均線 ${price(o.ema50Four)}；200 期均線 ${price(o.ema200Four)}；50 期均線較 3 棒前 ${number((o.ema50Four/o.ema50FourPrevious-1)*100)}%`,`${hasSide?direction(o.side)+'：':''}價格、50／200 期均線與 50 期均線斜率同向`,hasSide);
    html+=field('觸及 20 期均線',`本棒低／高 ${price(o.low)}／${price(o.high)}；均線 ${price(o.ema20)}`,hasSide?long?'最低價 ≤ 均線':'最高價 ≥ 均線':'先確認 4 小時方向',o.touched);
    html+=field('收盤回到趨勢側',`本棒收盤 ${price(o.close)}；均線 ${price(o.ema20)}`,hasSide?long?'收盤 > 均線':'收盤 < 均線':'先確認 4 小時方向',o.reclaimed);
    html+=field('同向實體收盤',`開盤 ${price(o.open)} → 收盤 ${price(o.close)}`,hasSide?long?'收盤 > 開盤':'收盤 < 開盤':'先確認 4 小時方向',o.bodyAligned);
    html+=field('避免追價',`收盤距均線 ${number(Math.abs(o.close-o.ema20)/o.atr)} 倍波幅；平均波幅 ${price(o.atr)}`,'距離 ≤ 1 倍平均真實波幅',o.withinAtr);
  }else if(p.key==='breakout'){
    html+=field('收盤突破區間',`收盤 ${price(o.close)}；上緣 ${price(o.upper)}／下緣 ${price(o.lower)}`,'收盤 > 前 20 根最高價，或 < 前 20 根最低價',o.breakout);
    html+=field('突破量能',`訊號棒／前 20 根均量 = ${number(o.volumeRatio)} 倍`,'同一根突破收盤棒 ≥ 1.50 倍；不能等已收盤棒再增加量',o.volumePassed);
    notes+=`<p class="evidence-distance">相對本次收盤：上緣 ${number((o.upper/o.close-1)*100)}%，下緣 ${number((o.lower/o.close-1)*100)}%。正值在收盤價上方，負值在下方。</p>`;
  }else{
    html+=field('震盪環境',`20／50 期均線 ${price(o.ma20)}／${price(o.ma50)}；距離 ${number(Math.abs(o.ma20-o.ma50)/o.atr)} 倍波幅`,'距離 ≤ 0.50 倍平均真實波幅，且標準差 > 0',o.rangePassed);
    html+=field('偏離後收回',`前棒收盤 ${price(o.previousClose)} → 本棒 ${price(o.close)}；下界 ${price(o.lower)}／上界 ${price(o.upper)}`,'前棒收在兩倍標準差區間外，本棒回到同側界線與中心之間',o.longReclaim===true||o.shortReclaim===true?true:o.longReclaim===false&&o.shortReclaim===false?false:null);
    notes+=`<p class="evidence-distance">固定區間中心 ${price(o.center)}；界線使用偏離／收回兩棒之前的資料。</p>`;
  }
  const risk=gate.plans.find(x=>x.key===p.key)?researchRiskScenario(p):null;
  const ratio=risk?.netRewardRisk??p.targetAnalysis?.netRewardRisk??o.netRewardRisk;
  html+=field('成本後目標風報',Number.isFinite(ratio)?`${number(ratio)} 倍`:'收盤條件尚未形成可核對的風報數值','兩段各 50%，扣除既有費率與滑價後 ≥ 1.00 倍',Number.isFinite(ratio)?ratio>=1:null,'待前置條件');
  if(p.key==='structured'&&p.targetAnalysis){
    const t=p.targetAnalysis;
    html+=field('前方結構空間',t.structure==null?'近 120 根沒有已確認的阻擋結構':`已確認支撐／壓力 ${price(t.structure)}；第一目標 ${number(t.tp1R)}R`,'結構前保留 0.1 倍波幅後，仍至少有 1R 空間',Number.isFinite(t.tp1R)?t.tp1R>=1:null);
  }
  return `<dl class="evidence-checks">${html}</dl>${notes}`;
}
export function strategyEvidenceView(record,{now=Date.now(),compact=false}={}){
  const gate=agentPlanStatus(record,now),a=record?.row?.analysis;
  if(!['plan','wait','conflict'].includes(gate.key)||record.row.symbol!==record.symbol)return '';
  const display=adviceDisplayStatus(record,now);
  const plans=a.strategies.map(p=>({...p,observations:observations(p,a)}));
  if(compact)return `<div class="strategy-evidence-compact" aria-label="三策略狀態">${plans.map(p=>`<div><span>${names[p.key]}</span><strong>${esc(stateLabel(p,gate))}</strong></div>`).join('')}<p>1 小時 ${direction(a.hourlyDirection)}／4 小時 ${direction(a.fourHourlyDirection)} · 收盤量能 ${number(a.volumeRatio)} 倍</p></div>`;
  return `<section class="strategy-evidence" aria-label="三策略確認事項"><h4>三策略分別核對</h4><p class="evidence-intro">各策略獨立判斷，不需全部成立。分項通過不代表勝率，仍以目前建議及有效期限為準。</p>
    <p class="evidence-directions">1 小時 ${direction(a.hourlyDirection)} · 4 小時 ${direction(a.fourHourlyDirection)}${a.aligned?' · 方向一致':' · 方向未一致'}</p>
    ${plans.map(p=>`<details class="evidence-strategy" data-search="evidence-${esc(record.symbol)}-${p.key}" ${display.primary?.familyKey===p.key?'open':''}><summary><span><strong>${names[p.key]}</strong><b>${esc(stateLabel(p,gate))}</b></span><small>${esc(compactValue(p,p.observations))}</small></summary>${p.status!=='SETUP'&&p.reason?`<p class="evidence-reason">${esc(p.reason)}</p>`:''}${checks(p,p.observations,a,gate)}<p class="evidence-next">${p.status==='SETUP'?(gate.key==='plan'?'下一步：重新核對後，依上方有效門檻觀察新觸發。':'方向衝突，暫停所有新進場方案。'):`下一步：${esc(strategyWaitDetail(p).next)}`}</p></details>`).join('')}
    <p class="evidence-time">數值依最近已收盤 1 小時 K 棒：${displayDate(a.closedAt)}；行情核對 ${displayDate(record.checkedAt)}，有效至 ${displayDate(Math.min(record.snapshotUntil,a.validUntil))}。均線與區間界線是判斷參考，不是進場價。</p>
  </section>`;
}
