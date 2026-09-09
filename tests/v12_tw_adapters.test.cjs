const test=require('node:test');const assert=require('node:assert/strict');
const TWSE=require('../v12/providers/twse_adapter.js');const TPEX=require('../v12/providers/tpex_adapter.js');

test('TWSE daily quote becomes canonical SNAPSHOT observations',()=>{
 const r=TWSE.normalizeDailyQuote({Date:'1150908',Code:'2330',Name:'台積電',OpeningPrice:'1,420.00',HighestPrice:'1,445.00',LowestPrice:'1,410.00',ClosingPrice:'1,425.00',TradeVolume:'25,000,000',TradeValue:'35,600,000,000',Transaction:'41,000',Change:'+15.00'},{receivedAt:Date.parse('2026-09-08T14:00:00+08:00')});
 assert.equal(r.instrument.instrumentId,'TWSE:2330');assert.equal(r.tradeDate,'2026-09-08');
 const close=r.observations.find(x=>x.field==='price.close');assert.equal(close.value,1425);assert.equal(close.status,'SNAPSHOT');assert.equal(close.source,'TWSE:STOCK_DAY_ALL');
 const vol=r.observations.find(x=>x.field==='volume.shares');assert.equal(vol.value,25000000);
});

test('TWSE missing numeric value is UNAVAILABLE rather than fabricated zero',()=>{
 const r=TWSE.normalizeDailyQuote({Date:'1150908',Code:'2330',Name:'台積電',ClosingPrice:'--'},{receivedAt:Date.parse('2026-09-08T14:00:00+08:00')});
 const close=r.observations.find(x=>x.field==='price.close');assert.equal(close.value,null);assert.equal(close.status,'UNAVAILABLE');assert.equal(close.confidence,0);
});

test('TPEx daily quote uses TPEX identity and official field names',()=>{
 const r=TPEX.normalizeDailyQuote({Date:'1150908',SecuritiesCompanyCode:'6488',CompanyName:'環球晶',Open:'455.5',High:'470',Low:'452',Close:'468',TradingShares:'1234567',TransactionAmount:'570000000',TransactionNumber:'8300',Change:'12.5'},{receivedAt:Date.parse('2026-09-08T14:00:00+08:00')});
 assert.equal(r.instrument.instrumentId,'TPEX:6488');assert.equal(r.observations.find(x=>x.field==='price.close').value,468);assert.equal(r.observations.find(x=>x.field==='turnover.value').value,570000000);
});

test('TWSE T86 preserves foreign trust dealer as separate evidence families',()=>{
 const payload={fields:['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'],data:[['2330','台積電','12,000,000','2,000,000','-500,000','13,500,000']]};
 const rows=TWSE.normalizeInstitutional(payload,{tradeDate:'20260908',receivedAt:Date.parse('2026-09-08T18:30:00+08:00')});
 const fields=Object.fromEntries(rows[0].observations.map(x=>[x.field,x.value]));assert.equal(fields['flow.foreign_net'],12000000);assert.equal(fields['flow.investment_trust_net'],2000000);assert.equal(fields['flow.dealer_net'],-500000);assert.equal(fields['flow.total_net'],13500000);
});

test('TPEx institutional rows preserve dealer-excluded foreign definition',()=>{
 const row={Date:'1150908',SecuritiesCompanyCode:'6488',CompanyName:'環球晶','Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference':'1000000','SecuritiesInvestmentTrustCompanies-Difference':'-250000','Dealers-Difference':'100000','TotalDifference':'850000'};
 const r=TPEX.normalizeInstitutionalRow(row,{receivedAt:Date.parse('2026-09-08T18:30:00+08:00')});
 const fields=Object.fromEntries(r.observations.map(x=>[x.field,x.value]));assert.equal(fields['flow.foreign_net'],1000000);assert.equal(fields['flow.investment_trust_net'],-250000);assert.equal(fields['flow.dealer_net'],100000);assert.equal(fields['flow.total_net'],850000);
});

test('invalid ROC dates are rejected instead of attributed to a fake session',()=>{
 assert.throws(()=>TPEX.normalizeDailyQuote({Date:'bad',SecuritiesCompanyCode:'6488',Close:'468'},{receivedAt:Date.now()}),/DATE_INVALID/);
});
