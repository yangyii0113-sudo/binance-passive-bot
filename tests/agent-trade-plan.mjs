import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAgentTradePlan, agentPlanStatus } from '../src/agent_trade_plan.js';
import { agentTradePlanView } from '../src/agent_trade_plan_view.js';
import { loadAgentPlanHistory, saveAgentPlanHistory, exportAgentPlanHistory } from '../src/agent_plan_history.js';
import { agentComparisonView, restoredAgentComparisons } from '../src/agent_comparison_view.js';
import { researchProtectionStop } from '../src/research_risk_view.js';
import { EXIT_COSTS } from '../src/target_analysis.js';
import { cryptoContractTickers, normalizeUniverse, cachedMarketSnapshot } from '../src/market.js';
import { MARKET_CACHE_KEY } from '../src/config.js';
import { agentHistoryPanel, agentAdvicePanel } from '../src/agent_workflow_view.js';
import { agentPlanPresentation, agentDecisionCard } from '../src/agent_decision_view.js';
import { pages } from '../src/pages.js';
import { appState } from '../src/state.js';

const H=3600000, now=2400*H+120000;
function fixture(side='LONG') {
  const plan={key:'breakout',status:'SETUP',side,entry:100,stop:side==='LONG'?95:105,tp1:side==='LONG'?110:90,tp2:side==='LONG'?120:80,signalAt:2400*H-1,expiresAt:2401*H};
  const row={symbol:'UNIUSDT',analysis:{status:'VALID',analyzedAt:now,closedAt:plan.signalAt,validUntil:plan.expiresAt,strategies:[plan,{key:'structured',status:'WAIT',reason:'等待回調'},{key:'meanReversion',status:'WAIT',reason:'等待震盪'}]}};
  return {symbol:row.symbol,status:'LIVE',checkedAt:now,snapshotUntil:now+60000,marketSnapshot:{price:side==='LONG'?98:102,high:side==='LONG'?99:103,low:side==='LONG'?97:101,barOpen:2400*H,requestedAt:now,receivedAt:now},row};
}
async function generate({side='LONG',contract={},current,fail=false,missing=false,delay=0}={}) {
  const r=fixture(side), calls=[];let clockNow=now;
  const bar=current || [2400*H,side==='LONG'?98:102,side==='LONG'?99:103,side==='LONG'?97:101,side==='LONG'?98:102,100,2401*H-1];
  const fetcher=async url=>{calls.push(url);if(fail)throw new Error('offline');return {ok:true,json:async()=>url.includes('exchangeInfo')?{symbols:[{symbol:'UNIUSDT',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',underlyingType:'COIN',...contract}]}:missing?[]:[bar]};};
  const scanner=async (candidates,{fetcher})=>{assert.equal(candidates[0].symbol,'UNIUSDT');await fetcher('https://fapi.binance.com/fapi/v1/klines?symbol=UNIUSDT&interval=1h&limit=601');clockNow+=delay;return [r.row];};
  return {record:await generateAgentTradePlan('uni / usdt',{fetcher,scanner,clock:()=>clockNow}),calls};
}
test('advice filtering cannot keep a selected expired plan in the actionable group',()=>{
  const live=fixture(),old={...fixture(),symbol:'SOLUSDT',snapshotUntil:now-1};
  const state={agents:{tradePlans:{UNIUSDT:live,SOLUSDT:old}},ui:{adviceSymbol:'SOLUSDT',adviceFilter:'plan'}};
  const before=structuredClone(state),html=agentAdvicePanel(state,now);
  assert.match(html,/data-selected-advice="UNIUSDT"/);
  assert.doesNotMatch(html,/data-agent-advice-symbol="SOLUSDT"/);
  assert.deepEqual(state,before);
  state.ui.adviceFilter='attention';
  const review=agentAdvicePanel(state,now);
  assert.match(review,/data-selected-advice="SOLUSDT"/);
  assert.doesNotMatch(review,/data-agent-advice-symbol="UNIUSDT"|decision-levels/);
});
test('an empty advice filter gives a recovery action without borrowing another group plan',()=>{
  const html=agentAdvicePanel({agents:{tradePlans:{UNIUSDT:fixture()}},ui:{adviceFilter:'attention'}},now);
  assert.match(html,/此分類目前沒有建議/);assert.match(html,/data-advice-filter="all"/);
  assert.doesNotMatch(html,/data-selected-advice=|decision-levels/);
});
test('decision risk amounts appear only for valid gated plans and remain hypothetical',()=>{
  const good=agentDecisionCard(fixture(),{now});
  assert.match(good,/直接止損情境/);assert.match(good,/−2.50/);assert.match(good,/研究本金 1,000 USDT/);
  assert.match(good,/非預期收益/);
  const expired=agentDecisionCard({...fixture(),snapshotUntil:now},{now});
  assert.doesNotMatch(expired,/直接止損情境|decision-levels/);
});
test('agent plans support non-BTC/ETH futures and both directions with complete conditional exits',async()=>{
  for(const side of ['LONG','SHORT']) {
    const {record,calls}=await generate({side});
    assert.equal(calls.length,2);assert.equal(agentPlanStatus(record,now).key,'plan');
    const html=agentTradePlanView(record,{now});
    for(const label of ['100.000','進場有效至','第一止盈','第二止盈','止損點','48 根','失效條件','成本後情境','目前計畫仍未通過跨期、前向與完整成交驗證','真實下單維持鎖定']) assert.ok(html.includes(label),label);
    assert.ok(html.includes(side==='LONG'?'做多':'做空'));
    assert.doesNotMatch(html,/data-paper-open|data-paper-close|data-real-order/);
  }
});
test('ineligible contracts and network errors stop before reading a plan; no spot fallback',async()=>{
  for(const contract of [{underlyingType:'INDEX'},{status:'SETTLING'},{contractType:'CURRENT_QUARTER'},{quoteAsset:'USDC'}]){
    const {record,calls}=await generate({contract});assert.equal(record.status,'BLOCKED');assert.equal(calls.length,1);assert.doesNotMatch(agentTradePlanView(record,{now}),/entry-plan-primary/);
  }
  const {record}=await generate({fail:true});assert.equal(record.status,'BLOCKED');
});
test('already touched, invalidated or missing intrabar data never become new entries',async()=>{
  for(const options of [
    {current:[2400*H,98,100,97,99,100,2401*H-1]},
    {current:[2400*H,98,99,94,98,100,2401*H-1]},
    {side:'SHORT',current:[2400*H,102,103,100,101,100,2401*H-1]},
    {side:'SHORT',current:[2400*H,102,106,101,102,100,2401*H-1]},
    {missing:true}, {current:[2400*H,null,99,97,98,100,2401*H-1]}
  ]){
    const {record}=await generate(options);assert.notEqual(agentPlanStatus(record,now).key,'plan');assert.doesNotMatch(agentTradePlanView(record,{now}),/entry-plan-primary/);
  }
});
test('expired, conflicting, malformed and historical records hide all levels',()=>{
  const cases=[
    r=>r.snapshotUntil=now,
    r=>r.historical=true,
    r=>r.row.analysis.strategies.push({...r.row.analysis.strategies[0],key:'meanReversion',side:'SHORT'}),
    r=>r.row.analysis.strategies[0].stop=110,
    r=>r.row.analysis.strategies[0].expiresAt+=H,
    r=>r.row.analysis.strategies[0].entry=NaN,
    r=>r.checkedAt=now+1000,
    r=>r.row.analysis.closedAt=now+1000,
    r=>{r.row.analysis.strategies[0].tp1=100.01;r.row.analysis.strategies[0].tp2=100.02;},
    r=>r.row.analysis.strategies=[]
  ];
  for(const mutate of cases){const r=fixture();mutate(r);assert.notEqual(agentPlanStatus(r,now).key,'plan');assert.doesNotMatch(agentTradePlanView(r,{now}),/entry-plan-primary/);}
});
function storage(){let data=null;return {getItem:()=>data,setItem:(_key,value)=>{data=value;},raw:()=>data};}
test('research history survives reload, excludes levels/orders, bounds retention and preserves corrupt data',()=>{
  const s=storage(),r=fixture();
  for(let i=0;i<52;i++) saveAgentPlanHistory(r,{storage:s,now,id:`r${i}`,origin:'自選分析',consensus:'偏多'});
  const history=loadAgentPlanHistory(s);assert.equal(history.runs.length,50);assert.equal(history.runs[0].id,'r51');assert.equal(history.runs[0].verdict,'plan');
  assert.doesNotMatch(s.raw(),/"entry"|"stop"|"tp1"|"tp2"|"quantity"|"netPnl"/);
  const html=agentHistoryPanel({agents:{planHistory:history}});assert.match(html,/歷史研究（唯讀）/);assert.doesNotMatch(html,/entry-plan-primary/);
  s.setItem('', '{bad');assert.ok(loadAgentPlanHistory(s).error);assert.throws(()=>saveAgentPlanHistory(r,{storage:s,now,id:'new'}));assert.equal(s.raw(),'{bad');
  assert.throws(()=>saveAgentPlanHistory(r,{storage:{getItem:()=>null,setItem:()=>{throw new Error('quota');}},now,id:'quota'}),/未保存/);
});
test('five-stage flow keeps generated plans available without adding candidates or changing execution state',()=>{
  const state=structuredClone(appState);state.ui.strategyWorkspace='agents';state.ui.agentKey='playbook';
  state.agents.tradePlans={UNIUSDT:fixture()};state.candidates.items=[];
  const before=structuredClone(state),html=pages.strategies(state);
  for(const label of ['分析 → 篩選 → 策略 → 交易建議 → 紀錄','data-agent-key="technical"','data-agent-key="market"','data-agent-key="playbook"','data-agent-key="advice"','data-agent-key="planHistory"','UNIUSDT 完整交易計畫'])assert.ok(html.includes(label));
  assert.match(agentAdvicePanel(state,now),/僅列入條件式模擬觀察/);
  assert.match(agentAdvicePanel(state,now+60000),/暫不進場/);
  assert.deepEqual(state,before);
});

test('exported records are safely quoted, review-only and contain no fabricated fills or old prices',()=>{
  const s=storage();
  const history=saveAgentPlanHistory(fixture(),{storage:s,now,id:'export',origin:'=SUM(1,2)',consensus:'偏多\n"需確認"',technicalAt:now});
  const csv=exportAgentPlanHistory(history,{format:'csv',now});
  assert.match(csv.text,/"'=SUM\(1,2\)"/);assert.match(csv.text,/"偏多\n""需確認"""/);
  assert.match(csv.text,/非成交；不可直接下單/);assert.match(csv.text,/區間突破/);assert.match(csv.text,/技術分析時間/);
  const json=JSON.parse(exportAgentPlanHistory(history,{format:'json',now}).text);
  assert.equal(json.canonical,false);assert.equal(json.containsFills,false);assert.equal(json.noBackfill,true);assert.equal(json.runs[0].technicalAt,now);
  assert.doesNotMatch(JSON.stringify(json),/"entry"|"stop"|"tp1"|"tp2"|"quantity"|"netPnl"/);
  assert.throws(()=>exportAgentPlanHistory({runs:[]}),/尚無/);
  assert.throws(()=>exportAgentPlanHistory({...history,error:'損毀'}),/異常/);
  const html=agentHistoryPanel({agents:{planHistory:history,planExport:{...csv,text:'</textarea><script>bad</script>'}}});
  assert.match(html,/readonly/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;\/textarea&gt;/);
});

function comparisonFixture() {
  const metrics={trades:9,signals:11,skipped:2,netPnl:15,netReturnPct:1.5,winRate:55,profitFactor:1.3,avgPnl:15/9,closedDrawdownPct:1};
  return {status:'LIVE',updatedAt:new Date(now).toISOString(),result:{symbol:'UNIUSDT',version:'TP01-S1',start:now-90*24*H,split:now-27*24*H,end:now,families:{version:'families-v1',rows:['pullback','structured','breakout','meanReversion'].map(key=>({key,development:metrics,holdout:metrics,stress:{...metrics,netPnl:8}}))}}};
}
test('matching research comparisons survive restore without authorizing expired plans',()=>{
  const c=comparisonFixture();
  let html=agentComparisonView(c,'UNIUSDT',{allowed:true});assert.match(html,/1.50%/);assert.match(html,/樣本不足/);assert.match(html,/不解除進場與資料完整性檢查/);
  html=agentComparisonView(c,'ETHUSDT');assert.doesNotMatch(html,/1.50%/);
  html=agentComparisonView({...c,status:'LOADING'},'UNIUSDT');assert.match(html,/正在讀取完整歷史/);assert.doesNotMatch(html,/1.50%/);
  html=agentComparisonView({status:'ERROR',error:'缺漏<script>'},'UNIUSDT');assert.match(html,/缺漏&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
  const restored=restoredAgentComparisons({runs:[{updatedAt:c.updatedAt,rows:[{symbol:'UNIUSDT',status:'DONE',result:c.result},{symbol:'ETHUSDT',status:'RUNNING'}]}]});
  assert.equal(restored.UNIUSDT.historical,true);assert.equal(restored.ETHUSDT,undefined);
  html=agentTradePlanView(fixture(),{now:now+60000,comparison:restored.UNIUSDT});assert.match(html,/歷史比較（唯讀）/);assert.doesNotMatch(html,/entry-plan-primary/);
});

test('cost-protection stops cover the configured costs for long and short without moving stops backwards',()=>{
  for(const side of ['LONG','SHORT']){
    const p=fixture(side).row.analysis.strategies[0];
    const level=researchProtectionStop(p),sign=side==='LONG'?1:-1;
    const entry=p.entry*(1+sign*EXIT_COSTS.slippage),exit=level*(1-sign*EXIT_COSTS.slippage);
    const pnl=sign*(exit-entry)-EXIT_COSTS.fee*(entry+exit);
    assert.ok(Math.abs(pnl)<1e-10);assert.ok(sign*(level-p.stop)>0);
  }
  assert.equal(researchProtectionStop({}),null);
});

test('partial strategy sets and extended snapshot windows fail closed',()=>{
  for(const mutate of [r=>r.row.analysis.strategies.pop(),r=>r.row.analysis.strategies[1].key='breakout',r=>r.snapshotUntil+=1,r=>r.row.analysis.validUntil+=H]){
    const record=fixture();mutate(record);assert.equal(agentPlanStatus(record,now).key,'blocked');assert.doesNotMatch(agentTradePlanView(record,{now}),/entry-plan-primary/);
  }
});

test('market selection hands off any listed symbol without adding a candidate or requiring BTC/ETH',()=>{
  const s=structuredClone(appState);s.ui.strategyWorkspace='agents';s.ui.agentKey='market';s.ui.agentFilter='universe';s.market.status='LIVE';s.market.rows=[['U','UNI / USDT','10',3,5e7,70]];s.market.universeRows=s.market.rows;
  const before=structuredClone(s);const html=pages.strategies(s);
  assert.match(html,/data-agent-analyze="UNIUSDT"/);assert.match(html,/分析並擬定計畫/);assert.deepEqual(s,before);
});

test('market pool excludes non-crypto, dated, inactive and unverified contracts before ranking',()=>{
  const ticker=symbol=>({symbol,lastPrice:'10',priceChangePercent:'3',quoteVolume:'9999999999'});
  const contract=symbol=>({symbol,status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',underlyingType:'COIN'});
  const symbols=[contract('UNIUSDT'),{...contract('SOXLUSDT'),underlyingType:'INDEX'},{...contract('XAUUSDT'),underlyingType:'COMMODITY'},{...contract('OLDUSDT'),status:'SETTLING'},{...contract('BTCUSDT'),contractType:'CURRENT_QUARTER'},contract('USDCUSDT')];
  const rows=normalizeUniverse(cryptoContractTickers(['UNIUSDT','SOXLUSDT','XAUUSDT','OLDUSDT','BTCUSDT','UNKNOWNUSDT','USDCUSDT'].map(ticker),{symbols}));
  assert.deepEqual(rows.map(row=>row[1]),['UNI / USDT']);
  assert.throws(()=>cryptoContractTickers([],{}),/合約清單/);
});

test('old unverified market caches cannot repopulate the crypto screen',()=>{
  const previous=globalThis.localStorage;
  const cache={rows:[['','SOXL / USDT','100',3,1e9,80]],updatedAt:new Date(now).toISOString()};
  globalThis.localStorage={getItem:key=>key===MARKET_CACHE_KEY?JSON.stringify(cache):null};
  try{assert.equal(cachedMarketSnapshot(),null);cache.cryptoOnly=true;assert.equal(cachedMarketSnapshot().status,'STALE');}
  finally{globalThis.localStorage=previous;}
});

test('decision summaries use gated levels for either side and never restore expired or malformed prices',()=>{
  for(const side of ['LONG','SHORT']){
    const record=fixture(side), before=structuredClone(record);
    const html=agentDecisionCard(record,{now});
    for(const text of ['100.000','止損點','第一止盈','第二止盈','成本後目標風報比','正式帳本、最新淨值與完整部位尚未核對',side==='LONG'?'向上突破':'向下跌破'])assert.ok(html.includes(text),text);
    assert.doesNotMatch(html,/data-paper-open|data-real-order|保證盈利/);
    assert.deepEqual(record,before);
    for(const mutate of [r=>r.snapshotUntil=now,r=>r.historical=true,r=>r.row.analysis.strategies[0].stop=r.row.analysis.strategies[0].entry,r=>r.row.analysis.strategies={wrong:true}]){
      const invalid=structuredClone(record);mutate(invalid);
      const blocked=agentDecisionCard(invalid,{now});
      assert.doesNotMatch(blocked,/decision-levels|100\.000/);
      assert.match(blocked,/暫不進場/);
    }
  }
});

test('strategy conditions and quote integrity remain independent display states',()=>{
  const fresh=fixture();
  assert.equal(agentPlanPresentation(fresh,now).strategy,'研究條件成立');
  assert.equal(agentPlanPresentation(fresh,now).data,'本次核對完整');
  const waiting=fixture();waiting.row.analysis.strategies[0].status='WAIT';
  assert.equal(agentPlanPresentation(waiting,now).strategy,'等待條件');
  assert.equal(agentPlanPresentation(waiting,now).data,'本次核對完整');
  assert.equal(agentPlanPresentation(waiting,now+60000).strategy,'需重新判斷');
  assert.equal(agentPlanPresentation(waiting,now+60000).data,'已過期');
  waiting.row.analysis.strategies[0].status='BLOCKED';
  assert.equal(agentPlanPresentation(waiting,now).strategy,'尚待核對');
  assert.equal(agentPlanPresentation(waiting,now).data,'部分待核對');
  waiting.row.analysis.strategies.pop();
  assert.equal(agentPlanPresentation(waiting,now).data,'不足或異常');
  const conflict=fixture();conflict.row.analysis.strategies[1]={...fixture('SHORT').row.analysis.strategies[0],key:'structured'};
  assert.equal(agentPlanPresentation(conflict,now).strategy,'方向衝突');
  assert.equal(agentPlanPresentation(conflict,now).data,'本次核對完整');
  assert.doesNotMatch(agentDecisionCard(conflict,{now}),/decision-levels/);
});

test('advice displays one selected coin without borrowing another coin levels or changing records',()=>{
  const ready=fixture(),waiting=fixture();waiting.symbol='SOLUSDT';waiting.row.symbol='SOLUSDT';waiting.row.analysis.strategies[0].status='WAIT';
  const s=structuredClone(appState);s.agents.tradePlans={UNIUSDT:ready,SOLUSDT:waiting};s.ui.adviceSymbol='SOLUSDT';
  const before=structuredClone(s),html=agentAdvicePanel(s,now);
  assert.match(html,/data-selected-advice="SOLUSDT"/);
  assert.equal((html.match(/class="agent-decision-card"/g)||[]).length,1);
  assert.match(html,/目前 1 檔有條件式模擬計畫/);
  assert.doesNotMatch(html,/decision-levels|100\.000/);
  assert.match(html,/暫不進場 · 等待條件/);
  assert.deepEqual(s,before);
  s.ui.adviceSymbol=null;assert.match(agentAdvicePanel(s,now),/data-selected-advice="UNIUSDT"/);
  s.ui.adviceSymbol='UNIUSDT';const expired=agentAdvicePanel(s,now+60000);
  assert.match(expired,/目前 0 檔有條件式模擬計畫/);assert.doesNotMatch(expired,/decision-levels|100\.000/);
});

test('direct advice route exposes an actionable empty state and preserves separate research views',()=>{
  const s=structuredClone(appState),before=structuredClone(s),html=pages.advice(s);
  assert.match(html,/選擇分析幣種/);assert.match(html,/產生交易建議/);
  assert.match(html,/data-agent-key="advice" role="tab" aria-selected="true"/);
  assert.doesNotMatch(html,/class="agent-tabs"|data-pullback-scan|decision-levels/);
  assert.deepEqual(s,before);
  s.ui.strategyWorkspace='signals';assert.match(pages.strategies(s),/data-pullback-scan/);
});


test('plan levels preserve small coin price differences in summary and full strategy',()=>{
  const r=fixture(),p=r.row.analysis.strategies[0];
  for(const scale of [1,1e8]) {
    Object.assign(p,{entry:0.000000012345*scale,stop:0.000000011*scale, tp1:0.000000015*scale,tp2:0.000000018*scale});
    Object.assign(r.marketSnapshot,{price:0.000000012*scale,high:0.0000000121*scale,low:0.0000000119*scale});
    const levels=scale===1?['0.000000012345','0.000000011','0.000000015','0.000000018']:['1.2345','1.100','1.500','1.800'];
    for(const html of [agentDecisionCard(r,{now}),agentTradePlanView(r,{now})]) {
      for(const level of levels)assert.ok(html.includes(level),level);
      assert.doesNotMatch(html,/NaN|Infinity/);
    }
  }
});
test('decision explains directional price changes and strategy-specific stop handling',()=>{
  for(const side of ['LONG','SHORT']){
    const r=fixture(side),p=r.row.analysis.strategies[0];
    let html=agentDecisionCard(r,{now});
    assert.match(html,side==='LONG'?/價格上漲 10.00%/:/價格下跌 10.00%/);
    assert.match(html,side==='LONG'?/價格下跌 5.00%/:/價格上漲 5.00%/);
    assert.match(html,/第一止盈之後/);assert.match(html,/止損維持/);
    assert.match(html,/價格變動不是淨報酬/);
    r.row.analysis.strategies[1].key='breakout';p.key='structured';
    html=agentDecisionCard(r,{now});
    assert.match(html,/下一根一小時 K 棒起/);assert.match(html,/成本保護止損/);
    assert.match(html,/48 根/);
  }
});
test('slow analysis cannot grant an extra minute to an old market snapshot',async()=>{
  const {record}=await generate({delay:61000});
  assert.equal(agentPlanStatus(record,now+61000).key,'expired');
  assert.doesNotMatch(agentDecisionCard(record,{now:now+61000}),/decision-levels/);
});
test('fresh plans expose a dated candle snapshot and signed distance to entry',async()=>{
  for(const side of ['LONG','SHORT']){
    const {record}=await generate({side});
    const html=agentDecisionCard(record,{now});
    assert.match(html,/核對時參考價/);assert.match(html,/非串流報價/);
    assert.match(html,side==='LONG'?/尚需上漲 2.04%/:/尚需下跌 1.96%/);
    assert.equal(record.marketSnapshot.price,side==='LONG'?98:102);
  }
});
test('missing or inconsistent snapshot provenance blocks displayable entry levels',async()=>{
  const {record}=await generate();
  for(const mutate of [r=>delete r.marketSnapshot,r=>r.marketSnapshot.price=1000,r=>r.marketSnapshot.receivedAt=now+1,r=>r.marketSnapshot.requestedAt=now-61000,r=>r.marketSnapshot.barOpen-=H]){
    const r=structuredClone(record);mutate(r);
    assert.notEqual(agentPlanStatus(r,now).key,'plan');
    assert.doesNotMatch(agentDecisionCard(r,{now}),/decision-levels/);
  }
});
