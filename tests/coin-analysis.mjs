import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCoin, coinCategory } from '../src/coin_analysis.js';
import { pullbackPlan } from '../src/trend_pullback.js';
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
