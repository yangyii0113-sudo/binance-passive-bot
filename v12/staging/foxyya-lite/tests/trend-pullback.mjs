import test from 'node:test';
import assert from 'node:assert/strict';
import { pullbackPlan } from '../src/trend_pullback.js';
const H=3600000, now=2400*H;
function bars(n,step,rising=true){return Array.from({length:n},(_,i)=>{const c=rising?100+i:1000-i;return [(2400-n*step+i*step)*H,c,c+2,c-2,c,100,(2400-n*step+(i+1)*step)*H-1];});}
function fixture(short=false){const h=bars(220,1,!short), f=bars(500,4,!short);const b=h.at(-1);b[3]=short?b[3]:300;b[2]=short?800:b[2];b[1]=short?789:311;b[4]=short?788:312;return {hourly:h,fourHourly:f,now};}
test('confirmed long and short pullbacks produce correctly ordered risk levels',()=>{
 for(const short of [false,true]){const p=pullbackPlan(fixture(short));assert.equal(p.status,'SETUP');assert.equal(p.side,short?'SHORT':'LONG');assert.ok(short?p.stop>p.entry&&p.tp1<p.entry&&p.tp2<p.tp1:p.stop<p.entry&&p.tp1>p.entry&&p.tp2>p.tp1);assert.ok(Math.abs(Math.abs(p.tp2-p.entry)/Math.abs(p.entry-p.stop)-2)<1e-9);}
});
test('unclosed candles cannot create a signal',()=>{const a=fixture();const expected=pullbackPlan(a);a.hourly.push([now,1,9999,1,9999,100,now+H-1]);assert.deepEqual(pullbackPlan(a),expected);});
test('gaps, stale data and malformed OHLC block a price plan',()=>{
 for(const mutate of [a=>a.hourly.splice(100,1),a=>a.now+=2*H,a=>a.hourly[100][4]=null,a=>a.hourly[100][2]=1]){const a=fixture();mutate(a);const p=pullbackPlan(a);assert.equal(p.status,'BLOCKED');assert.equal(p.entry,undefined);}
});
test('insufficient history and absent pullback never invent entry levels',()=>{assert.equal(pullbackPlan({hourly:[],fourHourly:[],now}).status,'BLOCKED');const a=fixture();a.hourly.at(-1)[3]=311;assert.equal(pullbackPlan(a).status,'WAIT');assert.equal(pullbackPlan(a).entry,undefined);});

import { pullbackPanel, entryPlan } from '../src/entry_plan.js';
test('expired plans hide old prices and empty prices do not become zero',()=>{
 const p={symbol:'BTCUSDT',...pullbackPlan(fixture())};
 const html=pullbackPanel({pullback:{rows:[p]}},p.expiresAt);
 assert.doesNotMatch(html,/entry-plan-primary/);
 assert.match(html,/已過期/);
 assert.doesNotMatch(entryPlan({entry:null,stop:null,tp1:null,tp2:null}),/0\.000/);
});

const {strongPullbackCandidates,scanPullbacks}=await import('../src/trend_pullback.js');
test('top ten scanner selects fresh rising crypto contracts with deterministic liquidity ties',()=>{
 const now=Date.now();
 const symbols=Array.from({length:14},(_,i)=>`COIN${i}USDT`);
 const contracts={symbols:symbols.map(symbol=>({symbol,status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',underlyingType:'COIN'}))};
 const rows=symbols.map((symbol,i)=>['',symbol,'1',5,20000000+i,90]);
 const market={status:'LIVE',updatedAt:new Date(now).toISOString(),universeRows:rows};
 const selected=strongPullbackCandidates(market,contracts,now);
 assert.equal(selected.length,10);assert.equal(selected[0].symbol,'COIN13USDT');assert.equal(selected[9].rank,10);
 assert.throws(()=>strongPullbackCandidates({...market,status:'STALE'},contracts,now));
 assert.throws(()=>strongPullbackCandidates({...market,updatedAt:new Date(now-120001).toISOString()},contracts,now));
 assert.throws(()=>strongPullbackCandidates(market,{},now));
 contracts.symbols[13].underlyingType='EQUITY';rows[12][3]=-5;rows[11][3]=30;rows[10][4]=1;rows[9][5]=null;
 const filtered=strongPullbackCandidates({...market,universeRows:[...rows,rows[0]]},contracts,now);
 assert.equal(filtered.length,9);assert.equal(new Set(filtered.map(x=>x.symbol)).size,9);
 assert.equal(filtered.some(x=>['COIN13USDT','COIN12USDT','COIN11USDT','COIN10USDT','COIN9USDT'].includes(x.symbol)),false);
});
test('scanner preserves ranking, isolates unavailable contracts and bounds concurrent requests',async()=>{
 let active=0,peak=0;const progress=[],urls=[];
 const rows=await scanPullbacks(Array.from({length:10},(_,i)=>({symbol:i===9?'龙虾USDT':`COIN${i}USDT`,rank:i+1})),{
 fetcher:async(url)=>{urls.push(url);active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;return {ok:true,json:async()=>[]};},
 onProgress:n=>progress.push(n)
 });
 assert.equal(rows.length,10);assert.ok(rows.every(x=>x.status==='BLOCKED'&&x.entry===undefined));assert.ok(peak<=4);assert.equal(progress.at(-1),10);assert.equal(urls.length,20);assert.ok(urls.some(url=>url.includes(encodeURIComponent('龙虾USDT'))));
 assert.deepEqual(rows.map(x=>x.rank),[1,2,3,4,5,6,7,8,9,10]);
 assert.deepEqual(await scanPullbacks(),[]);
});
