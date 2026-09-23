import test from 'node:test';
import assert from 'node:assert/strict';
import { refineTargets } from '../src/target_analysis.js';
import { replayTrade } from '../src/pullback_replay.js';
const p={status:'SETUP',side:'LONG',entry:100,stop:95,tp1:105,tp2:110};
const bars=Array.from({length:12},(_,i)=>[i,100,102,98,100]);
test('confirmed overhead structure caps targets and rejects inadequate net reward',()=>{
 const a=structuredClone(bars);a[5][2]=107;
 const r=refineTargets(p,a,1);
 assert.equal(r.tp1,105);assert.equal(r.tp2,106.9);assert.equal(r.targetAnalysis.accepted,true);
 a[5][2]=102; a[4][2]=101;a[6][2]=101;a[3][2]=101;a[7][2]=101;
 const blocked=refineTargets(p,a,1);assert.equal(blocked.targetAnalysis.accepted,false);
});
test('unconfirmed last-bar pivot never caps targets; costs lower reward',()=>{
 const a=structuredClone(bars);a.at(-1)[2]=106;
 const r=refineTargets(p,a,1);assert.equal(r.tp2,110);assert.ok(r.targetAnalysis.netRewardRisk<1.5);
});
test('short structure, invalid stops and missing input are handled symmetrically',()=>{
 const a=structuredClone(bars);a[5][3]=93;
 const r=refineTargets({...p,side:'SHORT',stop:105,tp1:95,tp2:90},a,1);
 assert.equal(r.tp2,93.1);assert.equal(r.targetAnalysis.accepted,true);
 assert.throws(()=>refineTargets({...p,stop:101},a,1));
 assert.throws(()=>refineTargets(p,a,null));
});
const row=(open,high,low,close)=>[0,open,high,low,close,1,3599999];
test('ambiguous entry bars assume entry then loss; subsequent ambiguous exits use stop first',()=>{
 assert.equal(replayTrade(p,[row(99,106,94,101)],{fee:0,slippage:0}).returnPerUnit,-5);
 const r=replayTrade(p,[row(99,101,98,100),row(100,111,94,102)],{fee:0,slippage:0});
 assert.equal(r.returnPerUnit,-5);assert.equal(r.reason,'STOP');
});
test('partial profits and costs use exit notionals, not a fixed percentage shortcut',()=>{
 const r=replayTrade(p,[row(99,101,98,100),row(100,111,99,110)],{fee:.001,slippage:0});
 assert.ok(Math.abs(r.returnPerUnit-7.2925)<1e-9);assert.equal(r.reason,'TP2');
});
test('protection activates on next bar and shorts have linear PnL',()=>{
 const r=replayTrade(p,[row(99,101,98,100),row(100,106,99,105),row(104,104,99,100)],{fee:0,slippage:0,protect:true});
 assert.equal(r.returnPerUnit,2.5);assert.equal(r.reason,'STOP');
 const s=replayTrade({...p,side:'SHORT',stop:105,tp1:95,tp2:90},[row(101,102,99,100),row(100,101,89,90)],{fee:0,slippage:0});
 assert.equal(s.returnPerUnit,7.5);
});

import { comparePlans } from '../src/pullback_replay.js';
function researchFixture(){
 const H=3600000;
 const hourly=Array.from({length:2800},(_,i)=>{const c=100+i*.02+Math.sin(i/8)*3;return [i*H,c-.3,c+1,c-1,c,100,(i+1)*H-1];});
 const fourHourly=[];for(let i=0;i<hourly.length;i+=4){const a=hourly.slice(i,i+4);fourHourly.push([a[0][0],a[0][1],Math.max(...a.map(r=>r[2])),Math.min(...a.map(r=>r[3])),a.at(-1)[4],400,a.at(-1)[6]]);}
 return {hourly,fourHourly,start:2400*H,end:2800*H};
}
test('comparison ledgers reconcile to money and later holdout candles cannot alter development results',()=>{
 const a=researchFixture(), r=comparePlans(a);
 assert.ok(r.development.baseline.trades>0);
 for(const section of [r.development,r.holdout])for(const metrics of Object.values(section)){
   assert.ok(Math.abs(metrics.ledger.reduce((sum,t)=>sum+t.pnl,0)-metrics.netPnl)<1e-8);
   assert.ok(metrics.ledger.every(t=>t.qty*t.entry<=1001));
 }
 for(const row of a.hourly)if(row[0]>=r.split)for(const k of [1,2,3,4])row[k]*=2;
 for(const row of a.fourHourly)if(row[0]>=r.split)for(const k of [1,2,3,4])row[k]*=2;
 assert.deepEqual(comparePlans(a).development,r.development);
});
