const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../v12/early_trend/evidence_policy.js');
const {createOfficialSourceBindings}=require('../v12/staging/official_source_binding.js');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createStagingSourcePipeline}=require('../v12/staging/source_pipeline.js');
const {createProviderRuntimeGovernance}=require('../v12/providers/runtime_governance.js');

const nowMs=Date.parse('2026-09-09T06:30:00Z');
const quoteEndpoint='https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
const flowEndpoint='https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading';
const revenueEndpoint='https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O';

const policy=P.freezeEvidencePolicy({
  schemaVersion:'foxyya-evidence-policy/1',id:'tw-tpex-staging-v1',market:'TW',mode:'RESEARCH_CONTROL',createdAt:1,
  researchOnly:true,executionWrite:false,
  parameters:{institutionalFlow:{fullScaleRatio:0.05},institutionalPersistence:{minSessions:3,fullScaleAverageRatio:0.04},revenueAcceleration:{fullScalePct:20}}
});

function response(body,{status=200,headers={}}={}){
  const map=new Map(Object.entries({'content-type':'application/json; charset=utf-8',...headers}).map(([k,v])=>[k.toLowerCase(),String(v)]));
  return {ok:status>=200&&status<300,status,headers:{get(name){return map.get(String(name).toLowerCase())??null;}},async json(){return body;}};
}

function quoteRow(code='6488'){
  return {Date:'1150909',SecuritiesCompanyCode:code,CompanyName:code==='6488'?'環球晶':'世界',Open:'455.5',High:'470',Low:'452',Close:'468',TradingShares:'1234567',TransactionAmount:'570000000',TransactionNumber:'8300',Change:'12.5'};
}

function flowRow(code='6488'){
  return {Date:'1150909',SecuritiesCompanyCode:code,CompanyName:code==='6488'?'環球晶':'世界','Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference':'1000000','SecuritiesInvestmentTrustCompanies-Difference':'250000','Dealers-Difference':'100000','TotalDifference':'1350000'};
}

function revenueRow(code='6488'){
  return {'出表日期':'1150909','資料年月':'11508','公司代號':code,'公司名稱':code==='6488'?'環球晶':'世界','產業別':'半導體業','營業收入-當月營收':'8,000,000','營業收入-上月營收':'7,500,000','營業收入-去年當月營收':'6,500,000','營業收入-上月比較增減(%)':'6.67','營業收入-去年同月增減(%)':'23.08','累計營業收入-當月累計營收':'55,000,000','累計營業收入-去年累計營收':'46,000,000','累計營業收入-前期比較增減(%)':'19.57','備註':''};
}

function loader(result){return Object.freeze({load:async()=>result});}
function available(sourceId,data){return Object.freeze({status:'AVAILABLE',sourceId,receivedAt:nowMs,data,researchOnly:true,executionWrite:false});}

function tpexAsset(overrides={}){
  return {
    exchange:'TPEX',symbol:'6488',quoteEndpoint,flowEndpoint,revenueEndpoint,policy,
    institutionalSessions:[],researchEvidence:[],...overrides
  };
}

function harness(tableOverrides=new Map(),{governed=false}={}){
  let runtimeNow=nowMs;
  const table=new Map([
    [quoteEndpoint,response([quoteRow()])],
    [flowEndpoint,response([flowRow()])],
    [revenueEndpoint,response([revenueRow()])],
    ...tableOverrides
  ]);
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(!table.has(url))throw Error('unexpected url '+url);
    return table.get(url);
  };
  const service=createStagingHomeService();
  const providerGovernance=governed?createProviderRuntimeGovernance({clock:()=>runtimeNow,sleep:async ms=>{runtimeNow+=ms;},policy:{maxAttempts:1,baseDelayMs:1,maxDelayMs:10,failureThreshold:2,cooldownMs:1000,freshnessWarnMs:60000}}):undefined;
  const pipeline=createStagingSourcePipeline({fetchImpl,clock:()=>runtimeNow,publishHome:service.publishHome,providerGovernance});
  return {pipeline,service,calls,table,providerGovernance};
}

test('official source bindings expose TPEx quote flow and monthly revenue with exact TPEX identity',async()=>{
  const bindings=createOfficialSourceBindings();
  const quote=await bindings.tpexDailyQuote({loader:loader(available('tpex-openapi',[quoteRow(),quoteRow('5347')])),symbol:'6488'}).load();
  assert.equal(quote.status,'AVAILABLE');
  assert.equal(quote.sourceId,'tpex-openapi');
  assert.equal(quote.data.instrument.instrumentId,'TPEX:6488');
  assert.equal(quote.data.observations.find(x=>x.field==='price.close').source,'TPEX:tpex_mainboard_daily_close_quotes');

  const flow=await bindings.tpexInstitutional({loader:loader(available('tpex-openapi',[flowRow(),flowRow('5347')])),symbol:'6488'}).load();
  assert.equal(flow.status,'AVAILABLE');
  assert.equal(flow.data.instrument.instrumentId,'TPEX:6488');
  assert.equal(flow.data.observations.find(x=>x.field==='flow.total_net').value,1350000);

  const revenue=await bindings.tpexMonthlyRevenue({loader:loader(available('tpex-openapi',[revenueRow(),revenueRow('5347')])),symbol:'6488'}).load();
  assert.equal(revenue.status,'AVAILABLE');
  assert.equal(revenue.data.instrument.instrumentId,'TPEX:6488');
  assert.equal(revenue.data.reportPeriod,'2026-08');
  assert.equal(revenue.data.observations.find(x=>x.field==='fundamental.revenue.yoy_pct').source,'TPEX:mopsfin_t187ap05_O');

  assert.deepEqual(Object.keys(bindings).sort(),['blsSeries','ecbSeries','secCompanyFact','tpexDailyQuote','tpexInstitutional','tpexMonthlyRevenue','twseDailyQuote','twseInstitutional','twseMonthlyRevenue']);
});

test('TPEx quote flow and monthly revenue travel end-to-end through the same TW research semantics without identity conversion',async()=>{
  const {pipeline,calls}=harness();
  const result=await pipeline.run({nowMs,twAssets:[tpexAsset()]});
  assert.equal(result.orchestration.diagnostics.TW.length,1);
  assert.equal(result.orchestration.diagnostics.TW[0].status,'AVAILABLE');
  assert.equal(result.orchestration.diagnostics.TW[0].instrumentId,'TPEX:6488');
  assert.equal(result.orchestration.published.home.opportunities.TW.length,1);
  const opportunity=result.orchestration.published.home.opportunities.TW[0];
  assert.equal(opportunity.instrumentId,'TPEX:6488');
  assert.equal(opportunity.researchOnly,true);
  assert.equal(opportunity.executionWrite,false);
  assert.ok(opportunity.sourceLineage.includes('TPEX:tpex_mainboard_daily_close_quotes'));
  assert.ok(opportunity.sourceLineage.includes('TPEX:tpex_3insti_daily_trading'));
  assert.ok(opportunity.sourceLineage.includes('TPEX:mopsfin_t187ap05_O'));
  assert.equal(calls.length,3);
  assert.ok(calls.every(x=>x.url.startsWith('https://www.tpex.org.tw/')));
});

test('TPEx market probe is reported under sources.TPEX and never impersonates TWSE',async()=>{
  const {pipeline}=harness();
  const result=await pipeline.run({nowMs,twQuotes:[{exchange:'TPEX',symbol:'6488',endpoint:quoteEndpoint}]});
  assert.equal(result.sources.TPEX.length,1);
  assert.equal(result.sources.TPEX[0].status,'AVAILABLE');
  assert.equal(result.sources.TPEX[0].instrumentId,'TPEX:6488');
  assert.equal(result.sources.TWSE.length,0);
  assert.doesNotMatch(JSON.stringify(result.sources.TPEX),/TWSE:6488/);
});

test('TPEx provider health remains provider-local and separate from TWSE health',async()=>{
  const {pipeline}=harness(new Map(),{governed:true});
  const result=await pipeline.run({nowMs,twQuotes:[{exchange:'TPEX',symbol:'6488',endpoint:quoteEndpoint}]});
  assert.equal(result.providerHealth['tpex-openapi'].health,'HEALTHY');
  assert.equal(result.providerHealth['tpex-openapi'].researchOnly,true);
  assert.equal(result.providerHealth['tpex-openapi'].executionWrite,false);
  assert.equal(Object.hasOwn(result.providerHealth,'twse-openapi'),false);
});

test('missing TPEx target stays unavailable and never falls back to a TWSE or another OTC symbol',async()=>{
  const {pipeline}=harness(new Map([[quoteEndpoint,response([quoteRow('5347')])]]));
  const result=await pipeline.run({nowMs,twAssets:[tpexAsset()]});
  assert.equal(result.orchestration.published.home.opportunities.TW.length,0);
  assert.equal(result.orchestration.diagnostics.TW[0].status,'UNAVAILABLE');
  assert.equal(result.orchestration.diagnostics.TW[0].reason,'QUOTE_ENTITY_NOT_FOUND');
});

test('TPEx source failure removes only the TPEx asset and preserves independent TWSE market probe',async()=>{
  const twseEndpoint='https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
  const overrides=new Map([
    [flowEndpoint,response({}, {status:503})],
    [twseEndpoint,response([{Date:'1150909',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'10000',TradeValue:'1000000000',Transaction:'5000'}])]
  ]);
  const {pipeline}=harness(overrides);
  const result=await pipeline.run({
    nowMs,
    twQuotes:[{exchange:'TWSE',symbol:'2330',endpoint:twseEndpoint}],
    twAssets:[tpexAsset()]
  });
  assert.equal(result.sources.TWSE[0].status,'AVAILABLE');
  assert.equal(result.sources.TWSE[0].instrumentId,'TWSE:2330');
  assert.equal(result.orchestration.published.home.opportunities.TW.length,0);
  assert.equal(result.orchestration.diagnostics.TW[0].reason,'FLOW_HTTP_503');
});

test('unsupported Taiwan exchange fails closed during preflight before any network request',async()=>{
  let calls=0;
  const service=createStagingHomeService();
  const pipeline=createStagingSourcePipeline({fetchImpl:async()=>{calls++;return response([])},clock:()=>nowMs,publishHome:service.publishHome});
  await assert.rejects(()=>pipeline.run({nowMs,twQuotes:[{exchange:'OTC_GUESSED',symbol:'6488',endpoint:quoteEndpoint}]}),/TW_EXCHANGE_INVALID/);
  assert.equal(calls,0);
});
