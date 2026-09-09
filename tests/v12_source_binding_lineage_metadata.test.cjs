const test=require('node:test');
const assert=require('node:assert/strict');
const {createPublicSourceLoader}=require('../v12/staging/public_source_loader.js');
const {createOfficialSourceBindings}=require('../v12/staging/official_source_binding.js');
const {createProviderRuntimeGovernance}=require('../v12/providers/runtime_governance.js');

const twseQuote='https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';

function response(status,body,{headers={}}={}){
  const map=new Map(Object.entries({'content-type':'application/json',...headers}).map(([k,v])=>[k.toLowerCase(),String(v)]));
  return {ok:status>=200&&status<300,status,headers:{get(name){return map.get(String(name).toLowerCase())??null;}},async json(){return body;}};
}
function quoteRow(){return {Date:'1150909',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'10000',TradeValue:'1000000000',Transaction:'5000'};}
function tpexQuoteRow(){return {Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶',Open:'455.5',High:'470',Low:'452',Close:'468',TradingShares:'1234567',TransactionAmount:'570000000',TransactionNumber:'8300',Change:'12.5'};}
function tpexFlowRow(){return {Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶','Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference':'1000000','SecuritiesInvestmentTrustCompanies-Difference':'250000','Dealers-Difference':'100000','TotalDifference':'1350000'};}
function revenueRow(code='2330'){return {'出表日期':'1150909','資料年月':'11508','公司代號':code,'公司名稱':code==='2330'?'台積電':'環球晶','產業別':'半導體業','營業收入-當月營收':'8,000,000','營業收入-上月營收':'7,500,000','營業收入-去年當月營收':'6,500,000','營業收入-上月比較增減(%)':'6.67','營業收入-去年同月增減(%)':'23.08','累計營業收入-當月累計營收':'55,000,000','累計營業收入-去年累計營收':'46,000,000','累計營業收入-前期比較增減(%)':'19.57','備註':''};}
function tpexRevenueRow(){return revenueRow('6488');}
function loaderEnvelope(sourceId,data,{fetchStartedAt=100,receivedAt=200,status='AVAILABLE',reason=null}={}){
  return Object.freeze({status,sourceId,reason:status==='AVAILABLE'?undefined:reason,fetchStartedAt,receivedAt,data:status==='AVAILABLE'?data:null,researchOnly:true,executionWrite:false});
}
function staticLoader(envelope){return Object.freeze({load:async()=>envelope});}
function nvda(){return Object.freeze({instrumentId:'NASDAQ:NVDA',exchange:'NASDAQ',symbol:'NVDA',market:'US',region:'US',currency:'USD',timezone:'America/New_York',assetType:'EQUITY'});}
function assertMeta(meta,expected){
  assert.equal(Object.isFrozen(meta),true);
  assert.deepEqual(meta,{...expected,researchOnly:true,executionWrite:false});
  assert.doesNotMatch(JSON.stringify(meta).toLowerCase(),/api.?key|secret|token|password|credential|buy|sell|order|execute|fill|position/);
}

test('public loader records the complete logical fetch window without fabricating timing before network access',async()=>{
  let now=1000;
  let calls=0;
  const loader=createPublicSourceLoader({sourceId:'twse-openapi',endpoint:twseQuote,clock:()=>now,fetchImpl:async()=>{calls++;now=1125;return response(200,[quoteRow()]);}});
  const result=await loader.load();
  assert.equal(calls,1);
  assert.equal(result.fetchStartedAt,1000);
  assert.equal(result.receivedAt,1125);

  let blockedCalls=0;
  const blocked=createPublicSourceLoader({sourceId:'krx-openapi',endpoint:'https://data.krx.co.kr/example',clock:()=>2000,fetchImpl:async()=>{blockedCalls++;return response(200,{})}});
  const blockedResult=await blocked.load();
  assert.equal(blockedCalls,0);
  assert.equal(blockedResult.fetchStartedAt,null);
  assert.equal(blockedResult.receivedAt,null);
});

test('governed retry preserves first network-attempt start and terminal receive time',async()=>{
  let now=3000;
  const sleeps=[];
  const governance=createProviderRuntimeGovernance({clock:()=>now,sleep:async ms=>{sleeps.push(ms);now+=ms;},policy:{maxAttempts:2,baseDelayMs:100,maxDelayMs:1000,failureThreshold:3,cooldownMs:5000,freshnessWarnMs:60000}});
  let calls=0;
  const loader=createPublicSourceLoader({sourceId:'twse-openapi',endpoint:twseQuote,clock:()=>now,governance,fetchImpl:async()=>{calls++;now+=25;return calls===1?response(503,{}):response(200,[quoteRow()]);}});
  const result=await loader.load();
  assert.equal(calls,2);
  assert.deepEqual(sleeps,[100]);
  assert.equal(result.fetchStartedAt,3000);
  assert.equal(result.receivedAt,3150);
});

test('network-touched unavailable loader preserves fetch timing while circuit-blocked load has no fabricated timing',async()=>{
  let now=4000;
  const governance=createProviderRuntimeGovernance({clock:()=>now,sleep:async()=>{},policy:{maxAttempts:1,baseDelayMs:1,maxDelayMs:10,failureThreshold:1,cooldownMs:5000,freshnessWarnMs:60000}});
  let calls=0;
  const loader=createPublicSourceLoader({sourceId:'twse-openapi',endpoint:twseQuote,clock:()=>now,governance,fetchImpl:async()=>{calls++;now=4075;throw Error('offline')}});
  const first=await loader.load();
  assert.equal(first.fetchStartedAt,4000);
  assert.equal(first.receivedAt,4075);
  const second=await loader.load();
  assert.equal(second.reason,'CIRCUIT_OPEN');
  assert.equal(second.fetchStartedAt,null);
  assert.equal(second.receivedAt,null);
  assert.equal(calls,1);
});

test('Taiwan binding lineage metadata is explicit and dataset-specific for TWSE and TPEx',async()=>{
  const b=createOfficialSourceBindings();
  const tq=await b.twseDailyQuote({loader:staticLoader(loaderEnvelope('twse-openapi',[quoteRow()])),symbol:'2330'}).load();
  assertMeta(tq.lineageMeta,{sourceId:'twse-openapi',datasetId:'TWSE:STOCK_DAY_ALL',bindingId:'twse-daily-quote',bindingVersion:'foxyya-binding/twse-daily-quote/1',adapterId:'twse-official',adapterVersion:'foxyya-adapter/twse/1',canonicalSchemaVersion:'foxyya-observation/1'});
  assert.equal(tq.fetchStartedAt,100);

  const tf=await b.twseInstitutional({loader:staticLoader(loaderEnvelope('twse-t86',{fields:['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'],data:[['2330','台積電','1','2','3','6']]})),symbol:'2330',tradeDate:'20260909'}).load();
  assertMeta(tf.lineageMeta,{sourceId:'twse-t86',datasetId:'TWSE:T86',bindingId:'twse-institutional',bindingVersion:'foxyya-binding/twse-institutional/1',adapterId:'twse-official',adapterVersion:'foxyya-adapter/twse/1',canonicalSchemaVersion:'foxyya-observation/1'});

  const tr=await b.twseMonthlyRevenue({loader:staticLoader(loaderEnvelope('twse-openapi',[revenueRow()])),symbol:'2330'}).load();
  assertMeta(tr.lineageMeta,{sourceId:'twse-openapi',datasetId:'TWSE:t187ap05_L',bindingId:'twse-monthly-revenue',bindingVersion:'foxyya-binding/twse-monthly-revenue/1',adapterId:'twse-official',adapterVersion:'foxyya-adapter/twse/1',canonicalSchemaVersion:'foxyya-observation/1'});

  const oq=await b.tpexDailyQuote({loader:staticLoader(loaderEnvelope('tpex-openapi',[tpexQuoteRow()])),symbol:'6488'}).load();
  assertMeta(oq.lineageMeta,{sourceId:'tpex-openapi',datasetId:'TPEX:tpex_mainboard_daily_close_quotes',bindingId:'tpex-daily-quote',bindingVersion:'foxyya-binding/tpex-daily-quote/1',adapterId:'tpex-official',adapterVersion:'foxyya-adapter/tpex/1',canonicalSchemaVersion:'foxyya-observation/1'});

  const of=await b.tpexInstitutional({loader:staticLoader(loaderEnvelope('tpex-openapi',[tpexFlowRow()])),symbol:'6488'}).load();
  assertMeta(of.lineageMeta,{sourceId:'tpex-openapi',datasetId:'TPEX:tpex_3insti_daily_trading',bindingId:'tpex-institutional',bindingVersion:'foxyya-binding/tpex-institutional/1',adapterId:'tpex-official',adapterVersion:'foxyya-adapter/tpex/1',canonicalSchemaVersion:'foxyya-observation/1'});

  const or=await b.tpexMonthlyRevenue({loader:staticLoader(loaderEnvelope('tpex-openapi',[tpexRevenueRow()])),symbol:'6488'}).load();
  assertMeta(or.lineageMeta,{sourceId:'tpex-openapi',datasetId:'TPEX:mopsfin_t187ap05_O',bindingId:'tpex-monthly-revenue',bindingVersion:'foxyya-binding/tpex-monthly-revenue/1',adapterId:'tpex-official',adapterVersion:'foxyya-adapter/tpex/1',canonicalSchemaVersion:'foxyya-observation/1'});
});

test('SEC BLS and ECB binding metadata declares actual canonical schema families',async()=>{
  const b=createOfficialSourceBindings();
  const secPayload={cik:'1045810',facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{label:'Revenue',description:'Revenue',units:{USD:[{val:30000000000,accn:'0001',form:'10-Q',filed:'2026-08-20',start:'2026-05-01',end:'2026-07-31',fy:2026,fp:'Q2'}]}}}}};
  const sec=await b.secCompanyFact({loader:staticLoader(loaderEnvelope('sec-edgar',secPayload)),instrument:nvda(),taxonomy:'us-gaap',concept:'RevenueFromContractWithCustomerExcludingAssessedTax',unit:'USD'}).load();
  assertMeta(sec.lineageMeta,{sourceId:'sec-edgar',datasetId:'SEC:companyfacts',bindingId:'sec-company-fact',bindingVersion:'foxyya-binding/sec-company-fact/1',adapterId:'sec-edgar-official',adapterVersion:'foxyya-adapter/sec-edgar/1',canonicalSchemaVersion:'foxyya-observation/1'});

  const blsPayload={status:'REQUEST_SUCCEEDED',message:[],Results:{series:[{seriesID:'CUUR0000SA0',data:[{year:'2026',period:'M08',periodName:'August',latest:'true',value:'326.5'}]}]}};
  const bls=await b.blsSeries({loader:staticLoader(loaderEnvelope('bls-public',blsPayload)),definitions:{CUUR0000SA0:{entityId:'MACRO:US:CPI',scope:'US',field:'inflation.cpi_index',unit:'INDEX'}}}).load();
  assertMeta(bls.lineageMeta,{sourceId:'bls-public',datasetId:'BLS:PublicDataAPI',bindingId:'bls-series',bindingVersion:'foxyya-binding/bls-series/1',adapterId:'bls-official',adapterVersion:'foxyya-adapter/bls/1',canonicalSchemaVersion:'foxyya-context-observation/1'});

  const ecb=await b.ecbSeries({loader:staticLoader(loaderEnvelope('ecb-data',[{TIME_PERIOD:'2026-08',OBS_VALUE:'2.1',OBS_STATUS:'A'}])),definition:{seriesKey:'ICP.M.U2.N.000000.4.ANR',entityId:'MACRO:EU:HICP',scope:'EU',field:'inflation.hicp_yoy',unit:'PCT'}}).load();
  assertMeta(ecb.lineageMeta,{sourceId:'ecb-data',datasetId:'ECB:ICP.M.U2.N.000000.4.ANR',bindingId:'ecb-series',bindingVersion:'foxyya-binding/ecb-series/1',adapterId:'ecb-official',adapterVersion:'foxyya-adapter/ecb/1',canonicalSchemaVersion:'foxyya-context-observation/1'});
});

test('unavailable binding retains explicit lineage metadata and transport timing without fabricating canonical data',async()=>{
  const b=createOfficialSourceBindings();
  const result=await b.tpexDailyQuote({loader:staticLoader(loaderEnvelope('tpex-openapi',null,{status:'UNAVAILABLE',reason:'HTTP_503',fetchStartedAt:500,receivedAt:550})),symbol:'6488'}).load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.data,null);
  assert.equal(result.fetchStartedAt,500);
  assert.equal(result.receivedAt,550);
  assertMeta(result.lineageMeta,{sourceId:'tpex-openapi',datasetId:'TPEX:tpex_mainboard_daily_close_quotes',bindingId:'tpex-daily-quote',bindingVersion:'foxyya-binding/tpex-daily-quote/1',adapterId:'tpex-official',adapterVersion:'foxyya-adapter/tpex/1',canonicalSchemaVersion:'foxyya-observation/1'});
});

test('binding lineage metadata surface remains immutable research-only and contains no runtime inference fields',async()=>{
  const result=await createOfficialSourceBindings().twseDailyQuote({loader:staticLoader(loaderEnvelope('twse-openapi',[quoteRow()])),symbol:'2330'}).load();
  assert.deepEqual(Object.keys(result.lineageMeta).sort(),['adapterId','adapterVersion','bindingId','bindingVersion','canonicalSchemaVersion','datasetId','executionWrite','researchOnly','sourceId'].sort());
  assert.doesNotMatch(JSON.stringify(result).toLowerCase(),/api.?key|password|credentialvalue|bearer|orderid|positionid|executeorder/);
});
