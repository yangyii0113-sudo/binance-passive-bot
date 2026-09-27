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
 assert.doesNotMatch(pullbackPanel({pullback:{rows:[]}}),/data-pullback-(?:batch|compare)/);
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

test('comparison history survives reload, caps runs and stores summaries without trade ledgers',async()=>{
 const {saveComparisonRun,loadComparisonHistory,restoreComparisonRun}=await import('../src/comparison_history.js');
 const data=new Map();const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 const result={symbol:'UNIUSDT',...comparePlans(researchFixture())};
 const make=(id)=>({id,startedAt:'2026-09-23T08:00:00Z',updatedAt:'2026-09-23T08:01:00Z',status:'DONE',rows:[{symbol:'UNIUSDT',status:'DONE',result}]});
 for(let i=0;i<22;i++)saveComparisonRun(make(String(i)),storage);
 const history=loadComparisonHistory(storage);assert.equal(history.error,null);assert.equal(history.runs.length,20);assert.equal(history.runs[0].id,'21');
 assert.equal(history.runs[0].rows[0].result.holdout.baseline.netPnl,result.holdout.baseline.netPnl);
 assert.equal(history.runs[0].rows[0].result.holdout.baseline.ledger,undefined);
 saveComparisonRun({...make('21'),status:'RUNNING',rows:[{symbol:'UNIUSDT',status:'DONE',result},{symbol:'SOLUSDT',status:'RUNNING'}]},storage);
 const restored=restoreComparisonRun(loadComparisonHistory(storage).runs[0]);
 assert.equal(restored.status,'INTERRUPTED');assert.equal(restored.rows[0].status,'DONE');assert.equal(restored.rows[1].status,'CANCELLED');assert.equal(restored.rows[1].result,undefined);
 assert.equal(loadComparisonHistory(storage).runs.length,20);
});
test('storage failure and corrupt history never claim a successful save or overwrite existing data',async()=>{
 const {loadComparisonHistory,saveComparisonRun}=await import('../src/comparison_history.js');
 let writes=0;const corrupt={getItem:()=>'{bad',setItem:()=>writes++};
 assert.ok(loadComparisonHistory(corrupt).error);assert.throws(()=>saveComparisonRun({},corrupt));assert.equal(writes,0);
 const blocked={getItem:()=>null,setItem:()=>{throw new Error('quota');}};
 const run={id:'run',startedAt:'2026-09-23T08:00:00Z',updatedAt:'2026-09-23T08:01:00Z',status:'RUNNING',rows:[{symbol:'UNIUSDT',status:'PENDING'}]};
 assert.throws(()=>saveComparisonRun(run,blocked),/尚未保存/);
 assert.throws(()=>saveComparisonRun({...run,rows:[{symbol:'UNIUSDT',status:'DONE',result:{}}]},blocked),/格式不完整/);
});
test('restored batch history is visibly dated and cannot masquerade as current market data',async()=>{
 const {batchComparisonPanel}=await import('../src/comparison_batch_view.js');
 const html=batchComparisonPanel({batchHistorical:true,batchRecord:{startedAt:'2026-09-23T08:00:00Z',status:'INTERRUPTED'},batchRows:[{symbol:'UNIUSDT',status:'CANCELLED'}]});
 assert.match(html,/歷史比較（唯讀，非目前行情）/);assert.match(html,/2026/);assert.match(html,/不會自動續跑/);assert.doesNotMatch(html,/已保存至此瀏覽器/);
});

test('diagnostic funnel reconciles without double counting intermediate signal totals',()=>{
 const r=comparePlans(researchFixture());
 for(const section of [r.development,r.holdout])for(const m of Object.values(section)){
  const d=m.diagnostics;
  assert.equal(d.evaluated,d.dataBlocked+d.trendWait+d.pullbackWait+d.extendedWait+d.riskBlocked+m.skipped+d.noEntry+m.trades);
  assert.equal(m.signals,m.skipped+d.noEntry+m.trades);
  assert.equal(d.noEntry,d.entryGap+d.stopGap+d.noBreakout+d.missingFuture);
  assert.ok(Object.values(d).every(x=>Number.isInteger(x)&&x>=0));
 }
 assert.ok(r.development.baseline.diagnostics.evaluated>0);
});
test('unfilled trade diagnostics preserve entry cancellation behavior',()=>{
 assert.equal(replayTrade(p,[]).reason,'missingFuture');
 assert.equal(replayTrade(p,[[0,101,103,99,102]]).reason,'entryGap');
 assert.equal(replayTrade(p,[[0,94,103,93,99]]).reason,'stopGap');
 assert.equal(replayTrade(p,[[0,98,99,97,98]]).reason,'noBreakout');
 for(const bars of [[],[[0,101,103,99,102]],[[0,94,103,93,99]],[[0,98,99,97,98]]])assert.equal(replayTrade(p,bars).filled,false);
});
test('history retains new diagnostics but labels old snapshots unavailable rather than zero',async()=>{
 const {saveComparisonRun,loadComparisonHistory}=await import('../src/comparison_history.js');
 const {comparisonDiagnostics}=await import('../src/comparison_diagnostics.js');
 let raw=null;const storage={getItem:()=>raw,setItem:(k,v)=>{raw=v;}};
 const result={symbol:'UNIUSDT',...comparePlans(researchFixture())};
 saveComparisonRun({id:'diagnosis',startedAt:'2026-09-23T08:00:00Z',updatedAt:'2026-09-23T08:01:00Z',status:'DONE',rows:[{symbol:'UNIUSDT',status:'DONE',result}]},storage);
 assert.deepEqual(loadComparisonHistory(storage).runs[0].rows[0].result.holdout.enhanced.diagnostics,result.holdout.enhanced.diagnostics);
 for(const section of [result.development,result.holdout])for(const m of Object.values(section))delete m.diagnostics;
 assert.match(comparisonDiagnostics(result),/此筆歷史未記錄診斷/);
 assert.doesNotMatch(comparisonDiagnostics(result),/實際評估時點/);
});

import { researchRiskScenario, researchRiskView } from '../src/research_risk_view.js';
test('research risk scenarios reconcile long and short net fills and cap illustrative exposure',()=>{
 for(const plan of [p,{...p,side:'SHORT',stop:105,tp1:95,tp2:90}]){
  const before=structuredClone(plan),r=researchRiskScenario(plan),sign=plan.side==='LONG'?1:-1;
  const fill=plan.entry*(1+sign*.0002),exit=plan.stop*(1-sign*.0002);
  const expectedLoss=-(sign*(exit-fill)-.0005*(fill+exit))*r.quantity;
  assert.ok(Math.abs(expectedLoss-r.stopLoss)<1e-10);
  assert.ok(r.stopLoss<=2.5+1e-10);assert.ok(r.notional<=1000+1e-10);
  assert.ok(r.stressStopLoss>r.stopLoss);assert.ok(r.stressTargetPnl<r.targetPnl);
  assert.ok(r.netRewardRisk<1.5);assert.deepEqual(plan,before);
 }
 const tight=researchRiskScenario({...p,stop:99.999,tp1:100.01,tp2:100.02});
 assert.ok(tight.notional<=1000);assert.ok(tight.netRewardRisk<1);
 assert.equal(researchRiskScenario({...p,side:'UNKNOWN'}),null);
 assert.equal(researchRiskScenario({...p,stop:101}),null);
 assert.equal(researchRiskScenario({...p,tp1:99}),null);
 assert.equal(researchRiskScenario({...p,entry:NaN}),null);
 assert.match(researchRiskView(p),/非你的帳戶淨值或可下單額度/);
 assert.match(researchRiskView(p),/並非最大可能損失/);
});
