import test from 'node:test';
import assert from 'node:assert/strict';
import {technicalConfirmation,technicalFilter,TECH_VERSION} from '../src/technical_confirmation.js';
import {rankWeakRows} from '../src/strong_candidates.js';
import {horizonCandidateSelection,horizonPanel} from '../src/horizon_view.js';
import {analyzeHorizon,horizonSignals} from '../src/horizon_strategies.js';
import {compareHorizons} from '../src/horizon_replay.js';
const H=3600000,now=Date.UTC(2026,9,8,4,2);
function bars(count=240,step=H,wave=false){const end=Math.floor(now/step)*step;return Array.from({length:count},(_,i)=>{const p=80+i*.1+(wave?Math.sin(i*Math.PI/10)*3:0),o=end-(count-i)*step;return [o,p,p+.12,p-.12,p+.04,100,o+step-1];});}
function input(){const frames=Object.fromEntries([['1h',H],['4h',4*H],['1d',24*H]].map(([f,step])=>[f,bars(240,step)]));const last=frames['1h'].at(-1);last[2]+=1;last[4]=last[2]-.02;last[5]=250;const open=last[6]+1;frames['1h'].push([open,last[4],last[4]+.001,last[4]-.001,last[4],1,open+H-1]);return {frames,horizon:'week',symbol:'1000PEPEUSDT',now,requestedAt:now,receivedAt:now,contractVerifiedAt:now,source:'Binance USD-M public klines'};}
test('indicator arithmetic has known flat/rising outcomes and cannot fake long warmup',()=>{
 const rising=technicalConfirmation(bars(),'LONG');assert.equal(rising.rsi,100);assert.equal(rising.vegas.direction,'LONG');assert.ok(rising.keltner.upper>rising.keltner.middle);assert.ok(rising.bollinger.lower<rising.bollinger.upper);
 const flat=bars().map(r=>[r[0],100,100,100,100,0,r[6]]),e=technicalConfirmation(flat,'LONG');assert.equal(e.rsi,50);assert.equal(e.bollinger.upper,100);assert.equal(e.keltner.lower,100);assert.equal(e.vegas.direction,'MIXED');assert.equal(e.volumeRatio,null);assert.equal(e.fibonacci,null);
 assert.equal(technicalConfirmation(bars(60),'LONG').vegas,null);assert.deepEqual(technicalFilter(technicalConfirmation(bars(60),'LONG'),'vegas','LONG'),{ready:false,pass:false});
 const bad=bars();bad.splice(100,1);assert.equal(technicalConfirmation(bad,'LONG'),null);
});
test('confirmed Fibonacci anchors and directional confirmations mirror correctly for shorts',()=>{
 const rows=bars(200,H,true),up=technicalConfirmation(rows,'LONG');assert.ok(up.fibonacci);assert.ok(up.fibonacci.end.confirmedAt<=rows.at(-1)[6]);assert.ok(up.fibonacci.start.at<up.fibonacci.end.at);
 const inverse=rows.map(r=>[r[0],300-r[1],300-r[3],300-r[2],300-r[4],r[5],r[6]]),down=technicalConfirmation(inverse,'SHORT');assert.ok(down.fibonacci);assert.ok(Math.abs(up.fibonacci.zoneLow+down.fibonacci.zoneHigh-300)<1e-9);assert.ok(Math.abs(up.rsi+down.rsi-100)<1e-9);
 for(const variant of ['fibonacci','vegas','keltner'])assert.deepEqual(technicalFilter(up,variant,'LONG'),technicalFilter(down,variant,'SHORT'));
});
test('unfinished and future candles never affect technical confirmation or existing plans',()=>{
 const x=input(),before=horizonSignals(x);assert.equal(before.evidence.technical.version,TECH_VERSION);
 x.frames['1h'].at(-1)[2]=99999;for(const rows of Object.values(x.frames)){const b=rows.at(-1),step=b[6]-b[0]+1;rows.push([b[0]+step,1,99999,1,999,999,b[6]+step]);}
 assert.deepEqual(horizonSignals(x),before);
});
test('downside top five excludes illiquid/extreme/duplicate tickers and cannot bypass freshness',()=>{
 const rows=[...Array.from({length:7},(_,i)=>['',`C${i}USDT`,100,-i-1,2e7,40]),['','THINUSDT',1,-12,99,80],['','EXTREMEUSDT',1,-30,2e7,80],['','UPUSDT',1,9,2e7,90],['','C6USDT',1,-10,2e7,99]];
 assert.deepEqual(rankWeakRows(rows).map(x=>x.symbol),['C6USDT','C5USDT','C4USDT','C3USDT','C2USDT']);
 const state={ui:{horizonPool:'down'},market:{status:'LIVE',updatedAt:new Date(now).toISOString(),contractVerifiedAt:new Date(now).toISOString(),cryptoOnly:true,universeRows:rows}};
 assert.equal(horizonCandidateSelection(state,now).rows.length,5);assert.equal(horizonCandidateSelection(state,now+301000).rows.length,0);assert.match(horizonPanel(state,now),/下跌前 5 強/);
});
test('current evidence is collapsed and expired or mismatched records hide indicator prices',()=>{
 const r=analyzeHorizon(input()),state={ui:{horizonSymbol:r.symbol,horizon:'week'},agents:{horizonPlans:{[`week:${r.symbol}`]:r}}};
 const html=horizonPanel(state,now);assert.match(html,/data-technical-confirmation/);assert.ok(html.indexOf('data-price-level="entry"')<html.indexOf('data-technical-confirmation'));assert.doesNotMatch(horizonPanel(state,now+60000),/data-technical-confirmation|data-price-level/);
 r.symbol='OTHERUSDT';assert.doesNotMatch(horizonPanel(state,now),/data-technical-confirmation|data-price-level/);
});
test('backtest keeps baseline and six independent filtered comparisons with missing evidence counted',()=>{
 const x=input(),end=x.frames['1h'].at(-1)[0],r=compareHorizons({...x,start:end-100*H,end});assert.equal(r.rows.length,2);assert.equal(r.technicalRows.length,6);assert.equal(r.technicalVersion,TECH_VERSION);
 for(const row of r.technicalRows)for(const segment of ['development','holdout','stress']){assert.ok(Number.isInteger(row[segment].confirmationMissing));assert.ok(Number.isInteger(row[segment].confirmationRejected));assert.ok(row[segment].ledger.every(t=>t.entryTime>=row[segment].from&&t.exitTime<row[segment].to));}
 const future=structuredClone(x);for(const rows of Object.values(future.frames)){const b=rows.at(-1),step=b[6]-b[0]+1;rows.push([b[0]+step,1,9000,1,8000,1000,b[6]+step]);}assert.deepEqual(compareHorizons({...future,start:end-100*H,end}),r);
});

test('technical seed ignores prices older than its documented 200-bar window',()=>{const rows=bars(),before=technicalConfirmation(rows,'LONG');for(const r of rows.slice(0,-200))for(const k of [1,2,3,4])r[k]+=100;assert.deepEqual(technicalConfirmation(rows,'LONG'),before);});
