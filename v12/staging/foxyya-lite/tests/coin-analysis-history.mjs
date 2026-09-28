import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCoinHistory,saveCoinAnalysis,restoreCoinAnalysis} from '../src/coin_analysis_history.js';
const make=id=>({id,scannedAt:'2026-09-23T14:10:00Z',rows:[{symbol:'UNIUSDT',rank:1,change:5,volume:2e7,strength:80,analysis:{version:'coin-analysis-v1',status:'VALID',analyzedAt:100,closedAt:99,validUntil:200,lastClose:100,hourlyDirection:'LONG',fourHourlyDirection:'LONG',aligned:true,atrPct:1,volumeRatio:1,emaDistanceAtr:1,strategies:['structured','breakout','meanReversion'].map(key=>({key,status:'SETUP',side:'LONG',entry:100,stop:95,tp1:105,tp2:110,reason:'研究條件成立'}))}}]});
test('analysis history retains evidence, strips executable levels and restores read-only',()=>{
 let raw;const storage={getItem:()=>raw,setItem:(k,v)=>{raw=v;}};
 for(let i=0;i<22;i++)saveCoinAnalysis(make(String(i)),storage);
 const h=loadCoinHistory(storage);assert.equal(h.error,null);assert.equal(h.runs.length,20);assert.equal(h.runs[0].id,'21');
 const restored=restoreCoinAnalysis(h.runs[0]);assert.equal(restored.analysisHistorical,true);assert.equal(restored.rows[0].analysis.strategies[0].status,'SETUP');assert.equal(restored.rows[0].analysis.strategies[0].entry,undefined);assert.equal(restored.rows[0].analysis.volumeRatio,1);
 assert.doesNotMatch(raw,/"(?:entry|stop|tp1|tp2)":/);
});
test('corruption and quota failures preserve old records and report failure',()=>{
 let writes=0;const bad={getItem:()=>'{',setItem:()=>writes++};assert.ok(loadCoinHistory(bad).error);assert.throws(()=>saveCoinAnalysis(make('1'),bad),/原資料未被覆寫/);assert.equal(writes,0);
 assert.throws(()=>saveCoinAnalysis(make('1'),{getItem:()=>null,setItem:()=>{throw Error('quota');}}),/未保存/);
 const malformed=make('x');malformed.rows[0].analysis.volumeRatio=-1;assert.throws(()=>saveCoinAnalysis(malformed,{getItem:()=>null,setItem:()=>writes++}),/數據無效/);assert.equal(writes,0);
});
import {pullbackPanel} from '../src/entry_plan.js';
test('restored history stays historical even inside validity window and disables reusing old picks',()=>{
 const restored=restoreCoinAnalysis(make('x'));
 const html=pullbackPanel({pullback:{...restored,analysisHistory:[make('x')]}},101);
 assert.match(html,/歷史分析（唯讀，非目前行情）/);assert.match(html,/當時：研究條件成立/);
 assert.doesNotMatch(html,/entry-plan-primary/);assert.match(html,/重新分析目前強勢幣/);
 assert.match(html,/data-pullback-compare="UNIUSDT" disabled/);
 assert.doesNotMatch(html,/data-pullback-compare="UNIUSDT" >/);
 assert.doesNotMatch(html,/data-pullback-batch(?: |>|$)/);
});
