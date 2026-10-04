import { agentPlanStatus } from './agent_trade_plan.js';
import { coinLogo } from './coin_logo.js';
import { escapeHtml as esc } from './ui.js';

// Display only. Fresh candidate membership and the existing plan gate remain authoritative.
export function surgeEvidence(record,symbol,now=Date.now()){
 const gate=agentPlanStatus(record,now);
 const empty={eligible:true,priority:3,label:'動能候選 · 待核對',volume:null,breakout:null,trend:'尚未核對',plan:false};
 if(!record||record.symbol!==symbol||record.row?.symbol!==symbol||!['plan','wait'].includes(gate.key))return {...empty,eligible:!record||gate.key==='loading',label:gate.key==='expired'?'資料已過期 · 需更新':gate.key==='conflict'?'方向衝突 · 暫停':empty.label};
 const a=record.row.analysis,p=a.strategies.find(p=>p.key==='breakout'),o=p?.observations;
 const valid=o?.version==='strategy-conditions-v1'&&o.closedAt===a.closedAt&&
  ['close','upper','lower','averageVolume','lastVolume'].every(k=>Number.isFinite(o[k]))&&o.close>0&&o.lower>0&&o.upper>o.lower&&o.averageVolume>0&&o.lastVolume>=0;
 const volume=valid?o.lastVolume/o.averageVolume:null,breakout=valid?o.close>o.upper:null;
 const plan=valid&&breakout&&volume>=1.5&&gate.plans.some(p=>p.key==='breakout'&&p.side==='LONG');
 const dir=v=>({LONG:'偏多',SHORT:'偏空',MIXED:'未一致'})[v]||'待核對';
 return {eligible:true,priority:plan?0:valid&&breakout&&volume>=1.5?1:valid?2:3,
  label:plan?'放量突破 · 等待新觸發':valid&&breakout&&volume>=1.5?'放量突破 · 進場未通過':valid?'突破條件待確認':empty.label,
  volume,breakout,trend:'1 小時 '+dir(a.hourlyDirection)+'／4 小時 '+dir(a.fourHourlyDirection),plan};
}
export function surgeWatchView(model,records={},now=Date.now()){
 const rows=model.rows.map(row=>({...row,surge:surgeEvidence(records[row.symbol],row.symbol,now)}))
  .filter(row=>row.surge.eligible)
  .sort((a,b)=>a.surge.priority-b.surge.priority||a.rank-b.rank).slice(0,3);
 return '<section class="surge-watch" aria-label="急漲觀察"><div class="surge-heading"><div><span>動能候選焦點</span><h2>急漲觀察</h2></div><span>最多 3 檔 · 僅模擬研究</span></div><p>從本輪強勢前 10 檔中突出放量突破證據；已核對條件優先，未核對者依動能名次；過期、方向衝突或資料受阻者不列入焦點。這是觀察清單，尚無暴漲機率驗證。</p>'+
 (rows.length?'<div class="surge-grid">'+rows.map(row=>'<article class="surge-card" data-surge-candidate="'+esc(row.symbol)+'"><div class="surge-identity">'+coinLogo(row.symbol)+'<strong>'+esc(row.symbol)+'</strong></div><strong class="surge-state">'+esc(row.surge.label)+'</strong><details class="core-disclosure"><summary>查看放量、突破與趨勢依據</summary><dl><div><dt>24 小時漲幅</dt><dd>+'+row.change.toFixed(2)+'%</dd></div><div><dt>動能／流動性分</dt><dd>'+row.strength.toFixed(1)+'／100</dd></div><div><dt>收盤棒放量</dt><dd>'+(row.surge.volume===null?'待核對':row.surge.volume.toFixed(2)+' 倍 · '+(row.surge.volume>=1.5?'達 1.50 倍門檻':'未達 1.50 倍'))+'</dd></div><div><dt>向上收盤突破</dt><dd>'+(row.surge.breakout===null?'待核對':row.surge.breakout?'已突破前 20 根上緣':'尚未突破')+'</dd></div></dl><p>'+esc(row.surge.trend)+'</p></details><p class="surge-risk">'+(row.surge.plan?'有效做多計畫仍未成交；已錯過觸發、先觸及止損或資料過期時取消。':'尚無通過核對的放量突破做多計畫；漲幅高不等於適合追價。')+'</p><button type="button" class="secondary-btn" '+(row.surge.priority===3?'data-home-check-symbol':'data-agent-advice-symbol')+'="'+esc(row.symbol)+'">'+(row.surge.priority===3?'核對進場條件':'查看條件與進退場')+'</button></article>').join('')+'</div>':'<p class="surge-empty" role="status">目前沒有可列入焦點的候選。請更新並核對前 10 檔；過期或受阻資料不沿用。</p>')+'</section>';
}
