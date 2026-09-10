'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const R=require('../v12/ui/home_renderer.js');

const asOf=Date.parse('2026-09-10T10:53:00Z');
const regions=['US','TW','CN_HK','JP','KR','EU','CRYPTO'];

function baseView(overrides={}){
  return Object.freeze({
    schemaVersion:'foxyya-home-view-model/1',asOf,researchOnly:true,executionWrite:false,
    regions:Object.freeze(regions.map(region=>Object.freeze({region,bias:'UNAVAILABLE',confidence:0,status:'UNAVAILABLE',asOf,facts:[]}))),
    marketPulse:Object.freeze([]),earlyTrend:Object.freeze([]),events:Object.freeze([]),
    opportunities:Object.freeze({CRYPTO:Object.freeze([]),US:Object.freeze([]),TW:Object.freeze([])}),
    ...overrides
  });
}

test('Markets keeps very large Crypto paper candidate sets decision-readable',()=>{
  const rows=[];
  for(let i=0;i<29;i++)rows.push(Object.freeze({market:'CRYPTO',symbol:`R${i}USDT`,side:'LONG',family:'A',status:'REJECTED',mode:'PAPER READ-ONLY',executionReadOnly:true,executionWrite:false}));
  rows.push(Object.freeze({market:'CRYPTO',symbol:'HOTUSDT',side:'LONG',family:'B',status:'ARMED',mode:'PAPER READ-ONLY',executionReadOnly:true,executionWrite:false}));
  const out=R.renderHomeSections(baseView({opportunities:Object.freeze({CRYPTO:Object.freeze(rows),US:Object.freeze([]),TW:Object.freeze([])})}));
  assert.match(out.opportunitiesHtml,/30 candidates/i);
  assert.match(out.opportunitiesHtml,/顯示 12 \/ 30/);
  assert.match(out.opportunitiesHtml,/HOTUSDT/,'ARMED candidate must not be buried below rejected rows');
  assert.ok((out.opportunitiesHtml.match(/class="opportunity-row crypto"/g)||[]).length<=12,'large runtime snapshots must not render hundreds of rows');
  assert.match(out.opportunitiesHtml,/data-favorite-card="CRYPTO:/,'Crypto rows participate in local Favorites filtering');
});

test('Regional Intelligence separates source coverage from directional evidence',()=>{
  const rows=regions.map(region=>{
    if(region==='EU')return Object.freeze({region,bias:'UNAVAILABLE',confidence:0,status:'AVAILABLE',asOf,facts:[Object.freeze({field:'inflation.hicp_yoy',value:1.9,unit:'PCT',status:'SNAPSHOT',source:'ECB',observedAt:asOf,receivedAt:asOf})]});
    return Object.freeze({region,bias:'UNAVAILABLE',confidence:0,status:'UNAVAILABLE',asOf,facts:[]});
  });
  const out=R.renderHomeSections(baseView({regions:Object.freeze(rows)}));
  assert.match(out.regionsHtml,/DATA AVAILABLE/);
  assert.match(out.regionsHtml,/方向證據不足/);
  assert.match(out.regionsHtml,/DATA NOT CONNECTED/);
  assert.doesNotMatch(out.regionsHtml,/Confidence —/,'missing directional evidence should not masquerade as a zero-confidence direction score');
});

test('Lab layout contains metric cards instead of overlapping neighboring research panels',()=>{
  const css=fs.readFileSync('v12/ui/styles.css','utf8');
  assert.match(css,/#lab \.research-columns\s*\{[^}]*grid-template-columns\s*:\s*repeat\(3,minmax\(0,1fr\)\)/s);
  assert.match(css,/#lab \.research-columns>\.panel\s*\{[^}]*min-width\s*:\s*0/s);
  assert.match(css,/#lab \.metric-grid\s*\{[^}]*repeat\(2,minmax\(0,1fr\)\)/s);
  const laptop=css.match(/@media\(max-width:1180px\)[^{]*\{[\s\S]*?#lab \.research-columns\s*\{[^}]*repeat\(2,minmax\(0,1fr\)\)[^}]*\}[\s\S]*?#lab \.research-columns>\.panel:first-child\s*\{[^}]*grid-column\s*:\s*1\/-1[^}]*\}/);
  assert.ok(laptop,'laptop widths must promote the Crypto Lab panel to a full row and keep US/TW below it');
});
