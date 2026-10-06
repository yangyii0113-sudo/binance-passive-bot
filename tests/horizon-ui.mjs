import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHorizon} from '../src/horizon_strategies.js';
const view=await import('../src/horizon_view.js').catch(()=>({}));
const H=3600000,now=Date.UTC(2026,9,6,4,2);
function record(){const frames={};for(const [f,step] of [['1h',H],['4h',4*H],['1d',24*H]]){const end=Math.floor(now/step)*step;frames[f]=Array.from({length:240},(_,i)=>{const p=80+i*.1,o=end-(240-i)*step;return [o,p,p+.12,p-.12,p+.04,100,o+step-1];});}const last=frames['1h'].at(-1);last[2]+=1;last[4]=last[2]-.02;last[5]=250;const open=last[6]+1;frames['1h'].push([open,last[4],last[4]+.001,last[4]-.001,last[4],1,open+H-1]);return analyzeHorizon({symbol:'SOLUSDT',horizon:'week',frames,now,requestedAt:now,receivedAt:now,contractVerifiedAt:now,source:'Binance USD-M public klines'});}
test('horizon cards put identity before verdict and hide expired usable prices',()=>{
 assert.equal(typeof view.horizonPanel,'function');const r=record(),state={ui:{horizon:'week',horizonSymbol:'SOLUSDT'},agents:{horizonPlans:{'week:SOLUSDT':r}}};
 const html=view.horizonPanel(state,now);assert.match(html,/日內機會/);assert.match(html,/週級波段/);assert.match(html,/月級趨勢/);assert.match(html,/data-price-level="entry"/);assert.ok(html.indexOf('coin-identity')<html.indexOf('條件成立'));
 const stale=view.horizonPanel(state,now+60000);assert.doesNotMatch(stale,/data-price-level/);assert.match(stale,/重新/);assert.match(stale,/REAL_ORDER_LOCK/);
});
test('missing data and errors stay visible and user strings are escaped',()=>{
 assert.equal(typeof view.horizonPanel,'function');const html=view.horizonPanel({ui:{horizonSymbol:'<img>'},agents:{horizonPlans:{'week:<img>':{horizon:'week',status:'BLOCKED',reason:'來源 <failed>'}}}},now);
 assert.doesNotMatch(html,/<img>/);assert.match(html,/來源 &lt;failed&gt;/);assert.doesNotMatch(html,/data-price-level/);
});
test('horizon symbol participates in existing form-input preservation during market renders',()=>{
 assert.match(view.horizonPanel({ui:{horizonSymbol:'1000PEPEUSDT'}}),/<form[^>]*id="horizon-analysis-form"/);
 assert.match(view.horizonPanel({ui:{horizonSymbol:'1000PEPEUSDT'}}),/<input[^>]*name="symbol"/);
});
test('active horizon sample stays visible ahead of later failed registration',()=>{
 const html=view.horizonPanel({ui:{horizon:'week',horizonSymbol:'SOLUSDT'},forward:{enabled:true,book:{rows:[{horizon:'week',symbol:'SOLUSDT',status:'OPEN',reason:'模擬進場'},{horizon:'week',symbol:'SOLUSDT',status:'NOT_TRACKED',reason:'未登錄'}]}}},now);
 assert.match(html,/本機觀察：模擬持倉中/);
});
test('home strategy opportunities are visible before secondary disclosures',async()=>{
 const {homePage}=await import('../src/pages.js'),{appState}=await import('../src/state.js');
 const html=homePage(structuredClone(appState),now);
 const board=html.indexOf('aria-label="策略機會總覽"');
 assert.ok(board>=0,'home must show opportunity overview');
 assert.ok(board<html.indexOf('其他市場排行與研究工具'));
 assert.doesNotMatch(html.slice(0,board),/<details[^>]*>[\s\S]*$/);
});
test('opportunity overview prioritizes gated plans and preserves full target identity',()=>{
 assert.equal(typeof view.horizonOpportunities,'function');
 const r=record();r.symbol='1000PEPEUSDT';
 const html=view.horizonOpportunities({ui:{},agents:{horizonPlans:{'week:BTCUSDT':{horizon:'week',symbol:'BTCUSDT',status:'BLOCKED',reason:'行情失敗'},'week:1000PEPEUSDT':r}}},now);
 assert.match(html,/data-horizon-target="1000PEPEUSDT"/);
 assert.match(html,/1 檔有效計畫/);
 assert.match(html,/條件成立・待觸發/);
 assert.doesNotMatch(html,/data-price-level/);
 const stale=view.horizonOpportunities({ui:{},agents:{horizonPlans:{'week:1000PEPEUSDT':r}}},now+60000);
 assert.doesNotMatch(stale,/1 檔有效計畫/);assert.match(stale,/核對已過期/);
});
test('empty and failed opportunities offer verification without fabricated setups',()=>{
 assert.equal(typeof view.horizonOpportunities,'function');
 const html=view.horizonOpportunities({ui:{},agents:{horizonPlans:{'day:SOLUSDT':{horizon:'day',symbol:'SOLUSDT',status:'BLOCKED',reason:'缺少收盤資料'}}}},now);
 assert.match(html,/缺少收盤資料/);assert.match(html,/尚未分析/);assert.match(html,/前往核對/);
 assert.doesNotMatch(html,/檔有效計畫|data-price-level/);
});
