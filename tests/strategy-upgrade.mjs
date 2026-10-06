import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCoin } from '../src/coin_analysis.js';
import { pullbackPlan } from '../src/trend_pullback.js';
import * as candidates from '../src/strong_candidates.js';
import * as replay from '../src/pullback_replay.js';
const H=3600000, now=2400*H+120000;
const bars=(n,step=1)=>Array.from({length:n},(_,i)=>{const c=100;return [(2400-n*step+i*step)*H,c,c+1,c-1,c,100,(2400-n*step+(i+1)*step)*H-1];});
test('short four-hour history blocks structured only and retains a valid hourly breakout',()=>{
 const hourly=bars(220),fourHourly=bars(55,4);hourly.at(-1)[2]=103;hourly.at(-1)[4]=102;hourly.at(-1)[5]=200;
 const input={hourly,fourHourly,now},a=analyzeCoin({...input,pullback:pullbackPlan(input)});
 assert.equal(a.status,'VALID');assert.equal(a.strategies[0].status,'BLOCKED');assert.equal(a.strategies[1].status,'SETUP');assert.equal(a.fourHourlyDirection,'UNKNOWN');
 assert.equal(a.hunt.stage,'BREAKOUT');assert.equal(a.hunt.closedAt,2400*H-1);assert.equal(a.hunt.entry,undefined);
 hourly[40][5]=null;assert.equal(analyzeCoin({...input,pullback:pullbackPlan(input)}).status,'BLOCKED');
});
test('research selection reserves liquid flat candidates without admitting illiquid, overextended or non-contract symbols',()=>{
 const rows=Array.from({length:12},(_,i)=>['',`UP${i}USDT`,100,5,20000000,90-i]);
 rows.push(['','FLATUSDT',100,0,30000000,30],['','EARLYUSDT',100,-2,40000000,20],['','BADUSDT',100,-5,50000000,100],['','SPIKEUSDT',100,30,50000000,100],['','THINUSDT',100,0,100,100]);
 const eligible=new Set(rows.map(r=>r[1]).filter(s=>s!=='UP0USDT'));
 const selected=candidates.rankResearchRows(rows,eligible);
 assert.equal(selected.length,10);assert.ok(selected.some(r=>r.symbol==='FLATUSDT'));assert.ok(selected.some(r=>r.symbol==='EARLYUSDT'));
 assert.ok(selected.every(r=>!['SPIKEUSDT','THINUSDT','UP0USDT'].includes(r.symbol)));assert.equal(new Set(selected.map(r=>r.symbol)).size,10);
});
test('retest study waits for a closed reclaim then triggers on a later bar in both directions',()=>{
 for(const side of ['LONG','SHORT']){
  const long=side==='LONG',p={side,entry:long?105:95,stop:long?95:105,tp1:long?120:80,tp2:long?140:60,atr:2,observations:{upper:100,lower:100}};
  const b=(i,o,h,l,c)=>[i*H,o,h,l,c,100,(i+1)*H-1];
  const future=long?[b(1,101,106,99,103),b(2,103,108,102,107),b(3,107,121,106,120)]:[b(1,99,101,94,97),b(2,97,98,92,93),b(3,93,94,79,80)];
  const r=replay.replayRetestTrade(p,future);assert.equal(r.filled,true);assert.equal(r.waitBars,1);assert.equal(r.entryIndex,1);
  assert.ok(long?r.plan.entry>106:r.plan.entry<94);
  const canceled=structuredClone(future);canceled[0][long?3:2]=p.stop;assert.equal(replay.replayRetestTrade(p,canceled).filled,false);
  assert.equal(replay.replayRetestTrade(p,future.slice(0,1)).filled,false);
 }
});
test('temporal validation separates three periods and persists no positions between them',()=>{
 const result=replay.comparePlans({hourly:bars(500),fourHourly:bars(500,4),start:2100*H,end:2400*H});
 const v=result.validation;assert.equal(v.version,'temporal-v1');assert.equal(v.folds.length,3);
 assert.equal(v.folds[0].start,result.split);assert.equal(v.folds[2].end,result.end);
 for(let i=0;i<3;i++){const f=v.folds[i];if(i)assert.equal(f.start,v.folds[i-1].end);assert.equal(f.rows.length,4);for(const row of f.rows)for(const t of row.metrics.ledger)assert.ok(t.entryTime>=f.start&&t.exitTime<f.end);}
 assert.equal(result.entryStudy.version,'breakout-retest-v1');assert.equal(result.entryStudy.retest.trades,0);
});
import { agentPlanStatus } from '../src/agent_trade_plan.js';
import { huntView } from '../src/hunt_analysis.js';
import { researchExtension } from '../src/research_validation.js';
import { saveComparisonRun,loadComparisonHistory } from '../src/comparison_history.js';
test('partial strategy availability still requires fresh market Gate, and hides every level on conflict or expiry',()=>{
 const hourly=bars(220),fourHourly=bars(55,4);hourly.at(-1)[2]=103;hourly.at(-1)[4]=102;hourly.at(-1)[5]=200;
 const input={hourly,fourHourly,now},analysis=analyzeCoin({...input,pullback:pullbackPlan(input)});
 const record={symbol:'SOLUSDT',status:'LIVE',checkedAt:now,snapshotUntil:now+60000,marketSnapshot:{price:102,high:102.1,low:101.9,barOpen:2400*H,requestedAt:now,receivedAt:now},row:{symbol:'SOLUSDT',analysis}};
 assert.equal(agentPlanStatus(record,now).key,'plan');assert.equal(agentPlanStatus(record,now+60000).plans.length,0);
 record.row.analysis.strategies[0]={...analysis.strategies[1],key:'structured',side:'SHORT'};assert.equal(agentPlanStatus(record,now).key,'conflict');assert.equal(agentPlanStatus(record,now).plans.length,0);
 delete record.marketSnapshot;record.row.analysis.strategies[0]={key:'structured',status:'BLOCKED'};assert.equal(agentPlanStatus(record,now).key,'blocked');
});
test('closed research differentiates compression, confirmed breakout and extension without creating prices',()=>{
 const hourly=bars(220),input={hourly,fourHourly:bars(500,4),now};
 for(const r of hourly.slice(-5)){r[2]=100.2;r[3]=99.8;}
 let a=analyzeCoin({...input,pullback:pullbackPlan(input)});assert.equal(a.hunt.stage,'ACCUMULATION');assert.ok(Math.abs(a.hunt.compression-.2)<1e-12);assert.match(huntView(a,now),/蓄勢觀察/);assert.equal(huntView(a,a.validUntil),'');
 hourly.at(-1)[2]=111;hourly.at(-1)[4]=110;hourly.at(-1)[5]=200;a=analyzeCoin({...input,pullback:pullbackPlan(input)});assert.equal(a.hunt.stage,'EXTENDED');assert.match(huntView(a,now),/追高／追空風險/);assert.equal(a.hunt.entry,undefined);
 const past=structuredClone(a);hourly.push([2400*H,1,999,1,999,9999,2401*H-1]);assert.deepEqual(analyzeCoin({...input,pullback:pullbackPlan(input)}),past);
});
test('comparison history retains validated folds and retest study while rejecting corrupt spans and leaving old results unfilled',()=>{
 const r={symbol:'SOLUSDT',...replay.comparePlans({hourly:bars(500),fourHourly:bars(500,4),start:2100*H,end:2400*H})};
 let raw;const storage={getItem:()=>raw||null,setItem:(k,v)=>raw=v};
 const run={id:'research-upgrade',startedAt:'2026-10-05T00:00:00Z',updatedAt:'2026-10-05T00:01:00Z',status:'DONE',rows:[{symbol:'SOLUSDT',status:'DONE',result:r}]};
 saveComparisonRun(run,storage);const loaded=loadComparisonHistory(storage);assert.equal(loaded.error,null);
 const saved=loaded.runs[0].rows[0].result;assert.deepEqual(saved.entryStudy,researchExtension(r).entryStudy);assert.equal(saved.validation.folds[0].rows[0].metrics.ledger,undefined);
 r.validation.folds[1].start+=H;assert.throws(()=>saveComparisonRun(run,storage),/分期/);assert.equal(loadComparisonHistory(storage).error,null);
 delete r.validation;delete r.entryStudy;assert.equal(researchExtension(r),null);
});
test('four-hour request failure does not discard complete hourly analysis or make extra requests',async()=>{
 const {scanPullbacks}=await import('../src/trend_pullback.js');
 const end=Math.floor(Date.now()/H)*H;const hourly=bars(220).map(r=>[r[0]-2400*H+end,...r.slice(1,6),r[6]-2400*H+end]);hourly.at(-1)[2]=103;hourly.at(-1)[4]=102;hourly.at(-1)[5]=200;
 let calls=0;const [row]=await scanPullbacks([{symbol:'SOLUSDT'}],{fetcher:async url=>{calls++;if(url.includes('interval=4h'))throw new Error('4h unavailable');return {ok:true,json:async()=>hourly};}});
 assert.equal(calls,2);assert.equal(row.analysis?.status,'VALID');assert.equal(row.analysis.strategies[0].status,'BLOCKED');assert.equal(row.analysis.strategies[1].status,'SETUP');
});
import { agentDecisionCard } from '../src/agent_decision_view.js';
test('a passing independent plan keeps partial-data warnings outside disclosures',()=>{
 const hourly=bars(220),fourHourly=bars(55,4);hourly.at(-1)[2]=103;hourly.at(-1)[4]=102;hourly.at(-1)[5]=200;
 const input={hourly,fourHourly,now},analysis=analyzeCoin({...input,pullback:pullbackPlan(input)}),record={symbol:'SOLUSDT',status:'LIVE',checkedAt:now,snapshotUntil:now+60000,marketSnapshot:{price:102,high:102.1,low:101.9,barOpen:2400*H,requestedAt:now,receivedAt:now},row:{symbol:'SOLUSDT',analysis}};
 const html=agentDecisionCard(record,{now});assert.match(html.slice(0,html.indexOf('<details')),/部分策略缺資料/);
});

test('research scan reserves declining liquidity candidates without dictating trade direction',()=>{
 const rows=[...Array.from({length:12},(_,i)=>['',`UP${i}USDT`,100,5,20000000,90-i]),...Array.from({length:8},(_,i)=>['',`DOWN${i}USDT`,100,-6-i,20000000,90-i]),['','FLATUSDT',100,0,30000000,40],['','CRASHUSDT',100,-30,1e8,100],['','THINUSDT',100,-10,1,100]];
 const out=candidates.rankResearchRows(rows);
 assert.equal(out.length,10);assert.equal(out.filter(r=>r.pool==='declining').length,3);assert.ok(out.some(r=>r.symbol==='FLATUSDT'));
 assert.equal(new Set(out.map(r=>r.symbol)).size,10);assert.ok(out.every(r=>!['CRASHUSDT','THINUSDT'].includes(r.symbol)));assert.ok(out.every(r=>r.side===undefined));
 const eligible=new Set(['DOWN0USDT']);assert.deepEqual(candidates.rankResearchRows(rows,eligible).map(r=>r.symbol),['DOWN0USDT']);
});
