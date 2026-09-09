const test=require('node:test');
const assert=require('node:assert/strict');
const KRX=require('../v12/providers/krx_adapter.js');

test('KRX provider is authenticated read-only and server-only',()=>{
  assert.equal(KRX.descriptor.transport,'AUTHENTICATED_READ_ONLY');
  assert.equal(KRX.descriptor.executionWrite,false);
  assert.equal(KRX.descriptor.serverOnly,true);
  assert.equal(KRX.descriptor.credentialRequired,true);
});

test('KRX daily stock row normalizes EOD quote fields without exposing credential',()=>{
  const receivedAt=Date.parse('2026-09-09T08:00:00Z');
  const out=KRX.normalizeDailyQuote({
    BAS_DD:'20260909',ISU_CD:'005930',ISU_NM:'Samsung Electronics',MKT_NM:'KOSPI',SECT_TP_NM:'Stock',
    TDD_CLSPRC:'71000',CMPPREVDD_PRC:'1000',FLUC_RT:'1.43',TDD_OPNPRC:'70000',TDD_HGPRC:'71500',TDD_LWPRC:'69800',
    ACC_TRDVOL:'12345678',ACC_TRDVAL:'876543210000',MKTCAP:'423850000000000',LIST_SHRS:'5969782550'
  },{receivedAt});
  assert.equal(out.instrument.instrumentId,'KRX:005930');
  assert.equal(out.tradeDate,'2026-09-09');
  assert.equal(out.knowledgeTime,'RECEIVED_AT');
  assert.equal(out.pointInTimeSafe,false);
  const byField=Object.fromEntries(out.observations.map(x=>[x.field,x]));
  assert.equal(byField['price.close'].value,71000);
  assert.equal(byField['price.change_pct'].value,1.43);
  assert.equal(byField['volume.shares'].value,12345678);
  assert.equal(byField['market_cap'].value,423850000000000);
  assert.equal(Object.hasOwn(out,'apiKey'),false);
});

test('KRX missing quote values become UNAVAILABLE instead of zero',()=>{
  const out=KRX.normalizeDailyQuote({BAS_DD:'20260909',ISU_CD:'000660',ISU_NM:'SK hynix',TDD_CLSPRC:'-'},{receivedAt:Date.parse('2026-09-09T08:00:00Z')});
  const close=out.observations.find(x=>x.field==='price.close');
  assert.equal(close.value,null);
  assert.equal(close.status,'UNAVAILABLE');
  assert.equal(close.confidence,0);
});

test('KRX rejects impossible business dates',()=>{
  assert.throws(()=>KRX.normalizeDailyQuote({BAS_DD:'20260231',ISU_CD:'005930'},{receivedAt:1}),/DATE_INVALID/);
});

test('KRX index normalization requires explicit canonical symbol and preserves official index name',()=>{
  const receivedAt=Date.parse('2026-09-09T08:00:00Z');
  const out=KRX.normalizeIndexQuote({BAS_DD:'20260909',IDX_CLSS:'KOSPI',IDX_NM:'KOSPI',CLSPRC_IDX:'2650.25',CMPPREVDD_IDX:'15.2',FLUC_RT:'0.58',OPNPRC_IDX:'2640',HGPRC_IDX:'2660',LWPRC_IDX:'2635',ACC_TRDVOL:'500000000',ACC_TRDVAL:'9000000000000',MKTCAP:'2100000000000000'}, {receivedAt,symbol:'KOSPI'});
  assert.equal(out.instrument.instrumentId,'KRX:KOSPI');
  assert.equal(out.instrument.assetType,'INDEX');
  assert.equal(out.officialIndexName,'KOSPI');
  assert.equal(out.pointInTimeSafe,false);
  assert.equal(out.observations.find(x=>x.field==='index.close').value,2650.25);
});
