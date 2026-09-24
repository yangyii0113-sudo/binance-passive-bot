import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAgentTradePlan, agentPlanStatus } from '../src/agent_trade_plan.js';
import { agentTradePlanView } from '../src/agent_trade_plan_view.js';
import { loadAgentPlanHistory, saveAgentPlanHistory } from '../src/agent_plan_history.js';
import { agentHistoryPanel, agentAdvicePanel } from '../src/agent_workflow_view.js';
import { pages } from '../src/pages.js';
import { appState } from '../src/state.js';

const H=3600000, now=2400*H+120000;
function fixture(side='LONG') {
  const plan={key:'breakout',status:'SETUP',side,entry:100,stop:side==='LONG'?95:105,tp1:side==='LONG'?110:90,tp2:side==='LONG'?120:80,signalAt:2400*H-1,expiresAt:2401*H};
  const row={symbol:'UNIUSDT',analysis:{status:'VALID',analyzedAt:now,closedAt:plan.signalAt,validUntil:plan.expiresAt,strategies:[plan,{key:'structured',status:'WAIT',reason:'等待回調'},{key:'meanReversion',status:'WAIT',reason:'等待震盪'}]}};
  return {symbol:row.symbol,status:'LIVE',checkedAt:now,snapshotUntil:now+60000,row};
}
async function generate({side='LONG',contract={},current,fail=false,missing=false}={}) {
  const r=fixture(side), calls=[];
  const bar=current || [2400*H,side==='LONG'?98:102,side==='LONG'?99:103,side==='LONG'?97:101,side==='LONG'?98:102,100,2401*H-1];
  const fetcher=async url=>{calls.push(url);if(fail)throw new Error('offline');return {ok:true,json:async()=>url.includes('exchangeInfo')?{symbols:[{symbol:'UNIUSDT',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',underlyingType:'COIN',...contract}]}:missing?[]:[bar]};};
  const scanner=async (candidates,{fetcher})=>{assert.equal(candidates[0].symbol,'UNIUSDT');await fetcher('https://fapi.binance.com/fapi/v1/klines?symbol=UNIUSDT&interval=1h&limit=601');return [r.row];};
  return {record:await generateAgentTradePlan('uni / usdt',{fetcher,scanner,clock:()=>now}),calls};
}
test('agent plans support non-BTC/ETH futures and both directions with complete conditional exits',async()=>{
  for(const side of ['LONG','SHORT']) {
    const {record,calls}=await generate({side});
    assert.equal(calls.length,2);assert.equal(agentPlanStatus(record,now).key,'plan');
    const html=agentTradePlanView(record,{now});
    for(const label of ['100.000','進場有效至','第一止盈','第二止盈','止損點','48 根','失效條件','成本後情境','目前計畫尚未完成相同規則的績效驗證','真實下單維持鎖定']) assert.ok(html.includes(label),label);
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
