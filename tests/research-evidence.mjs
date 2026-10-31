import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceSnapshot, evidenceModel, loadEvidenceHistory, saveEvidenceSnapshot } from '../src/research_evidence.js';
import { researchEvidenceView } from '../src/research_evidence_view.js';
import { agentDecisionCard } from '../src/agent_decision_view.js';
import { agentTradePlanView } from '../src/agent_trade_plan_view.js';
import { horizonPanel } from '../src/horizon_view.js';
import { HORIZONS, FRAME_MS, frameOpen } from '../src/horizon_strategies.js';

const H=3600000,now=Date.parse('2026-10-31T10:02:00Z');
export function record(at=now,{scope='short',side='LONG',other='LONG'}={}){
 const c=HORIZONS[scope],closedAt=frameOpen(at,c?.trigger||'1h')-1;
 const strategies=(c?['breakout','structured']:['structured','breakout','meanReversion']).map(key=>({key,status:'WAIT',reason:'等待收盤確認'}));
 if(c)return {symbol:'ETHUSDT',horizon:scope,version:'horizons-v1',status:'LIVE',source:'Binance USD-M public klines',checkedAt:at,contractVerifiedAt:at,snapshotUntil:at+60000,validUntil:closedAt+1+FRAME_MS[c.trigger],strategies,evidence:{closedAt,context:side,regime:other}};
 return {symbol:'ETHUSDT',status:'LIVE',checkedAt:at,snapshotUntil:at+60000,row:{symbol:'ETHUSDT',analysis:{version:'coin-analysis-v1',status:'VALID',analyzedAt:at,closedAt,validUntil:closedAt+1+H,hourlyDirection:side,fourHourlyDirection:other,strategies}}};
}
function storage(raw=null){return {getItem:()=>raw,setItem:(_,value)=>{raw=value;},raw:()=>raw};}

test('official provenance has exact closed-bar cutoff and distinguishes multi-frame calculations from sources',()=>{
 for(const scope of ['short','day','week','month']){
  const r=record(now,{scope}),m=evidenceModel(r,{now});
  assert.equal(m.available,true);assert.equal(m.snapshot.scope,scope);
  assert.equal(m.sourceCount,1);assert.equal(m.social,null);
  assert.equal(m.sources.length,scope==='short'?2:3);
  for(const source of m.sources){const u=new URL(source.url);assert.equal(u.origin,'https://fapi.binance.com');assert.equal(u.pathname,'/fapi/v1/klines');assert.equal(u.searchParams.get('symbol'),'ETHUSDT');assert.equal(+u.searchParams.get('endTime'),source.closedAt);assert.ok(source.closedAt<now);}
 }
});
test('opposing directions are explicit and missing/mixed data are not votes',()=>{
 assert.equal(evidenceModel(record(now,{other:'SHORT'}),{now}).conflict,true);
 const r=record(now,{side:'MIXED',other:'UNKNOWN'}),m=evidenceModel(r,{now});
 assert.equal(m.conflict,false);assert.deepEqual(m.snapshot.directions.map(d=>d.direction),['MIXED','UNKNOWN']);
 assert.ok(m.snapshot.strategies.every(p=>p.side===null&&p.status==='WAIT'));
 const h=researchEvidenceView(r,{now});assert.match(h,/方向未一致/);assert.match(h,/資料不足/);assert.match(h,/社群觀點尚未接入/);assert.doesNotMatch(h,/看多率|勝率\s*\d|0\s*位看空/);
});
test('changes compare latest earlier same-symbol same-scope evidence without cross-period borrowing',()=>{
 const a=evidenceSnapshot(record(now-2*H,{side:'SHORT',other:'SHORT'}),now-2*H);
 const b=evidenceSnapshot(record(now-H,{side:'MIXED'}),now-H);
 const wrong={...b,scope:'week'},other={...b,symbol:'BTCUSDT'},future={...b,checkedAt:now+1};
 const m=evidenceModel(record(),{now,history:{runs:[future,wrong,other,a,b]}});
 assert.equal(m.previous.checkedAt,now-H);assert.equal(m.changes.length,1);assert.equal(m.changes[0].after,'LONG');
 assert.equal(evidenceModel(record(),{now,history:{runs:[wrong,other,future]}}).previous,null);
 assert.equal(evidenceModel(record(),{now,history:{runs:[a]}}).changes[0].kind,'reversal');
 assert.equal(evidenceModel(record(),{now,history:{runs:[b],error:'損毀'}}).previous,null);
});
test('invalid, stale, future, historical and mismatched identities suppress directional evidence',()=>{
 for(const edit of [r=>r.snapshotUntil=now,r=>r.checkedAt=now+1,r=>r.historical=true,r=>r.row.symbol='BTCUSDT',r=>r.row.analysis.closedAt=now,r=>r.row.analysis.strategies=[],r=>r.horizon='invalid']){
  const r=record();edit(r);assert.equal(evidenceModel(r,{now}).available,false);
  const h=researchEvidenceView(r,{now});assert.doesNotMatch(h,/偏多|方向反轉|fapi\.binance\.com/);assert.match(h,/重新核對/);
 }
 const r=record(now,{scope:'month'});r.evidence.closedAt=now;
 assert.equal(evidenceModel(r,{now}).available,false);
});
test('history is bounded, deduplicates unchanged conclusions and contains no execution values',()=>{
 const s=storage();
 saveEvidenceSnapshot(record(),{storage:s,now});
 saveEvidenceSnapshot(record(now+1000),{storage:s,now:now+1000});
 assert.equal(loadEvidenceHistory(s).runs.length,1);
 for(let i=1;i<12;i++)saveEvidenceSnapshot(record(now+i*H,{side:i%2?'LONG':'SHORT'}),{storage:s,now:now+i*H});
 assert.equal(loadEvidenceHistory(s).runs.length,8);
 for(let i=0;i<130;i++){const r=record(now+(i+12)*H);r.symbol=`COIN${i}USDT`;r.row.symbol=r.symbol;saveEvidenceSnapshot(r,{storage:s,now:now+(i+12)*H});}
 assert.equal(loadEvidenceHistory(s).runs.length,120);
 assert.doesNotMatch(s.raw(),/"(?:entry|stop|tp1|tp2|price|quantity|fills|netPnl)":/);
 assert.ok(loadEvidenceHistory(s).runs.every(r=>r.historical===true));
});
test('history rejects malformed/future records and preserves corrupted/quota-limited storage',()=>{
 const s=storage('{bad');assert.ok(loadEvidenceHistory(s).error);
 assert.throws(()=>saveEvidenceSnapshot(record(),{storage:s,now}),/未覆寫/);assert.equal(s.raw(),'{bad');
 assert.throws(()=>saveEvidenceSnapshot(record(),{storage:{getItem:()=>null,setItem:()=>{throw Error('quota');}},now}),/未保存/);
 const bad=evidenceSnapshot(record(),now);bad.directions[0].direction='anything';
 assert.ok(loadEvidenceHistory(storage(JSON.stringify({version:1,runs:[bad]}))).error);
 const future=evidenceSnapshot(record(now+H),now+H);
 assert.equal(evidenceModel(record(),{now,history:{runs:[future]}}).previous,null);
});
test('repeated conclusions across closed bars preserve the last different viewpoint',()=>{
 const s=storage();saveEvidenceSnapshot(record(now-H,{side:'SHORT'}),{storage:s,now:now-H});
 for(let i=0;i<12;i++)saveEvidenceSnapshot(record(now+i*H),{storage:s,now:now+i*H});
 const runs=loadEvidenceHistory(s).runs;
 assert.equal(runs.length,2);assert.equal(runs[0].checkedAt,now+11*H);
 assert.equal(runs[1].directions[0].direction,'SHORT');
});
test('future persisted timestamps surface an error without discarding data, and cutoffs must align',()=>{
 const future=evidenceSnapshot(record(now+100*H),now+100*H),s=storage(JSON.stringify({version:1,runs:[future]})),raw=s.raw();
 assert.throws(()=>saveEvidenceSnapshot(record(),{storage:s,now}),/未來/);assert.equal(s.raw(),raw);
 const invalid=evidenceSnapshot(record(),now);invalid.closedAt=1;
 assert.ok(loadEvidenceHistory(storage(JSON.stringify({version:1,runs:[invalid]}))).error);
});
test('already touched horizon setups are closed-bar evidence, never described as awaiting a new trigger',()=>{
 const r=record(now,{scope:'week'}),c=HORIZONS.week;
 r.strategies[0]={...r.strategies[0],status:'SETUP',side:'LONG',entry:105,stop:95,tp1:115,tp2:125,signalAt:r.evidence.closedAt,expiresAt:r.validUntil,horizon:'week',version:'horizons-v1',intervalMs:FRAME_MS[c.trigger],maxHoldMs:c.maxHoldMs};
 r.snapshot={price:104,high:106,low:100,barOpen:frameOpen(now,c.trigger),requestedAt:now,receivedAt:now};
 const h=researchEvidenceView(r,{now});
 assert.match(h,/已觸及進場或失效價/);assert.match(h,/本次不進場/);assert.doesNotMatch(h,/待觸發/);
});
test('changed waiting reasons expose actual before and after explanations',()=>{
 const old=record(now-H),r=record();old.row.analysis.strategies[0].reason='等待觸及均線';r.row.analysis.strategies[0].reason='已觸及均線，等待同向收盤';
 const history={runs:[evidenceSnapshot(old,now-H)]},m=evidenceModel(r,{history,now});
 assert.equal(m.changes[0].beforeReason,'等待觸及均線');assert.equal(m.changes[0].afterReason,'已觸及均線，等待同向收盤');
 assert.match(researchEvidenceView(r,{history,now}),/原原因：等待觸及均線/);
});
test('all primary research surfaces include evidence, changes and escaped strategy reasons without changing records',()=>{
 const r=record();r.row.analysis.strategies[0].reason='<img src=x onerror=alert(1)>';
 const old=evidenceSnapshot(record(now-H,{side:'SHORT'}),now-H),history={runs:[old]},before=structuredClone(r);
 for(const render of [agentDecisionCard,agentTradePlanView]){
  const h=render(r,{now,history});assert.match(h,/市場觀點與證據/);assert.match(h,/方向反轉/);assert.match(h,/&lt;img/);assert.doesNotMatch(h,/<img src=x/);
 }
 for(const scope of ['day','week','month']){
  const h=horizonPanel({agents:{horizonPlans:{[`${scope}:ETHUSDT`]:record(now,{scope})},evidenceHistory:history},ui:{horizon:scope,horizonSymbol:'ETHUSDT'},market:{}},now);
  assert.match(h,/市場觀點與證據/);
 }
 assert.deepEqual(r,before);
});
