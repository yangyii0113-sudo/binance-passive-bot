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
