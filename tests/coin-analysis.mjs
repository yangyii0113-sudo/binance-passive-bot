import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCoin, coinCategory } from '../src/coin_analysis.js';
import { pullbackPlan } from '../src/trend_pullback.js';
import { familyPlan } from '../src/strategy_families.js';
import { strategyWaitDetail, adviceDisplayStatus } from '../src/advice_display_status.js';
import { strategyEvidenceView } from '../src/strategy_evidence_view.js';
const H=3600000, now=2400*H+120000;
function fixture(){
 const make=(n,step)=>Array.from({length:n},(_,i)=>{const c=100+i*.1;return [(2400-n*step+i*step)*H,c,c+.5,c-.5,c,100,(2400-n*step+(i+1)*step)*H-1];});
 return {hourly:make(220,1),fourHourly:make(500,4),now};
}
function run(a){return analyzeCoin({...a,pullback:pullbackPlan(a)});}
test('coin analysis uses closed candles and expresses evidence rather than win probabilities',()=>{
 const a=fixture(),r=run(a);assert.equal(r.status,'VALID');assert.equal(r.hourlyDirection,'LONG');assert.equal(r.fourHourlyDirection,'LONG');assert.equal(r.volumeRatio,1);assert.ok(r.atrPct>0);assert.equal(r.strategies.length,3);
 assert.equal(r.closedAt,2400*H-1);assert.equal(r.validUntil,2401*H);assert.equal(r.winProbability,undefined);
 a.hourly.push([2400*H,1,999,1,999,9999,2401*H-1]);a.fourHourly.push([2400*H,1,999,1,999,9999,2404*H-1]);assert.deepEqual(run(a),r);
});
test('invalid volume and stale history block all new plans without inventing metrics',()=>{
 for(const mutate of [a=>a.hourly[100][5]=null,a=>a.hourly[100][5]=-1,a=>a.now+=H]){
  const a=fixture();mutate(a);const r=run(a);assert.equal(r.status,'BLOCKED');assert.equal(r.atrPct,undefined);assert.equal(r.strategies.length,0);
 }
});
test('expired and opposing plans never enter the actionable research filter',()=>{
 const analysis={status:'VALID',validUntil:now+1000,strategies:[{key:'structured',status:'SETUP',side:'LONG'},{key:'breakout',status:'SETUP',side:'SHORT'}]};
 assert.equal(coinCategory({analysis},now),'conflict');analysis.strategies.pop();assert.equal(coinCategory({analysis},now),'plan');assert.equal(coinCategory({analysis},now+1000),'expired');
 assert.equal(coinCategory({analysis:{status:'BLOCKED'}},now),'blocked');
});
import { coinAnalysisCards } from '../src/coin_analysis_view.js';
import { entryPlan } from '../src/entry_plan.js';
test('coin cards filter independently, escape external text and hide expired or conflicting levels',()=>{
 const p={key:'meanReversion',status:'SETUP',side:'LONG',entry:100,stop:90,tp1:105,tp2:110,reason:'研究<script>'};
 const a={status:'VALID',validUntil:now+1000,strategies:[p],volumeRatio:null,closedAt:now-120000};
 const rows=[{symbol:'UNIUSDT',analysis:a},{symbol:'BADUSDT',analysis:{status:'BLOCKED',reason:'缺資料<script>',strategies:[]}}];
 let html=coinAnalysisCards({rows,analysisFilter:'plan'},now,entryPlan);
 assert.match(html,/UNIUSDT 幣種分析/);assert.doesNotMatch(html,/BADUSDT 幣種分析/);assert.match(html,/0.50 倍風險距離/);assert.match(html,/研究&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 html=coinAnalysisCards({rows},now+1000,entryPlan);assert.doesNotMatch(html,/entry-plan-primary/);assert.match(html,/已過期/);
 a.strategies.push({...p,key:'breakout',side:'SHORT'});html=coinAnalysisCards({rows},now,entryPlan);assert.match(html,/方向衝突/);assert.doesNotMatch(html,/entry-plan-primary/);
 html=coinAnalysisCards({rows,analysisFilter:'wait'},now,entryPlan);assert.match(html,/目前沒有符合此篩選/);
});
test('scanner attaches three-strategy analysis from the same two reads without extra requests',async()=>{
 const {scanPullbacks}=await import('../src/trend_pullback.js');
 const current=Math.floor(Date.now()/(4*H))*4*H;
 const endHour=Math.floor(Date.now()/H)*H;
 const make=(n,step,end)=>Array.from({length:n},(_,i)=>{const c=100+i*.1;return [end-(n-i)*step,c,c+.5,c-.5,c,100,end-(n-i-1)*step-1];});
 let calls=0;
 const rows=await scanPullbacks([{symbol:'UNIUSDT',rank:1}],{fetcher:async url=>{calls++;return {ok:true,json:async()=>url.includes('interval=1h')?make(220,H,endHour):make(500,4*H,current)};}});
 assert.equal(calls,2);assert.equal(rows[0].analysis.status,'VALID');assert.deepEqual(rows[0].analysis.strategies.map(p=>p.key),['structured','breakout','meanReversion']);
});

function evidenceRecord(){
 const analysis=run(fixture());
 return {symbol:'UNIUSDT',status:'LIVE',checkedAt:now,snapshotUntil:now+60000,row:{symbol:'UNIUSDT',analysis}};
}
test('long and short pullback evidence distinguishes touch, reclaim and body without creating setups',()=>{
 for(const short of [false,true])for(const mode of ['touch','reclaim','body']){
  const make=(n,step)=>Array.from({length:n},(_,i)=>{const c=short?1000-i:100+i;return [(2400-n*step+i*step)*H,c,c+2,c-2,c,100,(2400-n*step+(i+1)*step)*H-1];});
  const hourly=make(220,1),fourHourly=make(500,4),b=hourly.at(-1);
  b[1]=short?789:311;b[2]=short?800:321;b[3]=short?779:300;b[4]=short?788:312;
  if(mode==='touch'){if(short)b[2]=790;else b[3]=311;}
  if(mode==='reclaim')b[4]=short?795:305;
  if(mode==='body')b[1]=short?787:313;
  const p={key:'structured',...pullbackPlan({hourly,fourHourly,now})};
  assert.equal(p.status,'WAIT');assert.equal(p.entry,undefined);
  assert.equal(p.observations.side,short?'SHORT':'LONG');assert.equal(p.observations.closedAt,2400*H-1);
  assert.equal(strategyWaitDetail(p).label,({touch:'尚未觸及均線',reclaim:'觸及後未收回',body:'收盤方向未確認'})[mode]);
  assert.equal(p.observations.touched,mode!=='touch');
  assert.equal(p.observations.reclaimed,mode!=='reclaim');
  if(mode==='body')assert.equal(p.observations.bodyAligned,false);
 }
});
test('breakout annotations use the same closed bar and exact existing volume boundary',()=>{
 const a=fixture(),rows=a.hourly,b=rows.at(-1);b[4]=123;b[2]=123.5;b[5]=149;
 const wait=familyPlan(rows,'breakout',2400*H);
 assert.equal(wait.status,'WAIT');assert.equal(wait.observations.breakout,true);
 assert.equal(wait.observations.volumeRatio,1.49);assert.equal(wait.observations.volumePassed,false);
 b[5]=150;const ready=familyPlan(rows,'breakout',2400*H);
 assert.equal(ready.status,'SETUP');assert.equal(ready.observations.volumePassed,true);
 assert.equal(ready.observations.volumeRatio,1.5);assert.ok(ready.observations.netRewardRisk>=1);
});
test('mean-reversion displayed bands remain frozen before the excursion and reclaim pair',()=>{
 const a=fixture(),rows=a.hourly,first=familyPlan(rows,'meanReversion',2400*H).observations;
 for(const b of rows.slice(-2)){b[1]=100;b[2]=125;b[3]=95;b[4]=101;}
 const second=familyPlan(rows,'meanReversion',2400*H).observations;
 assert.equal(second.center,first.center);assert.equal(second.lower,first.lower);assert.equal(second.upper,first.upper);
 assert.equal(second.previousClose,101);assert.equal(second.close,101);
});
test('three-strategy views expose thresholds but waiting rows never acquire entry levels',()=>{
 const record=evidenceRecord(),before=structuredClone(record),html=strategyEvidenceView(record,{now});
 assert.equal((html.match(/class="evidence-strategy"/g)||[]).length,3);
 for(const label of ['觸及 20 期均線','收盤回到趨勢側','同向實體收盤','1.50 倍','0.50 倍','成本後目標風報','最近已收盤','不是進場價'])assert.ok(html.includes(label),label);
 assert.doesNotMatch(html,/decision-levels|data-real-order|data-paper-open/);
 const compact=strategyEvidenceView(record,{now,compact:true});
 for(const label of ['趨勢回調','區間突破','均值回歸'])assert.ok(compact.includes(label));
 assert.deepEqual(record,before);
});
test('missing or mismatched observations do not become passing checks or specific pullback claims',()=>{
 for(const mutate of [p=>delete p.observations,p=>p.observations.closedAt-=H]){
  const record=evidenceRecord();record.row.analysis.strategies.forEach(mutate);
  const html=strategyEvidenceView(record,{now});
  assert.equal((html.match(/本次沒有可核對的分項數值/g)||[]).length,3);
  assert.doesNotMatch(html,/data-check-state="pass"|尚未觸及均線/);
  assert.equal(adviceDisplayStatus(record,now).label,'回踩尚未確認');
 }
 const record=evidenceRecord();record.row.analysis.strategies[0].observations.ema20=null;
 assert.match(strategyEvidenceView(record,{now}),/本次沒有可核對的分項數值/);
});
test('expired, historical, incomplete and symbol-mismatched records hide all observation panels',()=>{
 for(const mutate of [r=>r.snapshotUntil=now,r=>r.historical=true,r=>r.row.analysis.strategies.pop(),r=>r.row.symbol='BTCUSDT']){
  const r=evidenceRecord();mutate(r);
  assert.equal(strategyEvidenceView(r,{now}),'');assert.equal(strategyEvidenceView(r,{now,compact:true}),'');
 }
});
