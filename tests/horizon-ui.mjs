import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHorizon} from '../src/horizon_strategies.js';
import {homeCandidates} from '../src/home_opportunities.js';
const view=await import('../src/horizon_view.js').catch(()=>({}));
const H=3600000,now=Date.UTC(2026,9,6,4,2);
function record(){const frames={};for(const [f,step] of [['1h',H],['4h',4*H],['1d',24*H]]){const end=Math.floor(now/step)*step;frames[f]=Array.from({length:240},(_,i)=>{const p=80+i*.1,o=end-(240-i)*step;return [o,p,p+.12,p-.12,p+.04,100,o+step-1];});}const last=frames['1h'].at(-1);last[2]+=1;last[4]=last[2]-.02;last[5]=250;const open=last[6]+1;frames['1h'].push([open,last[4],last[4]+.001,last[4]-.001,last[4],1,open+H-1]);return analyzeHorizon({symbol:'SOLUSDT',horizon:'week',frames,now,requestedAt:now,receivedAt:now,contractVerifiedAt:now,source:'Binance USD-M public klines'});}
test('horizon cards put identity before verdict and hide expired usable prices',()=>{
 assert.equal(typeof view.horizonPanel,'function');const r=record(),state={ui:{horizon:'week',horizonSymbol:'SOLUSDT'},agents:{horizonPlans:{'week:SOLUSDT':r}}};
 const html=view.horizonPanel(state,now);assert.match(html,/日內機會/);assert.match(html,/週級波段/);assert.match(html,/月級趨勢/);assert.match(html,/data-price-level="entry"/);assert.ok(html.indexOf('coin-identity')<html.indexOf('條件成立'));
 const stale=view.horizonPanel(state,now+60000);assert.doesNotMatch(stale,/data-price-level/);assert.match(stale,/重新/);assert.match(stale,/REAL_ORDER_LOCK/);
});
test('missing data and errors stay visible and user strings are escaped',()=>{
 assert.equal(typeof view.horizonPanel,'function');const html=view.horizonPanel({ui:{horizonSymbol:'<img>'},agents:{horizonPlans:{'week:<img>':{symbol:'<img>',horizon:'week',status:'BLOCKED',reason:'來源 <failed>'}}}},now);
 assert.doesNotMatch(html,/<img>/);assert.match(html,/來源 &lt;failed&gt;/);assert.doesNotMatch(html,/data-price-level/);
});
test('horizon symbol is selected from screened candidates rather than free text',()=>{
 assert.match(view.horizonPanel({ui:{horizonSymbol:'1000PEPEUSDT'}}),/<form[^>]*id="horizon-analysis-form"/);
 assert.match(view.horizonPanel({ui:{horizonSymbol:'1000PEPEUSDT'}}),/<select[^>]*name="symbol"/);
 assert.doesNotMatch(view.horizonPanel({ui:{}}),/<input[^>]*id="horizon-symbol"/);
});
function screenedMarket(){return {status:'LIVE',updatedAt:new Date(now).toISOString(),contractVerifiedAt:new Date(now).toISOString(),cryptoOnly:true,universeRows:[['','SOLUSDT',100,6,2e7,85],['','1000PEPEUSDT',.01,8,3e7,90],['','THINUSDT',1,10,100,95],['','SPIKEUSDT',1,35,2e7,99]]};}
test('dropdown uses the screened pool, preserves full contracts and rejects stale choices',()=>{
 const state={ui:{horizonSymbol:'1000PEPEUSDT'},market:screenedMarket()};
 const html=view.horizonPanel(state,now),select=html.match(/<select[^>]*id="horizon-symbol"[\s\S]*?<\/select>/)?.[0];
 assert.ok(select);assert.match(select,/<option value="1000PEPEUSDT" selected/);assert.match(select,/<option value="SOLUSDT"/);
 assert.doesNotMatch(select,/THINUSDT|SPIKEUSDT|BTCUSDT|ETHUSDT/);
 const stale=view.horizonPanel(state,now+301000),staleSelect=stale.match(/<select[^>]*id="horizon-symbol"[\s\S]*?<\/select>/)?.[0];
 assert.match(staleSelect,/disabled/);assert.doesNotMatch(staleSelect,/<option value="1000PEPEUSDT"/);
 assert.match(stale, /data-horizon-analyze disabled/);
 assert.match(stale,/data-horizon-refresh/);
});
test('an excluded selected coin is not silently replaced with another candidate',()=>{
 const html=view.horizonPanel({ui:{horizonSymbol:'BTCUSDT'},market:screenedMarket()},now);
 assert.match(html,/BTCUSDT.*不在本次候選/);assert.match(html,/data-horizon-analyze disabled/);
 assert.doesNotMatch(html,/<option value="(?:SOL|1000PEPE)USDT" selected/);
});
test('home entry defaults to a screened candidate instead of a hardcoded BTC',()=>{
 const html=view.horizonOpportunities({ui:{selectedSymbol:'BTCUSDT'},market:screenedMarket()},now);
 assert.doesNotMatch(html,/data-horizon-target="BTCUSDT"/);
 assert.match(html,/<option value="1000PEPEUSDT" selected/);
});
test('home opportunities expose screened selection and analyze all periods in place',()=>{
 const html=view.horizonOpportunities({ui:{horizonSymbol:'1000PEPEUSDT'},market:screenedMarket()},now);
 assert.match(html,/<select[^>]*id="horizon-symbol"/);
 assert.match(html,/data-horizon-analyze-all/);
 assert.equal((html.match(/data-horizon-card=/g)||[]).length,1);
 assert.equal((html.match(/class="coin-identity/g)||[]).length,1);
 assert.equal((html.match(/data-horizon="(?:day|week|month)"/g)||[]).length,3);
 assert.doesNotMatch(html,/data-horizon-home|opportunity-cycle/);
});
test('selected home coin never shows another coin research verdict',()=>{
 const r=record();const html=view.horizonOpportunities({ui:{horizonSymbol:'1000PEPEUSDT'},market:screenedMarket(),agents:{horizonPlans:{'week:SOLUSDT':r}}},now);
 assert.doesNotMatch(html,/條件成立・待觸發|1 檔有效計畫|data-horizon-target="SOLUSDT"/);
 assert.match(html,/1000PEPEUSDT/);
});
test('active horizon sample stays visible ahead of later failed registration',()=>{
 const html=view.horizonPanel({ui:{horizon:'week',horizonSymbol:'SOLUSDT'},forward:{enabled:true,book:{rows:[{horizon:'week',symbol:'SOLUSDT',status:'OPEN',reason:'模擬進場'},{horizon:'week',symbol:'SOLUSDT',status:'NOT_TRACKED',reason:'未登錄'}]}}},now);
 assert.match(html,/本機觀察：模擬持倉中/);
});
test('home strategy opportunities are visible before secondary disclosures',async()=>{
 const {homePage}=await import('../src/pages.js'),{appState}=await import('../src/state.js');
 const html=homePage(structuredClone(appState),now);
 const board=html.indexOf('aria-label="策略機會總覽"');
 assert.ok(board>=0,'home must show opportunity overview');
 assert.ok(board<html.indexOf('其他市場排行與研究工具'));
 assert.doesNotMatch(html.slice(0,board),/<details[^>]*>[\s\S]*$/);
});
test('home shows the selected plan directly and removes prices when its gate expires',()=>{
 const r=record(),state={ui:{horizon:'week',horizonSymbol:'SOLUSDT'},market:screenedMarket(),agents:{horizonPlans:{'week:SOLUSDT':r}}};
 const html=view.horizonOpportunities(state,now);
 assert.match(html,/條件成立・待觸發/);assert.match(html,/data-price-level="entry"/);
 assert.equal((html.match(/data-horizon-card=/g)||[]).length,1);
 const stale=view.horizonOpportunities(state,now+60000);
 assert.doesNotMatch(stale,/data-price-level/);assert.match(stale,/核對已過期/);
});
test('failed and unselected period states stay legible without fabricated setups',()=>{
 const state={ui:{horizon:'week',horizonSymbol:'SOLUSDT'},market:screenedMarket(),agents:{horizonPlans:{'day:SOLUSDT':{horizon:'day',symbol:'SOLUSDT',status:'BLOCKED',reason:'缺少收盤資料'}}}};
 const html=view.horizonOpportunities(state,now);
 assert.match(html,/缺少收盤資料/);assert.match(html,/尚未分析/);
 assert.doesNotMatch(html,/data-price-level/);
});
test('switching periods cannot reuse another period or contract prices',()=>{
 const r=record(),state={ui:{horizon:'day',horizonSymbol:'SOLUSDT'},market:screenedMarket(),agents:{horizonPlans:{'week:SOLUSDT':r}}};
 assert.doesNotMatch(view.horizonOpportunities(state,now),/data-price-level/);
 state.ui.horizon='week';r.symbol='1000PEPEUSDT';
 const html=view.horizonOpportunities(state,now);assert.doesNotMatch(html,/data-price-level/);assert.match(html,/身分不符/);
});
test('secondary research keeps exceptions and stop controls outside its collapsed content',async()=>{
 const {researchOverview}=await import('../src/research_overview.js');
 const {agentAdvicePanel}=await import('../src/agent_workflow_view.js');
 const state={ui:{},agents:{tradePlans:{SOLUSDT:{symbol:'SOLUSDT',status:'BLOCKED',reason:'來源異常'}}},forward:{enabled:true,book:{rows:[]},feeds:[]},adviceMonitor:{enabled:true,error:'監控異常',alerts:[]}};
 for(const html of [researchOverview(state,now),agentAdvicePanel(state,now)]){
   const start=html.indexOf('data-legacy-research');assert.ok(start>=0);
   const before=html.slice(0,start);assert.match(before,/來源異常/);assert.match(before,/監控異常/);assert.match(before,/data-forward-stop/);
   assert.doesNotMatch(html.slice(Math.max(0,start-60),start),/open/);
 }
});
test('primary selection shows the five strongest rising contracts without reserve slots displacing them',()=>{
 const market=screenedMarket();
 market.universeRows=[...market.universeRows,
  ['','SUIUSDT',1,7,4e7,88],['','ETHUSDT',1,6,4e7,85],['','BNBUSDT',1,5,4e7,84],['','XRPUSDT',1,4,4e7,82],
  ...['A','B','C','D'].map(x=>['',`${x}USDT`,1,-1,5e7,95]),
  ...['E','F','G'].map(x=>['',`${x}USDT`,1,-10,5e7,99])];
 const before=structuredClone(market),legacy=homeCandidates(market,now).rows;
 assert.equal(legacy.length,10);assert.ok(legacy.some(x=>x.change<0));
 const selection=view.horizonCandidateSelection({ui:{},market},now);
 assert.deepEqual(selection.rows.map(x=>x.symbol),['1000PEPEUSDT','SUIUSDT','ETHUSDT','SOLUSDT','BNBUSDT']);
 assert.equal(selection.symbol,'1000PEPEUSDT');assert.ok(selection.eligible);
 const html=view.horizonSelectionControls({ui:{},market},now);
 assert.equal((html.match(/<option value="[^"]+"/g)||[]).length,5);
 assert.match(html,/前 5 強/);assert.match(html,/24h/);assert.match(html,/動能/);
 assert.doesNotMatch(html,/<option value="(?:A|B|C|D|E|F|G|XRP|THIN|SPIKE)USDT"/);
 assert.deepEqual(homeCandidates(market,now).rows,legacy);assert.deepEqual(market,before);
 const excluded=view.horizonCandidateSelection({ui:{horizonSymbol:'XRPUSDT'},market},now);
 assert.equal(excluded.symbol,'XRPUSDT');assert.equal(excluded.eligible,false);
 assert.match(view.horizonPanel({ui:{horizonSymbol:'XRPUSDT'},market},now),/data-horizon-analyze disabled/);
});
test('top five never fills vacant slots with declining, thin or stale candidates',()=>{
 const market=screenedMarket();market.universeRows.push(['','DOWNUSDT',1,-10,8e7,99]);
 assert.equal(view.horizonCandidateSelection({market},now).rows.length,2);
 for(const update of [{updatedAt:new Date(now-301000).toISOString()},{contractVerifiedAt:new Date(now-301000).toISOString()},{cryptoOnly:false}]){
  const selection=view.horizonCandidateSelection({market:{...market,...update}},now);
  assert.deepEqual(selection.rows,[]);assert.equal(selection.eligible,false);
 }
 market.universeRows=market.universeRows.filter(row=>row[3]<0||row[3]>=30||row[4]<1e7);
 assert.deepEqual(view.horizonCandidateSelection({market},now).rows,[]);
 assert.match(view.horizonSelectionControls({market},now),/沒有符合/);
});
