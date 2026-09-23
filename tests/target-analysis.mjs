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

test('exit comparison accepts selected altcoins and Unicode contracts while rejecting non-crypto',async()=>{
 const {runPullbackComparison}=await import('../src/pullback_replay.js');
 for(const symbol of ['SOLUSDT','UNIUSDT','龙虾USDT']){
  const urls=[];
  const fetcher=async url=>{urls.push(url);return {ok:true,json:async()=>url.endsWith('exchangeInfo')?{symbols:[{symbol,status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',underlyingType:'COIN'}]}:[]};};
  await assert.rejects(runPullbackComparison(symbol,{fetcher}),/歷史資料不完整/);
  assert.ok(urls.some(url=>url.includes(`symbol=${encodeURIComponent(symbol)}`)));
 }
 await assert.rejects(runPullbackComparison('SOLUSDT',{fetcher:async()=>({ok:true,json:async()=>({symbols:[]})})}),/不是可交易/);
 await assert.rejects(runPullbackComparison('SOLUSDT&invalid=1'),/有效/);
});

test('comparison UI offers every scanned symbol and clears the fixed BTC ETH pair',async()=>{
 const {pullbackPanel}=await import('../src/entry_plan.js');
 const html=pullbackPanel({pullback:{rows:[{symbol:'UNIUSDT',status:'WAIT'},{symbol:'龙虾USDT',status:'BLOCKED'}]}});
 assert.match(html,/data-pullback-compare="UNIUSDT"/);
 assert.match(html,/data-pullback-compare="龙虾USDT"/);
 assert.doesNotMatch(html,/data-pullback-compare="(?:BTC|ETH)USDT"/);
 assert.match(pullbackPanel({pullback:{rows:[]}}),/產生可比較清單/);
});

test('batch comparisons share a cutoff, run sequentially and isolate failed symbols',async()=>{
 const {runComparisonBatch}=await import('../src/comparison_batch.js');
 let active=0,peak=0;const calls=[],updates=[];
 const result=await runComparisonBatch(['UNIUSDT','SOLUSDT','龙虾USDT'],{now:20000000,onUpdate:rows=>updates.push(rows),compare:async(symbol,{end})=>{
  calls.push({symbol,end});active++;peak=Math.max(peak,active);await Promise.resolve();active--;
  if(symbol==='SOLUSDT')throw new Error('歷史資料不完整');return {symbol,end};
 }});
 assert.equal(peak,1);assert.deepEqual(result.map(x=>x.status),['DONE','ERROR','DONE']);assert.equal(new Set(calls.map(x=>x.end)).size,1);
 assert.deepEqual(updates[0].map(x=>x.status),['PENDING','PENDING','PENDING']);
 assert.equal(result[1].result,undefined);assert.match(result[1].error,/歷史/);
 await assert.rejects(runComparisonBatch(['UNIUSDT','UNIUSDT']),/清單無效/);
 await assert.rejects(runComparisonBatch(Array(11).fill('UNIUSDT')),/清單無效/);
});
test('batch stop preserves completed results and prevents later requests',async()=>{
 const {runComparisonBatch}=await import('../src/comparison_batch.js');let stop=false,calls=0;
 const rows=await runComparisonBatch(['UNIUSDT','SOLUSDT','BTCUSDT'],{shouldStop:()=>stop,compare:async(symbol,{end})=>{calls++;stop=true;return {symbol,end};}});
 assert.equal(calls,1);assert.deepEqual(rows.map(x=>x.status),['DONE','CANCELLED','CANCELLED']);
 assert.ok(rows[0].result);assert.equal(rows[1].result,undefined);
});
test('batch overview distinguishes missing evidence from real zero results and never upgrades strategies',async()=>{
 const {comparisonAssessment,batchComparisonPanel}=await import('../src/comparison_batch_view.js');
 const result={holdout:{baseline:{trades:30,netPnl:10},enhanced:{trades:0,netPnl:0,winRate:null},stress:{trades:0,netPnl:0}}};
 assert.equal(comparisonAssessment(result),'樣本不足');
 const html=batchComparisonPanel({rows:[{symbol:'UNIUSDT'},{symbol:'SOLUSDT'}],batchRows:[{symbol:'UNIUSDT',status:'DONE',result},{symbol:'SOLUSDT',status:'ERROR',error:'缺資料<script>'}]});
 assert.match(html,/樣本不足/);assert.match(html,/0\.00/);assert.match(html,/缺資料&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 result.holdout.enhanced={trades:30,netPnl:20};result.holdout.stress={trades:30,netPnl:-1};assert.equal(comparisonAssessment(result),'成本壓力未通過');
 result.holdout.stress.netPnl=5;assert.equal(comparisonAssessment(result),'僅供後續驗證');
});
