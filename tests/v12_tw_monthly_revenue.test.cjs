const test=require('node:test');
const assert=require('node:assert/strict');
const TWSE=require('../v12/providers/twse_adapter.js');
const TPEX=require('../v12/providers/tpex_adapter.js');

const row={
  '出表日期':'1150701','資料年月':'11506','公司代號':'2330','公司名稱':'台積電','產業別':'半導體業',
  '營業收入-當月營收':'300,000,000','營業收入-上月營收':'280,000,000','營業收入-去年當月營收':'250,000,000',
  '營業收入-上月比較增減(%)':'7.14','營業收入-去年同月增減(%)':'20.00',
  '累計營業收入-當月累計營收':'1,650,000,000','累計營業收入-去年累計營收':'1,400,000,000','累計營業收入-前期比較增減(%)':'17.86',
  '備註':''
};
const receivedAt=Date.parse('2026-07-01T12:00:00+08:00');

test('TWSE monthly revenue preserves report period and uses receive time as knowledge time',()=>{
  const r=TWSE.normalizeMonthlyRevenue(row,{receivedAt});
  assert.equal(r.instrument.instrumentId,'TWSE:2330');
  assert.equal(r.reportPeriod,'2026-06');
  assert.equal(r.knowledgeTime,'RECEIVED_AT');
  const current=r.observations.find(x=>x.field==='fundamental.revenue.monthly');
  assert.equal(current.value,300000000);
  assert.equal(current.unit,'TWD_THOUSAND');
  assert.equal(current.observedAt,receivedAt);
  assert.equal(current.status,'SNAPSHOT');
  assert.equal(current.source,'TWSE:t187ap05_L');
});

test('TWSE monthly revenue keeps YoY and MoM percentages as separate observations',()=>{
  const r=TWSE.normalizeMonthlyRevenue(row,{receivedAt});
  const fields=Object.fromEntries(r.observations.map(x=>[x.field,x]));
  assert.equal(fields['fundamental.revenue.mom_pct'].value,7.14);
  assert.equal(fields['fundamental.revenue.yoy_pct'].value,20);
  assert.equal(fields['fundamental.revenue.ytd_yoy_pct'].value,17.86);
  assert.equal(fields['fundamental.revenue.yoy_pct'].unit,'PERCENT');
});

test('TPEx monthly revenue maps the same research concepts without changing exchange identity',()=>{
  const r=TPEX.normalizeMonthlyRevenue({...row,'公司代號':'6488','公司名稱':'環球晶'},{receivedAt});
  assert.equal(r.instrument.instrumentId,'TPEX:6488');
  assert.equal(r.reportPeriod,'2026-06');
  assert.equal(r.observations.find(x=>x.field==='fundamental.revenue.monthly').source,'TPEX:mopsfin_t187ap05_O');
});

test('monthly revenue missing values remain UNAVAILABLE rather than zero',()=>{
  const r=TWSE.normalizeMonthlyRevenue({...row,'營業收入-當月營收':'--'},{receivedAt});
  const current=r.observations.find(x=>x.field==='fundamental.revenue.monthly');
  assert.equal(current.value,null);
  assert.equal(current.status,'UNAVAILABLE');
});

test('monthly revenue rejects invalid ROC report month',()=>{
  assert.throws(()=>TWSE.normalizeMonthlyRevenue({...row,'資料年月':'11513'},{receivedAt}),/PERIOD_INVALID/);
});

test('generic provider dispatch supports monthly revenue dataset',()=>{
  assert.equal(TWSE.normalize('MONTHLY_REVENUE',row,{receivedAt}).reportPeriod,'2026-06');
  assert.equal(TPEX.normalize('MONTHLY_REVENUE',{...row,'公司代號':'6488'},{receivedAt}).instrument.exchange,'TPEX');
});
