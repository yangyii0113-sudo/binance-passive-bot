'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');

function Adapter(){return require('../v12/providers/twelve_data_eu_breadth_adapter.js');}

const RECEIVED=Date.parse('2026-09-15T08:30:00Z');
const SCOPE='PAN_EUROPE_CBOE_EQUITIES';

function rows(){
  return [
    {symbol:'AAA',close:'101',previous_close:'100',last_quote_at:String((RECEIVED-3000)/1000)},
    {symbol:'BBB',close:'99',previous_close:'100',last_quote_at:String((RECEIVED-2000)/1000)},
    {symbol:'CCC',close:'100',previous_close:'100',last_quote_at:String((RECEIVED-1000)/1000)}
  ];
}

test('Twelve Data EU breadth adapter derives a conservative canonical pan-European breadth snapshot',()=>{
  const A=Adapter();
  assert.equal(A.descriptor.id,'twelve-data-eu-breadth');
  assert.equal(A.SOURCE,'TWELVEDATA:BREADTH:EU');
  assert.equal(A.descriptor.marketScope,SCOPE);
  assert.equal(A.descriptor.executionWrite,false);

  const out=A.normalizeBreadth(rows(),{receivedAt:RECEIVED,marketScope:SCOPE});
  assert.equal(out.schemaVersion,'foxyya-eu-market-breadth/1');
  assert.equal(out.entityId,'MARKET:EU:BREADTH:CBOE_EUROPE');
  assert.equal(out.marketScope,SCOPE);
  assert.equal(out.observedAt,RECEIVED-3000,'breadth freshness must be bounded by the oldest constituent quote');
  assert.equal(out.receivedAt,RECEIVED);
  assert.deepEqual(out.values,{total:3,advancers:1,decliners:1,unchanged:1,advanceRatio:1/3,declineRatio:1/3});
  assert.ok(out.observations.some(x=>x.field==='breadth.issues.advancing'&&x.value===1));
  assert.ok(out.observations.some(x=>x.field==='breadth.issues.declining'&&x.value===1));
  assert.ok(out.observations.every(x=>x.scope==='EU'&&x.source==='TWELVEDATA:BREADTH:EU'&&x.observedAt===RECEIVED-3000&&x.receivedAt===RECEIVED));
  assert.equal(out.researchOnly,true);
  assert.equal(out.executionWrite,false);
});

test('EU breadth adapter rejects unverified scope, empty or duplicate universe, incomplete prices and future provider time',()=>{
  const A=Adapter();
  assert.throws(()=>A.normalizeBreadth(rows(),{receivedAt:RECEIVED,marketScope:'EURONEXT_ONLY'}),/BREADTH_MARKET_SCOPE_INVALID/);
  assert.throws(()=>A.normalizeBreadth([],{receivedAt:RECEIVED,marketScope:SCOPE}),/BREADTH_UNIVERSE_EMPTY/);
  assert.throws(()=>A.normalizeBreadth([...rows(),rows()[0]],{receivedAt:RECEIVED,marketScope:SCOPE}),/BREADTH_SYMBOL_DUPLICATE/);
  const incomplete=rows(); delete incomplete[0].previous_close;
  assert.throws(()=>A.normalizeBreadth(incomplete,{receivedAt:RECEIVED,marketScope:SCOPE}),/BREADTH_PRICE_REQUIRED/);
  const future=rows(); future[0].last_quote_at=String((RECEIVED+1000)/1000);
  assert.throws(()=>A.normalizeBreadth(future,{receivedAt:RECEIVED,marketScope:SCOPE}),/BREADTH_TIME_INVALID/);
});
