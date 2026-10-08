import test from 'node:test';
import assert from 'node:assert/strict';
import {createHorizonAuto,analyzeCoinPeriods} from '../src/horizon_auto.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const records=symbol=>['day','week','month'].map(horizon=>({symbol,horizon,status:'BLOCKED',reason:'fixture'}));
function harness(extra={}){const writes=[],states=[];const auto=createHorizonAuto({available:()=>true,refresh:async()=>{},select:()=>({rows:['A','B','C','D','E'].map(symbol=>({symbol}))}),analyze:async s=>records(s),write:(s,r)=>writes.push([s,r]),onChange:s=>states.push(s),...extra});return {auto,writes,states};}
test('startup checks five coins and all three periods, with no user selection',async()=>{
 const {auto,writes}=harness();await auto.tick();assert.equal(writes.length,5);assert.equal(writes.flatMap(x=>x[1]).length,15);assert.equal(auto.view().completed,5);assert.ok(auto.view().lastAt);
 await auto.tick();assert.equal(writes.length,5,'timer respects refresh interval');
});
test('only two coins run concurrently and repeated updates cannot overlap',async()=>{
 let active=0,maximum=0;const gate=deferred();const {auto,writes}=harness({analyze:async s=>{active++;maximum=Math.max(active,maximum);await gate.promise;active--;return records(s);}});
 const first=auto.tick();await Promise.resolve();await Promise.resolve();await auto.tick(true);assert.equal(maximum,2);gate.resolve();await first;assert.equal(writes.length,5);assert.equal(maximum,2);
});
test('background cancels and discards pending results; resume starts a fresh cycle',async()=>{
 let available=true;const gate=deferred();let signal;const {auto,writes}=harness({available:()=>available,analyze:async(s,o)=>{signal=o.signal;await gate.promise;return records(s);}});
 const first=auto.tick();await Promise.resolve();await Promise.resolve();available=false;auto.pause();assert.equal(signal.aborted,true);gate.resolve();await first;assert.equal(writes.length,0);
 available=true;await auto.tick();assert.equal(writes.length,5);
});
test('one coin failure is visible in all its periods without suppressing the others',async()=>{
 const {auto,writes}=harness({analyze:async s=>{if(s==='B')throw new Error('HTTP 451');return records(s);}});await auto.tick();assert.equal(writes.length,5);assert.ok(writes.find(x=>x[0]==='B')[1].every(r=>r.status==='BLOCKED'&&r.reason==='HTTP 451'));
});
test('bad market gate and offline availability never create candidates or analysis',async()=>{
 const {auto,writes}=harness({select:()=>({reason:'行情過期',rows:[{symbol:'A'}]})});await auto.tick();assert.equal(writes.length,0);assert.equal(auto.view().error,'行情過期');
 const offline=harness({available:()=>false,refresh:()=>{throw new Error('must not fetch');}});await offline.auto.tick();assert.equal(offline.writes.length,0);
});
test('pausing auto update prevents manual tick from silently resuming',async()=>{
 const {auto,writes}=harness();auto.setEnabled(false);await auto.tick(true);assert.equal(writes.length,0);assert.equal(auto.view().enabled,false);
});
test('three periods share exactly five candle requests plus one contract request',async()=>{
 const calls=[];const result=await analyzeCoinPeriods('1000PEPEUSDT',{fetcher:async url=>{calls.push(url);return new Response(JSON.stringify(url.includes('exchangeInfo')?{symbols:[{symbol:'1000PEPEUSDT',status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',underlyingType:'COIN'}]}:[]),{status:200});}});
 assert.equal(calls.length,6);assert.equal(new Set(calls).size,6);assert.equal(result.length,3);assert.ok(result.every(r=>r.symbol==='1000PEPEUSDT'&&r.status==='BLOCKED'),'missing closed bars never become a plan');
});

test('automatic status has a registered application state slice',async()=>{
 const {appState,setStateSlice}=await import('../src/state.js');
 const initial=structuredClone(appState.horizonAuto);
 setStateSlice('horizonAuto',{running:true,total:5});assert.equal(appState.horizonAuto.total,5);
 setStateSlice('horizonAuto',initial);
});
