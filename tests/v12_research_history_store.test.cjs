const test=require('node:test');
const assert=require('node:assert/strict');
const TWSE=require('../v12/providers/twse_adapter.js');
const {createResearchHistoryStore}=require('../v12/staging/research_history_store.js');

function revenue(period='11507',receivedAt=Date.parse('2026-08-10T06:00:00Z'),symbol='2330',yoy='12.00'){
  return TWSE.normalizeMonthlyRevenue({
    '出表日期':'1150810','資料年月':period,'公司代號':symbol,'公司名稱':symbol==='2330'?'台積電':'鴻海','產業別':'半導體業',
    '營業收入-當月營收':'300,000,000','營業收入-上月營收':'290,000,000','營業收入-去年當月營收':'267,000,000',
    '營業收入-上月比較增減(%)':'3.45','營業收入-去年同月增減(%)':yoy,
    '累計營業收入-當月累計營收':'2,000,000,000','累計營業收入-去年累計營收':'1,800,000,000','累計營業收入-前期比較增減(%)':'11.11','備註':''
  },{receivedAt});
}

function quote(tradeDate='1150908',receivedAt=Date.parse('2026-09-08T06:00:00Z'),symbol='2330',close='1200'){
  return TWSE.normalizeDailyQuote({
    Date:tradeDate,Code:symbol,Name:symbol==='2330'?'台積電':'鴻海',OpeningPrice:'1180',HighestPrice:'1210',LowestPrice:'1170',ClosingPrice:close,
    Change:'+10',TradeVolume:'100000000',TradeValue:'120000000000',Transaction:'50000'
  },{receivedAt});
}

function flow(tradeDate='20260908',receivedAt=Date.parse('2026-09-08T06:01:00Z'),symbol='2330',foreign='12000000'){
  const payload={
    fields:['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'],
    data:[[symbol,symbol==='2330'?'台積電':'鴻海',foreign,'2000000','-500000','13500000']]
  };
  return TWSE.normalizeInstitutional(payload,{tradeDate,receivedAt})[0];
}

function session(dateRoc='1150908',dateAd='20260908',quoteAt=Date.parse('2026-09-08T06:00:00Z'),flowAt=Date.parse('2026-09-08T06:01:00Z'),symbol='2330',close='1200',foreign='12000000'){
  return Object.freeze({quote:quote(dateRoc,quoteAt,symbol,close),flow:flow(dateAd,flowAt,symbol,foreign)});
}

test('research history starts empty and never fabricates prior evidence',()=>{
  const store=createResearchHistoryStore();
  assert.equal(store.previousRevenue('TWSE:2330','2026-08'),null);
  assert.deepEqual(store.institutionalSessions('TWSE:2330'),[]);
});

test('monthly revenue accumulates forward and returns the latest earlier released period',()=>{
  const store=createResearchHistoryStore();
  const jul=revenue('11507',Date.parse('2026-08-10T06:00:00Z'));
  const aug=revenue('11508',Date.parse('2026-09-09T06:00:00Z'), '2330','24.07');
  assert.equal(store.recordRevenue(jul).status,'RECORDED');
  assert.equal(store.previousRevenue('TWSE:2330','2026-08'),jul);
  assert.equal(store.recordRevenue(aug).status,'RECORDED');
  assert.equal(store.previousRevenue('TWSE:2330','2026-09'),aug);
  assert.equal(store.previousRevenue('TWSE:2330','2026-08'),jul);
});

test('identical monthly revenue duplicate is idempotent and does not create duplicate history',()=>{
  const store=createResearchHistoryStore();
  const jul=revenue();
  assert.equal(store.recordRevenue(jul).status,'RECORDED');
  assert.equal(store.recordRevenue(jul).status,'IDEMPOTENT');
  assert.equal(store.previousRevenue('TWSE:2330','2026-08'),jul);
});

test('same monthly report period cannot be rewritten with different canonical content',()=>{
  const store=createResearchHistoryStore();
  store.recordRevenue(revenue('11507',Date.parse('2026-08-10T06:00:00Z'),'2330','12.00'));
  assert.throws(()=>store.recordRevenue(revenue('11507',Date.parse('2026-08-10T06:05:00Z'),'2330','15.00')),/RESEARCH_HISTORY_CONFLICT/);
});

test('older monthly report period arriving after newer history is rejected as backfill',()=>{
  const store=createResearchHistoryStore();
  store.recordRevenue(revenue('11508',Date.parse('2026-09-09T06:00:00Z'));
  assert.throws(()=>store.recordRevenue(revenue('11507',Date.parse('2026-09-10T06:00:00Z'))),/BACKFILL_FORBIDDEN/);
});

test('newer monthly report period cannot regress knowledge time',()=>{
  const store=createResearchHistoryStore();
  store.recordRevenue(revenue('11507',Date.parse('2026-08-10T06:00:00Z'));
  assert.throws(()=>store.recordRevenue(revenue('11508',Date.parse('2026-08-09T06:00:00Z'))),/TIME_REGRESSION/);
});

test('revenue history is isolated by instrument',()=>{
  const store=createResearchHistoryStore();
  const tsmc=revenue('11507',Date.parse('2026-08-10T06:00:00Z'),'2330');
  const honhai=revenue('11507',Date.parse('2026-08-10T06:00:00Z'),'2317');
  store.recordRevenue(tsmc);
  store.recordRevenue(honhai);
  assert.equal(store.previousRevenue('TWSE:2330','2026-08').instrument.instrumentId,'TWSE:2330');
  assert.equal(store.previousRevenue('TWSE:2317','2026-08').instrument.instrumentId,'TWSE:2317');
});

test('institutional quote and T86 pairs accumulate as ordered unique forward sessions',()=>{
  const store=createResearchHistoryStore();
  const s1=session('1150908','20260908');
  const s2=session('1150909','20260909',Date.parse('2026-09-09T06:00:00Z'),Date.parse('2026-09-09T06:01:00Z'));
  assert.equal(store.recordInstitutionalSession(s1).status,'RECORDED');
  assert.equal(store.recordInstitutionalSession(s2).status,'RECORDED');
  const rows=store.institutionalSessions('TWSE:2330');
  assert.deepEqual(rows.map(x=>x.quote.tradeDate),['2026-09-08','2026-09-09']);
  assert.equal(rows[0],s1);
  assert.equal(rows[1],s2);
});

test('identical institutional session duplicate is idempotent but same-date conflict cannot rewrite history',()=>{
  const store=createResearchHistoryStore();
  const first=session();
  store.recordInstitutionalSession(first);
  assert.equal(store.recordInstitutionalSession(first).status,'IDEMPOTENT');
  assert.throws(()=>store.recordInstitutionalSession(session('1150908','20260908',Date.parse('2026-09-08T06:00:00Z'),Date.parse('2026-09-08T06:01:00Z'),'2330','1210','12000000')),/RESEARCH_HISTORY_CONFLICT/);
  assert.equal(store.institutionalSessions('TWSE:2330').length,1);
});

test('older institutional trade date and knowledge-time regression are both rejected',()=>{
  const store=createResearchHistoryStore();
  store.recordInstitutionalSession(session('1150909','20260909',Date.parse('2026-09-09T06:00:00Z'),Date.parse('2026-09-09T06:01:00Z')));
  assert.throws(()=>store.recordInstitutionalSession(session('1150908','20260908',Date.parse('2026-09-10T06:00:00Z'),Date.parse('2026-09-10T06:01:00Z'))),/BACKFILL_FORBIDDEN/);

  const secondStore=createResearchHistoryStore();
  secondStore.recordInstitutionalSession(session('1150908','20260908',Date.parse('2026-09-08T06:00:00Z'),Date.parse('2026-09-08T06:01:00Z')));
  assert.throws(()=>secondStore.recordInstitutionalSession(session('1150909','20260909',Date.parse('2026-09-08T05:00:00Z'),Date.parse('2026-09-08T05:01:00Z'))),/TIME_REGRESSION/);
});

test('institutional sessions require same instrument and trade date and remain isolated by instrument',()=>{
  const store=createResearchHistoryStore();
  assert.throws(()=>store.recordInstitutionalSession({quote:quote('1150908',Date.parse('2026-09-08T06:00:00Z'),'2330'),flow:flow('20260908',Date.parse('2026-09-08T06:01:00Z'),'2317')}),/INSTRUMENT_MISMATCH/);
  assert.throws(()=>store.recordInstitutionalSession({quote:quote('1150908'),flow:flow('20260909',Date.parse('2026-09-09T06:01:00Z'))}),/TRADE_DATE_MISMATCH/);
  store.recordInstitutionalSession(session('1150908','20260908'));
  store.recordInstitutionalSession(session('1150908','20260908',Date.parse('2026-09-08T06:02:00Z'),Date.parse('2026-09-08T06:03:00Z'),'2317','200','1000000'));
  assert.equal(store.institutionalSessions('TWSE:2330').length,1);
  assert.equal(store.institutionalSessions('TWSE:2317').length,1);
});

test('institutional session retrieval can limit to most recent N without changing chronological order',()=>{
  const store=createResearchHistoryStore();
  store.recordInstitutionalSession(session('1150907','20260907',Date.parse('2026-09-07T06:00:00Z'),Date.parse('2026-09-07T06:01:00Z')));
  store.recordInstitutionalSession(session('1150908','20260908',Date.parse('2026-09-08T06:00:00Z'),Date.parse('2026-09-08T06:01:00Z')));
  store.recordInstitutionalSession(session('1150909','20260909',Date.parse('2026-09-09T06:00:00Z'),Date.parse('2026-09-09T06:01:00Z')));
  assert.deepEqual(store.institutionalSessions('TWSE:2330',{limit:2}).map(x=>x.quote.tradeDate),['2026-09-08','2026-09-09']);
  assert.throws(()=>store.institutionalSessions('TWSE:2330',{limit:0}),/LIMIT_INVALID/);
});

test('research history surface contains no execution or trading command',()=>{
  const store=createResearchHistoryStore();
  assert.deepEqual(Object.keys(store).sort(),['institutionalSessions','previousRevenue','recordInstitutionalSession','recordRevenue']);
  assert.doesNotMatch(JSON.stringify(Object.keys(store)).toLowerCase(),/order|trade|execute|fill|position/);
});
