import test from 'node:test';
import assert from 'node:assert/strict';
import { familyPlan } from '../src/strategy_families.js';
const H=3600000;
const rows=()=>Array.from({length:220},(_,i)=>[i*H,100,101,99,100,100,(i+1)*H-1]);
test('breakout requires a closed channel break and volume expansion, with symmetric stops',()=>{
 const a=rows(); a[219]=[219*H,100,104,99,103,160,220*H-1];
 const p=familyPlan(a,'breakout',220*H);assert.equal(p.status,'SETUP');assert.equal(p.side,'LONG');assert.ok(p.stop<p.entry&&p.tp1>p.entry);
 a[219][5]=100;assert.equal(familyPlan(a,'breakout',220*H).status,'WAIT');
 a[219]=[219*H,100,101,96,97,160,220*H-1];assert.equal(familyPlan(a,'breakout',220*H).side,'SHORT');
});
test('mean reversion requires return inside a frozen prior band, and targets stay ahead of entry',()=>{
 const a=rows();for(let i=0;i<a.length;i++){let c=100+(i%2?3:-3);a[i]=[i*H,c,c+.3,c-.3,c,100,(i+1)*H-1];}
 a[218]=[218*H,94,94.2,93.5,93.7,100,219*H-1];a[219]=[219*H,93.7,94.7,93.5,94.5,100,220*H-1];
 const p=familyPlan(a,'meanReversion',220*H);assert.equal(p.status,'SETUP');assert.equal(p.side,'LONG');assert.ok(p.stop<p.entry&&p.tp1>p.entry&&p.tp2>p.tp1);
 a[219][4]=93.8;assert.equal(familyPlan(a,'meanReversion',220*H).status,'WAIT');
});
test('missing, noncontiguous, unfinished or invalid volume data fail closed',()=>{
 const a=rows();assert.equal(familyPlan(a.slice(0,10),'breakout',220*H).status,'BLOCKED');
 a[30][0]+=1;assert.equal(familyPlan(a,'breakout',220*H).status,'BLOCKED');
 const b=rows();b[30][5]=null;assert.equal(familyPlan(b,'breakout',220*H).status,'BLOCKED');
 assert.equal(familyPlan(rows(),'breakout',220*H-1).status,'BLOCKED');
 assert.throws(()=>familyPlan(rows(),'unknown',220*H));
});
import { comparePlans } from '../src/pullback_replay.js';
import { saveComparisonRun, loadComparisonHistory } from '../src/comparison_history.js';
import { strategyFamilyPanel, familyAssessment } from '../src/strategy_family_view.js';
test('family comparisons reconcile cash and preserve development against future changes',()=>{
 const hourly=Array.from({length:2800},(_,i)=>{const c=100+i*.02+Math.sin(i/8)*3;return [i*H,c-.3,c+1,c-1,c,i%24===0?200:100,(i+1)*H-1];});
 const fourHourly=[];for(let i=0;i<hourly.length;i+=4){const a=hourly.slice(i,i+4);fourHourly.push([a[0][0],a[0][1],Math.max(...a.map(r=>r[2])),Math.min(...a.map(r=>r[3])),a.at(-1)[4],400,a.at(-1)[6]]);}
 const input={hourly,fourHourly,start:2400*H,end:2800*H};const r={symbol:'UNIUSDT',...comparePlans(input)};
 assert.equal(r.families.rows.length,4);
 for(const row of r.families.rows)for(const key of ['development','holdout','stress']){
  const m=row[key],d=m.diagnostics;
  assert.ok(Math.abs(m.ledger.reduce((s,t)=>s+t.pnl,0)-m.netPnl)<1e-8);
  assert.equal(m.signals,m.skipped+d.noEntry+m.trades);
  assert.ok(m.ledger.every(t=>t.entryTime>=(key==='development'?r.start:r.split)&&t.exitTime<(key==='development'?r.split:r.end)));
 }
 let raw;const storage={getItem:()=>raw||null,setItem:(k,v)=>{raw=v;}};
 saveComparisonRun({id:'families',startedAt:'2026-09-23T12:00:00Z',updatedAt:'2026-09-23T12:01:00Z',status:'DONE',rows:[{symbol:'UNIUSDT',status:'DONE',result:r}]},storage);
 const loaded=loadComparisonHistory(storage);assert.equal(loaded.error,null);
 assert.deepEqual(loaded.runs[0].rows[0].result.families.rows.map(x=>x.holdout.netPnl),r.families.rows.map(x=>x.holdout.netPnl));
 assert.equal(loaded.runs[0].rows[0].result.families.rows[0].holdout.ledger,undefined);
 assert.match(strategyFamilyPanel(r),/均值回歸/);assert.match(strategyFamilyPanel({}),/不回填/);
 for(const row of hourly)if(row[0]>=r.split)for(const k of [1,2,3,4])row[k]*=2;
 for(const row of fourHourly)if(row[0]>=r.split)for(const k of [1,2,3,4])row[k]*=2;
 const changed=comparePlans(input);
 assert.deepEqual(changed.families.rows.map(x=>x.development),r.families.rows.map(x=>x.development));
});
test('mean reversion is symmetric for shorts',()=>{
 const a=rows();for(let i=0;i<a.length;i++){let c=100+(i%2?3:-3);a[i]=[i*H,c,c+.3,c-.3,c,100,(i+1)*H-1];}
 a[218]=[218*H,94,94.2,93.5,93.7,100,219*H-1];a[219]=[219*H,93.7,94.7,93.5,94.5,100,220*H-1];
 const mirrored=a.map(r=>[r[0],200-r[1],200-r[3],200-r[2],200-r[4],r[5],r[6]]);
 const p=familyPlan(mirrored,'meanReversion',220*H);assert.equal(p.status,'SETUP');assert.equal(p.side,'SHORT');assert.ok(p.stop>p.entry&&p.tp2<p.tp1&&p.tp1<p.entry);
});

test('family assessment does not label incomplete performance as ready for validation',()=>{
 assert.equal(familyAssessment({holdout:{trades:30},stress:{}}),'資料不足');
 assert.equal(familyAssessment({holdout:{trades:10,netPnl:20},stress:{netPnl:10}}),'樣本不足');
 assert.equal(familyAssessment({holdout:{trades:30,netPnl:20},stress:{netPnl:-1}}),'成本壓力未通過');
});
