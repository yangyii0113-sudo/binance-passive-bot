import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdviceMonitor, AUTO_CHECK_MS } from '../src/advice_monitor.js';
import { pullbackReadiness } from '../src/entry_readiness.js';
import { adviceMonitorView } from '../src/advice_monitor_view.js';
import { agentDecisionCard } from '../src/agent_decision_view.js';
import { appState, setStateSlice } from '../src/state.js';
const H=3600000,now=2400*H+120000;
test('application initialization accepts monitor updates through its registered state slice',()=>{
 const before=structuredClone(appState.adviceMonitor);
 const m=createAdviceMonitor({scan:async()=>[],onChange:v=>setStateSlice('adviceMonitor',v)});
 m.pause();assert.equal(appState.adviceMonitor.paused,true);assert.equal(appState.adviceMonitor.enabled,true);
 Object.assign(appState.adviceMonitor,before);
});
function record(side='LONG') {
 const p={key:'structured',status:'SETUP',side,entry:100,stop:side==='LONG'?95:105,tp1:side==='LONG'?110:90,tp2:side==='LONG'?120:80,signalAt:2400*H-1,expiresAt:2401*H,
  observations:{version:'strategy-conditions-v1',closedAt:2400*H-1,side,ema20:100,open:side==='LONG'?100:101,close:side==='LONG'?101:100,high:102,low:99}};
 if(side==='SHORT')p.observations.ema20=101;
 return {symbol:'UNIUSDT',status:'LIVE',checkedAt:now,snapshotUntil:now+60000,marketSnapshot:{price:side==='LONG'?98:102,high:side==='LONG'?99:103,low:side==='LONG'?97:101,barOpen:2400*H,requestedAt:now,receivedAt:now},row:{symbol:'UNIUSDT',analysis:{status:'VALID',analyzedAt:now,closedAt:2400*H-1,validUntil:2401*H,strategies:[p,{key:'breakout',status:'WAIT',reason:'尚未收盤突破前 20 根最高／最低價'},{key:'meanReversion',status:'WAIT',reason:'等待均線靠攏的震盪區間'}]}}};
}
test('platform distinguishes completed pullback from eligible plan for both directions',()=>{
 for(const side of ['LONG','SHORT']){
  const r=record(side);assert.equal(pullbackReadiness(r,now).key,'ready');
  r.row.analysis.strategies[0].status='SKIP';r.row.analysis.strategies[0].reason='最近支撐／壓力不足 1R 空間，略過';
  const result=pullbackReadiness(r,now);assert.equal(result.key,'complete');assert.equal(result.complete,true);
  const html=agentDecisionCard(r,{now});assert.match(html,/回踩完成 · 暫不進場/);assert.doesNotMatch(html,/decision-levels/);
 }
});
test('no completion claim from stale annotations, unfinished pullback or old gate',()=>{
 const mutations=[r=>r.snapshotUntil=now,r=>r.historical=true,r=>r.row.symbol='BTCUSDT',r=>r.row.analysis.strategies[0].observations.closedAt-=H,r=>r.row.analysis.strategies[0].observations.low=101,r=>r.row.analysis.strategies[0].observations.close=100,r=>r.row.analysis.strategies[0].observations.open=102];
 for(const mutate of mutations){const r=record();mutate(r);assert.equal(pullbackReadiness(r,now).complete,false);}
});
test('automatic checks repeat without overlap and stale in-flight scans cannot publish',async()=>{
 let t=now,visible=true,calls=0,resolve,current;
 const m=createAdviceMonitor({clock:()=>t,available:()=>visible,scan:guard=>{calls++;current=guard;return new Promise(r=>resolve=r);}});
 const first=m.tick();await m.tick();assert.equal(calls,1);
 visible=false;m.pause();assert.equal(current(),false);resolve([record()]);await first;
 assert.equal(m.view().lastAt,null);assert.deepEqual(m.view().alerts,[]);
 visible=true;const second=m.tick();resolve([record()]);await second;
 assert.equal(calls,2);assert.equal(m.view().alerts.length,2);
 await m.tick();assert.equal(calls,2);
 t+=AUTO_CHECK_MS;const third=m.tick();resolve([record()]);await third;
 assert.equal(calls,3);assert.equal(m.view().alerts.length,2);
 m.setEnabled(false);await m.tick();assert.equal(calls,3);
});
test('same-candle notices are deduplicated; new candles may notify and never invent triggers',()=>{
 let t=now;const m=createAdviceMonitor({clock:()=>t,scan:async()=>[]});
 m.observe(record());m.observe(record());assert.deepEqual(m.view().alerts.map(a=>a.kind),['plan','pullback']);
 const r=record();t+=H;r.checkedAt+=H;r.snapshotUntil+=H;r.row.analysis.analyzedAt+=H;r.row.analysis.closedAt+=H;r.row.analysis.validUntil+=H;
 for(const k of ['barOpen','requestedAt','receivedAt'])r.marketSnapshot[k]+=H;
 const p=r.row.analysis.strategies[0];p.signalAt+=H;p.expiresAt+=H;p.observations.closedAt+=H;
 m.observe(r);assert.equal(m.view().alerts.length,4);assert.ok(m.view().alerts.every(a=>a.kind!=='triggered'));
});
test('trigger notices require new recorded forward events and reject restored or failed views',()=>{
 let t=now;const m=createAdviceMonitor({clock:()=>t,scan:async()=>[]});
 const row={id:'sample',symbol:'UNIUSDT',createdAt:now,plan:{key:'structured'},events:[{type:'TRIGGERED',at:now},{type:'GAP',at:now+1}]};
 for(const view of [{enabled:false},{enabled:true,error:'broken'},{enabled:true,dataError:'broken'}])m.forward({...view,book:{rows:[row]}});
 assert.equal(m.view().alerts.length,0);
 m.forward({enabled:true,book:{rows:[{...row,createdAt:now-1}]}});assert.equal(m.view().alerts.length,0);
 m.forward({enabled:true,book:{rows:[row]}});assert.equal(m.view().alerts.length,1);
 t++;m.forward({enabled:true,book:{rows:[row]}});m.forward({enabled:true,book:{rows:[row]}});
 assert.deepEqual(m.view().alerts.map(a=>a.kind),['invalid','triggered']);
 assert.doesNotMatch(JSON.stringify(m.view().alerts),/"entry"|"stop"|"tp1"|"fills"/);
});
test('failed scan is explicit, retries are bounded and next-hour checks are scheduled',async()=>{
 let t=2401*H-2000,calls=0;
 const m=createAdviceMonitor({clock:()=>t,scan:async()=>{calls++;throw Error('資料源尚未回應');}});
 await m.tick();assert.equal(m.view().error,'資料源尚未回應');assert.equal(m.view().nextAt,2401*H+1500);
 await m.tick();assert.equal(calls,1);t=2401*H+1500;await m.tick();assert.equal(calls,2);
});
test('alert history exposes no stale price and preserves current-gate wording',()=>{
 const m=createAdviceMonitor({clock:()=>now,scan:async()=>[]});m.observe(record());
 const state={adviceMonitor:m.view(),agents:{tradePlans:{UNIUSDT:record()}},forward:{enabled:false}};
 let html=adviceMonitorView(state,now);assert.match(html,/沒有離線推播/);assert.match(html,/目前仍有有效計畫/);
 html=adviceMonitorView(state,now+60000);assert.doesNotMatch(html,/目前仍有有效計畫|decision-levels/);assert.match(html,/發生紀錄/);
});
