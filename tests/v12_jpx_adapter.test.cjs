const test=require('node:test');
const assert=require('node:assert/strict');
const JPX=require('../v12/providers/jpx_adapter.js');

test('J-Quants V2 provider is key-protected, server-only, and read-only',()=>{
  assert.equal(JPX.descriptor.transport,'AUTHENTICATED_READ_ONLY');
  assert.equal(JPX.descriptor.executionWrite,false);
  assert.equal(JPX.descriptor.serverOnly,true);
  assert.equal(JPX.descriptor.credentialRequired,true);
});

test('J-Quants V2 compact daily bar maps raw OHLCV and adjusted fields',()=>{
  const receivedAt=Date.parse('2026-09-09T08:00:00Z');
  const out=JPX.normalizeDailyQuote({
    Date:'2026-09-09',Code:'72030',O:2850,H:2890,L:2832,C:2875,Vo:12345600,Va:35400000000,
    AdjFactor:1,AdjO:2850,AdjH:2890,AdjL:2832,AdjC:2875,AdjVo:12345600,UL:'0',LL:'0'
  },{receivedAt,name:'Toyota Motor'});
  assert.equal(out.instrument.instrumentId,'TSE:72030');
  assert.equal(out.tradeDate,'2026-09-09');
  assert.equal(out.knowledgeTime,'RECEIVED_AT');
  assert.equal(out.pointInTimeSafe,false);
  assert.equal(out.adjustedSeriesPointInTimeSafe,false);
  assert.equal(out.retroactiveAdjustmentRisk,true);
  const byField=Object.fromEntries(out.observations.map(x=>[x.field,x]));
  assert.equal(byField['price.close'].value,2875);
  assert.equal(byField['volume.shares'].value,12345600);
  assert.equal(byField['turnover.value'].value,35400000000);
  assert.equal(byField['adjustment.factor'].value,1);
  assert.equal(byField['price.adjusted_close'].value,2875);
  assert.equal(Object.hasOwn(out,'apiKey'),false);
});

test('J-Quants null trading values remain UNAVAILABLE and are not fabricated',()=>{
  const receivedAt=Date.parse('2026-09-09T08:00:00Z');
  const out=JPX.normalizeDailyQuote({Date:'2026-09-09',Code:'13010',O:null,H:null,L:null,C:null,Vo:null,Va:null,AdjFactor:1},{receivedAt});
  const close=out.observations.find(x=>x.field==='price.close');
  assert.equal(close.value,null);
  assert.equal(close.status,'UNAVAILABLE');
  assert.equal(close.confidence,0);
});

test('J-Quants rejects received time before TSE close for same-day EOD bar',()=>{
  assert.throws(()=>JPX.normalizeDailyQuote({Date:'2026-09-09',Code:'72030',C:2875},{receivedAt:Date.parse('2026-09-09T05:00:00Z')}),/RECEIVED_AT_INVALID/);
});

test('J-Quants validates ISO trading date',()=>{
  assert.throws(()=>JPX.normalizeDailyQuote({Date:'2026-02-31',Code:'72030'},{receivedAt:Date.parse('2026-03-01T08:00:00Z')}),/DATE_INVALID/);
});
