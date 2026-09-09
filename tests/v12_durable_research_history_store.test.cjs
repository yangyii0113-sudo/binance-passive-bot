const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const TWSE=require('../v12/providers/twse_adapter.js');
const {createDurableResearchHistoryStore}=require('../v12/staging/durable_research_history_store.js');

function tempFile(name='history.research.jsonl'){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-v12-history-'));
  return path.join(dir,name);
}

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

function completeLines(file){
  if(!fs.existsSync(file))return [];
  return fs.readFileSync(file,'utf8').split('\n').filter(Boolean);
}

test('durable research history requires a dedicated research journal path and rejects sqlite ledger paths',()=>{
  assert.throws(()=>createDurableResearchHistoryStore({filePath:tempFile('foxyya_v2_paper.sqlite')}),/RESEARCH_JOURNAL_PATH_INVALID/);
  assert.throws(()=>createDurableResearchHistoryStore({filePath:tempFile('history.jsonl')}),/RESEARCH_JOURNAL_PATH_INVALID/);
});

test('monthly revenue survives restart and journal event preserves schema checksum and version references',()=>{
  const file=tempFile();
  const jul=revenue();
  const first=createDurableResearchHistoryStore({filePath:file,now:()=>Date.parse('2026-08-10T06:05:00Z')});
  assert.equal(first.recordRevenue(jul,{modelVersion:'tw-research/1',policyVersion:'tw-evidence/1'}).status,'RECORDED');
  const lines=completeLines(file);
  assert.equal(lines.length,1);
  const event=JSON.parse(lines[0]);
  assert.equal(event.schema,'foxyya-research-history-event/1');
  assert.equal(event.sequence,1);
  assert.equal(event.type,'REVENUE_RECORDED');
  assert.equal(event.modelVersion,'tw-research/1');
  assert.equal(event.policyVersion,'tw-evidence/1');
  assert.match(event.checksum,/^[a-f0-9]{64}$/);

  const restarted=createDurableResearchHistoryStore({filePath:file});
  assert.deepEqual(restarted.previousRevenue('TWSE:2330','2026-08'),jul);
});

test('institutional sessions survive restart in chronological order',()=>{
  const file=tempFile();
  const store=createDurableResearchHistoryStore({filePath:file});
  store.recordInstitutionalSession(session('1150908','20260908'));
  store.recordInstitutionalSession(session('1150909','20260909',Date.parse('2026-09-09T06:00:00Z'),Date.parse('2026-09-09T06:01:00Z')));
  const restarted=createDurableResearchHistoryStore({filePath:file});
  assert.deepEqual(restarted.institutionalSessions('TWSE:2330').map(x=>x.quote.tradeDate),['2026-09-08','2026-09-09']);
});

test('idempotent duplicate does not append another durable event',()=>{
  const file=tempFile();
  const store=createDurableResearchHistoryStore({filePath:file});
  const jul=revenue();
  assert.equal(store.recordRevenue(jul).status,'RECORDED');
  assert.equal(store.recordRevenue(jul).status,'IDEMPOTENT');
  assert.equal(completeLines(file).length,1);
});

test('conflict backfill and time regression are rejected before journal append',()=>{
  const file=tempFile();
  const store=createDurableResearchHistoryStore({filePath:file});
  store.recordRevenue(revenue('11508',Date.parse('2026-09-09T06:00:00Z')));
  const before=completeLines(file).length;
  assert.throws(()=>store.recordRevenue(revenue('11508',Date.parse('2026-09-09T06:05:00Z'),'2330','99.00')),/RESEARCH_HISTORY_CONFLICT/);
  assert.throws(()=>store.recordRevenue(revenue('11507',Date.parse('2026-09-10T06:00:00Z'))),/BACKFILL_FORBIDDEN/);
  assert.throws(()=>store.recordRevenue(revenue('11509',Date.parse('2026-09-08T06:00:00Z'))),/TIME_REGRESSION/);
  assert.equal(completeLines(file).length,before);
});

test('durable write failure does not advance in-memory research state',()=>{
  const file=tempFile();
  const failingFs=Object.assign({},fs,{openSync(){const e=new Error('disk unavailable');e.code='EIO';throw e;}});
  const store=createDurableResearchHistoryStore({filePath:file,fsImpl:failingFs});
  assert.throws(()=>store.recordRevenue(revenue()),/DURABLE_WRITE_FAILED/);
  assert.equal(store.previousRevenue('TWSE:2330','2026-08'),null);
});

test('trailing incomplete journal fragment is ignored on restart while complete history remains usable',()=>{
  const file=tempFile();
  const store=createDurableResearchHistoryStore({filePath:file});
  const jul=revenue();
  store.recordRevenue(jul);
  fs.appendFileSync(file,'{"schema":"foxyya-research-history-event/1"');
  const restarted=createDurableResearchHistoryStore({filePath:file});
  assert.deepEqual(restarted.previousRevenue('TWSE:2330','2026-08'),jul);
});

test('complete corrupted journal event fails closed instead of silently skipping history',()=>{
  const file=tempFile();
  const store=createDurableResearchHistoryStore({filePath:file});
  store.recordRevenue(revenue());
  fs.appendFileSync(file,JSON.stringify({schema:'foxyya-research-history-event/1',sequence:2,type:'REVENUE_RECORDED',checksum:'bad'})+'\n');
  assert.throws(()=>createDurableResearchHistoryStore({filePath:file}),/RESEARCH_JOURNAL_CORRUPT/);
});

test('checksum mismatch on an otherwise parseable complete event fails closed',()=>{
  const file=tempFile();
  const store=createDurableResearchHistoryStore({filePath:file});
  store.recordRevenue(revenue());
  const event=JSON.parse(completeLines(file)[0]);
  event.checksum='0'.repeat(64);
  fs.writeFileSync(file,JSON.stringify(event)+'\n');
  assert.throws(()=>createDurableResearchHistoryStore({filePath:file}),/RESEARCH_JOURNAL_CORRUPT/);
});

test('durable history surface remains research-only and exposes no correction or execution commands',()=>{
  const store=createDurableResearchHistoryStore({filePath:tempFile()});
  assert.deepEqual(Object.keys(store).sort(),['institutionalSessions','previousRevenue','recordInstitutionalSession','recordRevenue']);
  assert.doesNotMatch(JSON.stringify(Object.keys(store)).toLowerCase(),/update|delete|correct|order|trade|execute|fill|position/);
});
