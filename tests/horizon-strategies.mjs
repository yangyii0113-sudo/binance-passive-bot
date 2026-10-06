import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/horizon_strategies.js').catch(()=>({}));
const H=3600000,now=Date.UTC(2026,9,6,4,2);
function bars(step,count=240,offset=0){const end=Math.floor((now-offset)/step)*step+offset;return Array.from({length:count},(_,i)=>{const o=end-(count-i)*step,p=80+i*.1;return [o,p,p+.12,p-.12,p+.04,100,o+step-1];});}
function input(horizon='week',short=false){
 const config={day:['15m','1h','4h'],week:['1h','4h','1d'],month:['4h','1d','1w']}[horizon],steps={'15m':H/4,'1h':H,'4h':4*H,'1d':24*H,'1w':168*H};
 const frames=Object.fromEntries(config.map(k=>[k,bars(steps[k],240,k==='1w'?4*24*H:0)]));
 const trigger=frames[config[0]],last=trigger.at(-1);last[2]+=1;last[4]=last[2]-.02;last[5]=250;
 if(short)for(const rows of Object.values(frames))for(const r of rows){const [o,high,low,c]=r.slice(1,5);r[1]=250-o;r[2]=250-low;r[3]=250-high;r[4]=250-c;}
 const step=steps[config[0]],open=last[0]+step,price=+last[4];trigger.push([open,price,price+.001,price-.001,price,1,open+step-1]);
 return {symbol:'1000PEPEUSDT',horizon,frames,now,requestedAt:now,receivedAt:now,contractVerifiedAt:now,source:'Binance USD-M public klines'};
}
export {input,now};
test('day/week/month use their own closed trigger and independent holding deadlines',()=>{
 assert.equal(typeof api.analyzeHorizon,'function');
 for(const h of ['day','week','month'])for(const short of [false,true]){
 const r=api.analyzeHorizon(input(h,short));const gate=api.horizonPlanStatus(r,now);
 assert.equal(gate.key,'plan',`${h} ${short}: ${gate.reason}`);const p=gate.plans[0];
 assert.equal(p.side,short?'SHORT':'LONG');assert.equal(p.horizon,h);assert.equal(r.symbol,'1000PEPEUSDT');assert.ok(p.maxHoldMs>0);assert.equal(p.expiresAt,r.validUntil);
 }
 assert.ok(api.HORIZONS.day.maxHoldMs<api.HORIZONS.week.maxHoldMs);assert.ok(api.HORIZONS.week.maxHoldMs<api.HORIZONS.month.maxHoldMs);
});
test('stale, spot, missing, future and direction conflict inputs never expose usable levels',()=>{
 assert.equal(typeof api.horizonPlanStatus,'function');
 const r=api.analyzeHorizon(input());assert.equal(api.horizonPlanStatus(r,now+60000).plans.length,0);
 for(const edit of [x=>x.source='Binance Spot public klines',x=>delete x.frames['1d'],x=>x.frames['4h'].splice(10,1),x=>x.requestedAt=now+1,x=>x.contractVerifiedAt=now-60001,x=>{const rows=x.frames['1d'];for(const b of rows){const hi=b[2],lo=b[3];b[1]=250-b[1];b[2]=250-lo;b[3]=250-hi;b[4]=250-b[4];}}]){const x=input();edit(x);assert.equal(api.horizonPlanStatus(api.analyzeHorizon(x),now).plans.length,0);}
});
test('already touched entry, stop and changed horizon identity fail closed',()=>{
 assert.equal(typeof api.analyzeHorizon,'function');
 for(const level of ['entry','stop']){const x=input();const p=api.horizonPlanStatus(api.analyzeHorizon(x),now).plans[0];x.frames['1h'].at(-1)[level==='entry'?2:3]=p[level];assert.equal(api.horizonPlanStatus(api.analyzeHorizon(x),now).plans.length,0);}
 const r=api.analyzeHorizon(input());r.horizon='month';assert.equal(api.horizonPlanStatus(r,now).plans.length,0);
});

test('horizon forward records keep independent identity, deadline and one-coin risk reservation',async()=>{
 const {emptyForwardBook,registerForwardAdvice,advanceForward}=await import('../src/advice_forward.js');
 const {validateForwardBook}=await import('../src/advice_forward_store.js');
 for(const h of ['day','week','month']){
  const r=api.analyzeHorizon(input(h)),b=emptyForwardBook(),price=r.snapshot.price;
  const feed={startedAt:now-1,last:{id:1,time:now,eventTime:now,receivedAt:now,price}};
  const rows=registerForwardAdvice(b,r,{now,feed});assert.equal(rows[0]?.status,'PENDING');assert.equal(rows[0].horizon,h);
  const p=rows[0].plan;advanceForward(b,r.symbol,{id:2,time:now+1,eventTime:now+1,receivedAt:now+1,price:p.entry});
  assert.equal(rows[0].status,'OPEN');assert.equal(rows[0].deadline,api.horizonDeadline(h,now+1));validateForwardBook(b);
  const other=api.analyzeHorizon(input(h==='week'?'month':'week'));
  registerForwardAdvice(b,other,{now,feed});assert.equal(b.rows.filter(x=>['PENDING','OPEN','PARTIAL'].includes(x.status)).length,1);
 }
});
test('historical replay respects horizon holding duration rather than legacy 48-bar cap',async()=>{
 const {replayTrade}=await import('../src/pullback_replay.js');
 const plan={side:'LONG',entry:100,stop:95,tp1:110,tp2:120};
 const bars=Array.from({length:70},(_,i)=>[i*H,99,101,98,100,1,(i+1)*H-1]);bars[60][2]=121;
 const r=replayTrade(plan,bars,{maxBars:70});assert.equal(r.reason,'TP2');assert.equal(r.bars,61);
});
test('horizon research replay separates periods, source and incomplete samples',async()=>{
 const replay=await import('../src/horizon_replay.js').catch(()=>({}));assert.equal(typeof replay.compareHorizons,'function');
 const x=input(),end=x.frames['1h'].at(-1)[0],start=end-100*H;
 const r=replay.compareHorizons({...x,start,end});assert.equal(r.version,api.HORIZON_VERSION);assert.equal(r.horizon,'week');assert.equal(r.rows.length,2);
 assert.ok(r.rows.every(x=>x.development&&x.holdout&&x.stress));assert.equal(r.fundingIncluded,false);assert.equal(r.executionModel,'OHLC_RESEARCH_NOT_FORWARD_FILLS');
 assert.throws(()=>replay.compareHorizons({...x,start,end,source:'spot'}));
 x.frames['1h'].splice(100,1);assert.throws(()=>replay.compareHorizons({...x,start,end}));
});
test('adding future closed prices never changes a signal at an earlier decision time',()=>{
 const x=input();const before=api.horizonSignals(x);for(const rows of Object.values(x.frames)){const last=rows.at(-1),step=last[6]-last[0]+1;rows.push([last[0]+step,1,10000,1,9999,100000,last[6]+step]);}
 assert.deepEqual(api.horizonSignals(x),before);
});
test('forward entry window never outlives contract verification',async()=>{
 const {emptyForwardBook,registerForwardAdvice,advanceForward}=await import('../src/advice_forward.js');const x=input();x.contractVerifiedAt=now-50000;
 const r=api.analyzeHorizon(x),b=emptyForwardBook(),price=r.snapshot.price;registerForwardAdvice(b,r,{now,feed:{startedAt:now-1,last:{id:1,time:now,receivedAt:now,price}}});
 advanceForward(b,r.symbol,{id:2,time:now+5000,receivedAt:now+5000,price});advanceForward(b,r.symbol,{id:3,time:now+11000,receivedAt:now+11000,price:b.rows[0].plan.entry});
 assert.equal(api.horizonPlanStatus(r,now+11000).key,'expired');assert.equal(b.rows[0].status,'EXPIRED');assert.equal(b.rows[0].fills.length,0);
});
test('fixed indicator seed makes extra pre-window history irrelevant in live and replay',()=>{
 const x=input('month'),before=api.horizonSignals(x);for(const rows of Object.values(x.frames))for(const r of rows.filter(r=>+r[6]<x.now).slice(0,-60)){r[1]+=100;r[2]+=100;r[3]+=100;r[4]+=100;}
 assert.deepEqual(api.horizonSignals(x),before);
});
