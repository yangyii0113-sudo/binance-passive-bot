'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createDurableSourceLineageStore}=require('../v12/staging/durable_source_lineage_store.js');
const Bootstrap=require('../v12/staging/live_research_bootstrap.js');

const nowMs=Date.parse('2026-09-09T06:30:00Z');

function response(status,body){
  return {ok:status>=200&&status<300,status,headers:{get(name){return String(name).toLowerCase()==='content-type'?'application/json; charset=utf-8':null;}},async json(){return body;}};
}
function twQuoteRow(){return {Date:'1150909',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'100000000',TradeValue:'121500000000',Transaction:'50000'};}
function twFlowPayload(){return {fields:['證券代號','證券名稱','外陸資買賣超股數(不含外資自營商)','投信買賣超股數','自營商買賣超股數','三大法人買賣超股數'],data:[['2330','台積電','4000000','1000000','-250000','4750000']]};}
function revenueRow(){return {'出表日期':'1150909','資料年月':'11508','公司代號':'2330','公司名稱':'台積電','產業別':'半導體業','營業收入-當月營收':'80000000','營業收入-上月營收':'75000000','營業收入-去年當月營收':'65000000','營業收入-上月比較增減(%)':'6.67','營業收入-去年同月增減(%)':'23.08','累計營業收入-當月累計營收':'550000000','累計營業收入-去年累計營收':'460000000','累計營業收入-前期比較增減(%)':'19.57','備註':''};}
function tpQuoteRow(){return {Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶',Open:'455.5',High:'470',Low:'452',Close:'468',Change:'12.5',TradingShares:'100000000',TransactionAmount:'46800000000',TransactionNumber:'83000'};}
function tpFlowRow(){return {Date:'1150909',SecuritiesCompanyCode:'6488',CompanyName:'環球晶','Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference':'4000000','SecuritiesInvestmentTrustCompanies-Difference':'1000000','Dealers-Difference':'-250000','TotalDifference':'4750000'};}
function secPayload(){return {cik:'1045810',facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{label:'Revenue',description:'Revenue',units:{USD:[{val:30000000000,accn:'0001',form:'10-Q',filed:'2026-08-20',start:'2026-05-01',end:'2026-07-31',fy:2026,fp:'Q2'}]}}}}};}
function blsPayload(seriesID='CUUR0000SA0',value='326.5'){return {status:'REQUEST_SUCCEEDED',message:[],Results:{series:[{seriesID,data:[{year:'2026',period:'M08',periodName:'August',latest:'true',value:String(value)}]}]}};}
function ecbPayload(value='2.1'){return [{TIME_PERIOD:'2026-08',OBS_VALUE:String(value),OBS_STATUS:'A'}];}
function twMarketPayload(){return {stat:'OK',date:'20260909',tables:[{title:'價格指數',fields:['指數','收盤指數','漲跌(+/-)','漲跌點數','漲跌百分比(%)','特殊處理註記'],data:[['發行量加權股價指數','25,500.00','+','250.00','0.99',''],['半導體類指數','820','+','16','2.0',''],['電機機械類指數','560','+','5','0.9',''],['鋼鐵類指數','120','-','1','-0.8','']]},{title:'漲跌證券數合計',fields:['類型','整體市場','股票'],data:[['上漲(漲停)','700(20)','700(20)'],['下跌(跌停)','200(3)','200(3)'],['持平','50','50'],['未成交','0','0'],['無比價','0','0']]}]};}
function tpexHighlight(){return [{Date:'1150909',ListedCompanyNumbers:'850',CloseIndex:'300',IndexChange:'3',PriceRiseCompanyNumbers:'600',LimitUpCompanyNumbers:'18',PriceDeclineCompanyNumbers:'200',LimitDownCompanyNumbers:'4',PriceFlatCompanyNumbers:'50',UnmatchedCompanyNumbersSuspensionStocksIncluded:'0'}];}
function tpexTurnover(){return [{Date:'1150909',Sector:'電子零組件業',TradeAmount:'51072604401',TradeWeight:'50.11',' NumberOfSharesTraded':'493814334'},{Date:'1150909',Sector:'半導體業',TradeAmount:'28237126414',TradeWeight:'14.84',' NumberOfSharesTraded':'146286717'}];}

function fixtures(input){
  const table=new Map([
    [input.twMarket.twse.endpoint,response(200,twMarketPayload())],
    [input.twMarket.tpex.highlightEndpoint,response(200,tpexHighlight())],
    [input.twMarket.tpex.industryTurnoverEndpoint,response(200,tpexTurnover())],
    [input.twAssets[0].quoteEndpoint,response(200,[twQuoteRow()])],
    [input.twAssets[0].flowEndpoint,response(200,twFlowPayload())],
    [input.twAssets[0].revenueEndpoint,response(200,[revenueRow()])],
    [input.twAssets[1].quoteEndpoint,response(200,[tpQuoteRow()])],
    [input.twAssets[1].flowEndpoint,response(200,tpFlowRow()? [tpFlowRow()] : [])],
    [input.usAssets[0].sec.endpoint,response(200,secPayload())]
  ]);
  const blsValues={CUUR0000SA0:'326.5',LNS14000000:'4.2',CES0000000001:'159500'};
  for(const item of input.regions.US.bls){
    const seriesID=Object.keys(item.definitions)[0];
    table.set(item.endpoint,response(200,blsPayload(seriesID,blsValues[seriesID])));
  }
  const ecbValues=['2.1','2.15','2.00'];
  input.regions.EU.ecb.forEach((item,index)=>table.set(item.endpoint,response(200,ecbPayload(ecbValues[index]))));
  return table;
}

const VM=require('../v12/ui/home_view_model.js');
const Renderer=require('../v12/ui/home_renderer.js');

async function runResearch(t, overrides={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-product-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const table=fixtures(Bootstrap.buildBootstrapInput(nowMs));
  const lineageStore=createDurableSourceLineageStore({filePath:path.join(dir,'product.lineage.jsonl'),now:()=>nowMs});
  const service=createStagingHomeService({lineageStore});
  const runtime=Bootstrap.createLiveResearchBootstrap({
    fetchImpl:async(url)=>overrides[url]||table.get(url),clock:()=>nowMs,lineageStore,publishHome:service.publishHome
  });
  return {result:await runtime.runOnce(),lineageStore};
}

test('completed source cycle publishes transport health and dataset diagnostics with Home',async t=>{
  const {result}=await runResearch(t);
  const read=result.orchestration.published;
  assert.ok(read.providerDiagnostics,'completed Home must include provider diagnostics');
  assert.equal(read.providerDiagnostics.providers.length,7);
  assert.equal(read.providerDiagnostics.datasets.length,15);
  const sec=read.providerDiagnostics.providers.find(x=>x.providerId==='sec-edgar');
  assert.equal(sec.health,'HEALTHY');
  assert.equal(sec.lastSuccessAt,nowMs);
  assert.equal(sec.lastHttpStatus,200);
  assert.equal(sec.freshnessMs,0);
  const twseMarket=read.providerDiagnostics.providers.find(x=>x.providerId==='twse-market');
  assert.equal(twseMarket.health,'HEALTHY');
  assert.equal(read.providerDiagnostics.status,'AVAILABLE');
  assert.equal(read.providerDiagnostics.researchOnly,true);
  assert.equal(read.providerDiagnostics.executionWrite,false);
});

test('canonical provider rejection remains visible even when HTTP succeeded',async t=>{
  const input=Bootstrap.buildBootstrapInput(nowMs);
  const {result}=await runResearch(t,{[input.twAssets[0].revenueEndpoint]:response(200,[])});
  const d=result.orchestration.published.providerDiagnostics;
  assert.ok(d,'canonical failures must be published');
  assert.equal(d.status,'DEGRADED');
  const revenue=d.datasets.find(x=>x.datasetId==='TWSE:t187ap05_L');
  assert.equal(revenue.status,'UNAVAILABLE');
  assert.ok(revenue.reason);
  assert.equal(result.orchestration.published.home.opportunities.TW.length,2);
});

test('Home keeps canonical values, observation times, SEC periods and explicit research gaps',async t=>{
  const {result,lineageStore}=await runResearch(t);
  const read=result.orchestration.published;
  const tw=read.home.opportunities.TW.find(x=>x.instrumentId==='TWSE:2330');
  assert.ok(tw,'2330 research must remain present regardless of rank ordering');
  assert.ok(tw.facts,'Home must preserve canonical facts');
  const close=tw.facts.find(x=>x.field==='price.close');
  assert.equal(close.value,1215);
  assert.equal(close.source,'TWSE:STOCK_DAY_ALL');
  assert.equal(close.status,'SNAPSHOT');
  assert.ok(close.observedAt<=close.receivedAt);
  assert.equal(tw.facts.find(x=>x.field==='flow.foreign_net').value,4000000);
  assert.equal(tw.facts.find(x=>x.field==='flow.investment_trust_net').value,1000000);
  assert.equal(tw.facts.find(x=>x.field==='flow.dealer_net').value,-250000);
  const us=read.home.opportunities.US.find(x=>x.instrumentId==='NASDAQ:NVDA');
  assert.ok(us,'NVDA research must remain present regardless of rank ordering');
  assert.deepEqual(us.dataGaps,{realtimeQuote:'UNAVAILABLE',consensus:'UNAVAILABLE',options:'UNAVAILABLE'});
  assert.equal(us.facts[0].value,30000000000);
  assert.equal(us.facts[0].reportEnd,'2026-07-31');
  assert.equal(us.facts[0].filedDate,'2026-08-20');
  assert.equal(us.facts[0].pointInTimeSafe,false);
  assert.equal(us.research.direction,'UNAVAILABLE');
  const view=VM.buildHomeViewModel(read);
  const viewUs=view.opportunities.US.find(x=>x.instrumentId==='NASDAQ:NVDA');
  const viewTw=view.opportunities.TW.find(x=>x.instrumentId==='TWSE:2330');
  assert.equal(viewUs.lineageRef,us.lineageRef);
  assert.equal(viewTw.facts[0].source,tw.facts[0].source);
  assert.equal(viewUs.dataGaps.options,'UNAVAILABLE');
  assert.ok(lineageStore.traceOutput(viewUs.lineageRef));
  const html=Renderer.renderHomeSections(view);
  assert.match(html.opportunitiesHtml,/30,000,000,000/);
  assert.match(html.opportunitiesHtml,/2026-07-31/);
  assert.match(html.opportunitiesHtml,/UNAVAILABLE/);
  assert.match(html.opportunitiesHtml,/data-lineage-ref="out_[a-f0-9]{64}"/);
  assert.match(html.diagnosticsHtml,/SEC/);
});

test('Global overview shows macro facts without inventing regional direction',async t=>{
  const {result}=await runResearch(t);
  const view=VM.buildHomeViewModel(result.orchestration.published);
  assert.equal(view.regions.length,7);
  const us=view.regions.find(x=>x.region==='US');
  assert.equal(us.bias,'UNAVAILABLE');
  assert.ok(us.facts,'regional facts must survive presentation');
  assert.equal(us.facts.length,3);
  assert.equal(us.facts.find(x=>x.field==='inflation.cpi_index').value,326.5);
  assert.equal(us.facts.find(x=>x.field==='labor.unemployment_rate').value,4.2);
  assert.equal(us.facts.find(x=>x.field==='employment.nonfarm_payroll').value,159500);
  const tw=view.regions.find(x=>x.region==='TW');
  assert.equal(tw.status,'AVAILABLE');
  assert.ok(tw.facts.some(x=>x.field==='market.index.taiex.close'));
  assert.ok(tw.facts.some(x=>x.field==='market.index.otc.close'));
  assert.equal(view.regions.find(x=>x.region==='JP').status,'UNAVAILABLE');
  assert.equal(view.regions.find(x=>x.region==='JP').facts.length,0);
  const html=Renderer.renderHomeSections(view).regionsHtml;
  assert.match(html,/326.5/);
  assert.match(html,/美國失業率/);
  assert.match(html,/美國非農就業人數/);
  assert.match(html,/BLS/);
  assert.match(html,/data-lineage-ref/);
});

test('one regional macro source failure is isolated and valid sibling facts remain available',async t=>{
  const input=Bootstrap.buildBootstrapInput(nowMs);
  const {result}=await runResearch(t,{[input.regions.EU.ecb[0].endpoint]:{
    ok:true,status:200,headers:{get(){return 'text/csv'}},json(){throw Error('must not parse')}
  }});
  const read=result.orchestration.published;
  assert.ok(read.providerDiagnostics,'non-JSON failures must be diagnosed');
  const failed=read.providerDiagnostics.datasets.find(x=>x.datasetId===input.regions.EU.ecb[0].definition.seriesKey||x.datasetId==='ECB:'+input.regions.EU.ecb[0].definition.seriesKey);
  assert.ok(failed);
  assert.equal(failed.reason,'CONTENT_TYPE_INVALID');
  const eu=VM.buildHomeViewModel(read).regions.find(x=>x.region==='EU');
  assert.equal(eu.status,'AVAILABLE','other valid ECB sources keep EU partial coverage available');
  assert.equal(eu.facts.length,2);
  assert.equal(eu.facts.some(x=>x.field==='rates.main_refinancing'),true);
  assert.equal(eu.facts.some(x=>x.field==='rates.deposit_facility'),true);
});


test('thrown canonical schema failures publish a failed dataset instead of false healthy status',async t=>{
  const input=Bootstrap.buildBootstrapInput(nowMs);
  const {result}=await runResearch(t,{[input.twAssets[0].revenueEndpoint]:response(200,{})});
  const read=result.orchestration.published;
  assert.equal(read.providerDiagnostics.status,'DEGRADED');
  const row=read.providerDiagnostics.datasets.find(x=>x.datasetId==='TWSE:t187ap05_L');
  assert.equal(row.status,'UNAVAILABLE');
  assert.equal(row.reason,'TWSE_MONTHLY_REVENUE_PAYLOAD_REQUIRED');
  assert.equal(read.home.opportunities.TW.length,2,'optional missing revenue does not discard quote and flow');
});

test('macro read model chooses newest reported period independently of provider array order',async t=>{
  const input=Bootstrap.buildBootstrapInput(nowMs);
  const bls=blsPayload('CUUR0000SA0','326.5');
  bls.Results.series[0].data=[{year:'2026',period:'M07',value:'325.0'},{year:'2026',period:'M08',value:'326.5'}];
  const {result}=await runResearch(t,{[input.regions.US.bls[0].endpoint]:response(200,bls)});
  const fact=VM.buildHomeViewModel(result.orchestration.published).regions.find(x=>x.region==='US').facts.find(x=>x.field==='inflation.cpi_index');
  assert.equal(fact.value,326.5);
  assert.equal(fact.reportPeriod,'2026-08');
});
