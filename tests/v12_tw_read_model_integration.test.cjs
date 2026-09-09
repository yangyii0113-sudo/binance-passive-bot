const test=require('node:test');
const assert=require('node:assert/strict');
const TWSE=require('../v12/providers/twse_adapter.js');
const P=require('../v12/early_trend/evidence_policy.js');
const R=require('../v12/read_model/tw_asset_snapshot.js');

const policy=P.freezeEvidencePolicy({
  schemaVersion:'foxyya-evidence-policy/1',id:'tw-integration-v1',market:'TW',mode:'RESEARCH_CONTROL',createdAt:1,
  researchOnly:true,executionWrite:false,
  parameters:{institutionalFlow:{fullScaleRatio:0.05},institutionalPersistence:{minSessions:3,fullScaleAverageRatio:0.04},revenueAcceleration:{fullScalePct:20}}
});

function quote(date,volume,receivedAt){
  return TWSE.normalizeDailyQuote({Date:date,Code:'2330',Name:'台積電',OpeningPrice:'1000',HighestPrice:'1020',LowestPrice:'995',ClosingPrice:'1015',Change:'+15',TradeVolume:String(volume),TradeValue:'1000000000',Transaction:'5000'},{receivedAt});
}
function flow(tradeDate,net,receivedAt){
  const fields=['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'];
  return TWSE.normalizeInstitutional({fields,data:[['2330','台積電',String(net),'100','50',String(net+150)]]},{tradeDate,receivedAt})[0];
}
function revenue(period,outDate,yoy,receivedAt){
  return TWSE.normalizeMonthlyRevenue({
    '出表日期':outDate,'資料年月':period,'公司代號':'2330','公司名稱':'台積電','產業別':'半導體業',
    '營業收入-當月營收':'300000000','營業收入-上月營收':'280000000','營業收入-去年當月營收':'250000000',
    '營業收入-上月比較增減(%)':'7.14','營業收入-去年同月增減(%)':String(yoy),
    '累計營業收入-當月累計營收':'1650000000','累計營業收入-去年累計營收':'1400000000','累計營業收入-前期比較增減(%)':'17.86','備註':''
  },{receivedAt});
}

const t1=Date.parse('2026-06-29T14:00:00+08:00');
const t2=Date.parse('2026-06-30T14:00:00+08:00');
const t3=Date.parse('2026-07-01T14:00:00+08:00');
const revPrevAt=Date.parse('2026-06-01T12:00:00+08:00');
const revNowAt=Date.parse('2026-07-01T12:00:00+08:00');

test('TW official canonical data flows into Early Trend and TW Research without execution semantics',()=>{
  const q1=quote('1150629',10000,t1),q2=quote('1150630',10000,t2),q3=quote('1150701',10000,t3);
  const f1=flow('20260629',200,t1),f2=flow('20260630',300,t2),f3=flow('20260701',400,t3);
  const snapshot=R.buildTWAssetResearchSnapshot({
    policy,currentQuote:q3,currentFlow:f3,
    institutionalSessions:[{quote:q1,flow:f1},{quote:q2,flow:f2},{quote:q3,flow:f3}],
    currentRevenue:revenue('11506','1150701',20,revNowAt),previousRevenue:revenue('11505','1150601',8,revPrevAt),
    nowMs:t3
  });
  assert.equal(snapshot.schemaVersion,'foxyya-tw-asset-read-model/1');
  assert.equal(snapshot.instrumentId,'TWSE:2330');
  assert.equal(snapshot.researchOnly,true);
  assert.equal(snapshot.executionWrite,false);
  assert.equal(snapshot.earlyTrend.stage,'EARLY_WATCH');
  assert.equal(snapshot.earlyTrend.direction,'POSITIVE');
  assert.equal(snapshot.research.market,'TW');
  assert.equal(snapshot.research.researchOnly,true);
  assert.ok(snapshot.research.dimensions.INSTITUTIONAL);
  assert.ok(snapshot.research.dimensions.REVENUE);
  assert.ok(snapshot.research.missingDimensions.includes('TREND'));
  assert.ok(snapshot.sourceLineage.includes('TWSE:T86'));
  assert.ok(snapshot.sourceLineage.includes('TWSE:STOCK_DAY_ALL'));
  assert.ok(snapshot.sourceLineage.includes('TWSE:t187ap05_L'));
  for(const forbidden of ['order','placeOrder','executionState','executionAllowed'])assert.equal(Object.hasOwn(snapshot,forbidden),false);
});

test('TW read model rejects cross-instrument canonical inputs',()=>{
  const q=quote('1150701',10000,t3);
  const other=TWSE.normalizeMonthlyRevenue({
    '出表日期':'1150701','資料年月':'11506','公司代號':'2317','公司名稱':'鴻海','產業別':'電子','營業收入-當月營收':'1','營業收入-上月營收':'1','營業收入-去年當月營收':'1','營業收入-上月比較增減(%)':'0','營業收入-去年同月增減(%)':'0','累計營業收入-當月累計營收':'1','累計營業收入-去年累計營收':'1','累計營業收入-前期比較增減(%)':'0','備註':''
  },{receivedAt:revNowAt});
  assert.throws(()=>R.buildTWAssetResearchSnapshot({policy,currentQuote:q,currentFlow:flow('20260701',400,t3),institutionalSessions:[],currentRevenue:other,previousRevenue:null,nowMs:t3}),/INSTRUMENT_MISMATCH/);
});
