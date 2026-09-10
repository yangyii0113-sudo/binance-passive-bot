'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Bootstrap=require('../v12/staging/live_research_bootstrap.js');
const {createStagingSourcePipeline}=require('../v12/staging/source_pipeline.js');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createDurableSourceLineageStore}=require('../v12/staging/durable_source_lineage_store.js');

const nowMs=Date.parse('2026-09-09T08:30:00Z');
function response(status,body){return {ok:status>=200&&status<300,status,headers:{get(name){return String(name).toLowerCase()==='content-type'?'application/json; charset=utf-8':null;}},async json(){return body;}}}
function miIndex(){return {stat:'OK',date:'20260909',tables:[{title:'價格指數',fields:['指數','收盤指數','漲跌(+/-)','漲跌點數','漲跌百分比(%)','特殊處理註記'],data:[['發行量加權股價指數','25,500.00','+','250.00','0.99',''],['半導體類指數','820','+','16','2.0',''],['電機機械類指數','560','+','5','0.9',''],['鋼鐵類指數','120','-','1','-0.8','']]},{title:'漲跌證券數合計',fields:['類型','整體市場','股票'],data:[['上漲(漲停)','700(20)','700(20)'],['下跌(跌停)','200(3)','200(3)'],['持平','50','50'],['未成交','0','0'],['無比價','0','0']]}]}}
function tpexHighlight(){return [{Date:'1150909',ListedCompanyNumbers:'850',CloseIndex:'300',IndexChange:'3',PriceRiseCompanyNumbers:'600',LimitUpCompanyNumbers:'18',PriceDeclineCompanyNumbers:'200',LimitDownCompanyNumbers:'4',PriceFlatCompanyNumbers:'50',UnmatchedCompanyNumbersSuspensionStocksIncluded:'0'}]}
function tpexTurnover(){return [{Date:'1150909',Sector:'電子零組件業',TradeAmount:'51072604401',TradeWeight:'50.11',' NumberOfSharesTraded':'493814334'},{Date:'1150909',Sector:'半導體業',TradeAmount:'28237126414',TradeWeight:'14.84',' NumberOfSharesTraded':'146286717'}]}

function marketInput(){return Object.freeze({
  nowMs,
  twMarket:Object.freeze({
    twse:Object.freeze({tradeDate:'20260909',endpoint:'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=20260909&type=ALLBUT0999&response=json'}),
    tpex:Object.freeze({tradeDate:'20260909',highlightEndpoint:'https://www.tpex.org.tw/openapi/v1/tpex_mainborad_highlight',industryTurnoverEndpoint:'https://www.tpex.org.tw/openapi/v1/tpex_trading_volume_ratio'})
  }),
  twAssets:Object.freeze([]),usAssets:Object.freeze([]),regions:Object.freeze({}),pulses:Object.freeze({}),events:Object.freeze([]),todayFocus:Object.freeze([])
})}

async function runWith(fetchImpl){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxyya-tw-market-live-'));
  const store=createDurableSourceLineageStore({filePath:path.join(dir,'tw-market.lineage.jsonl'),now:()=>nowMs});
  const service=createStagingHomeService({lineageStore:store});
  const pipeline=createStagingSourcePipeline({fetchImpl,clock:()=>nowMs,lineageStore:store,publishHome:service.publishHome});
  try{return {result:await pipeline.run(marketInput()),store}}
  finally{fs.rmSync(dir,{recursive:true,force:true})}
}

test('default live bootstrap declares official TWSE and TPEx market-core datasets for the current Taipei trade date',()=>{
  const input=Bootstrap.buildBootstrapInput(nowMs);
  assert.equal(input.twMarket.twse.tradeDate,'20260909');
  assert.match(input.twMarket.twse.endpoint,/www\.twse\.com\.tw\/rwd\/zh\/afterTrading\/MI_INDEX/);
  assert.equal(new URL(input.twMarket.twse.endpoint).searchParams.get('date'),'20260909');
  assert.equal(input.twMarket.tpex.highlightEndpoint,'https://www.tpex.org.tw/openapi/v1/tpex_mainborad_highlight');
  assert.equal(input.twMarket.tpex.industryTurnoverEndpoint,'https://www.tpex.org.tw/openapi/v1/tpex_trading_volume_ratio');
});

test('source pipeline publishes Taiwan Market Core into TW pulse, TW region, lineage and diagnostics atomically',async()=>{
  const table=new Map([[marketInput().twMarket.twse.endpoint,response(200,miIndex())],[marketInput().twMarket.tpex.highlightEndpoint,response(200,tpexHighlight())],[marketInput().twMarket.tpex.industryTurnoverEndpoint,response(200,tpexTurnover())]]);
  const {result,store}=await runWith(async url=>table.get(url)||response(404,{}));
  const home=result.orchestration.published.home;
  const pulse=home.marketPulse.find(row=>row.market==='TW');
  assert.equal(pulse.status,'AVAILABLE');
  assert.equal(pulse.state,'BROAD_ADVANCE');
  assert.equal(pulse.data.taiex.close,25500);
  assert.equal(pulse.data.otc.close,300);
  assert.equal(pulse.data.breadth.combined.advancers,1300);
  assert.equal(pulse.data.industries.twseLeaders[0].name,'半導體類');
  assert.equal(pulse.data.industries.tpexTurnoverLeaders[0].name,'電子零組件業');

  const region=home.regions.find(row=>row.region==='TW');
  assert.equal(region.status,'AVAILABLE');
  assert.ok(region.facts.some(row=>row.field==='market.index.taiex.close'&&row.value===25500));
  assert.ok(region.facts.some(row=>row.field==='market.index.otc.close'&&row.value===300));
  assert.match(region.lineageRef,/^out_[a-f0-9]{64}$/);
  assert.ok(store.traceOutput(region.lineageRef));

  const datasets=result.orchestration.published.providerDiagnostics.datasets.map(row=>row.datasetId);
  for(const id of ['TWSE:MI_INDEX','TPEX:tpex_mainborad_highlight','TPEX:tpex_trading_volume_ratio'])assert.ok(datasets.includes(id),id);
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
});

test('TPEx market failure degrades Taiwan direction without erasing valid TWSE index breadth or region evidence',async()=>{
  const input=marketInput();
  const table=new Map([[input.twMarket.twse.endpoint,response(200,miIndex())],[input.twMarket.tpex.highlightEndpoint,response(503,{})],[input.twMarket.tpex.industryTurnoverEndpoint,response(503,{})]]);
  const {result}=await runWith(async url=>table.get(url)||response(404,{}));
  const home=result.orchestration.published.home;
  const pulse=home.marketPulse.find(row=>row.market==='TW');
  assert.equal(pulse.status,'AVAILABLE');
  assert.equal(pulse.state,'UNAVAILABLE');
  assert.equal(pulse.data.directionCoverage,'PARTIAL');
  assert.equal(pulse.data.taiex.close,25500);
  assert.equal(pulse.data.otc,null);
  assert.ok(pulse.data.missingSources.includes('TPEX_MARKET_CORE'));
  const region=home.regions.find(row=>row.region==='TW');
  assert.equal(region.status,'AVAILABLE');
  assert.ok(region.facts.some(row=>row.field==='market.index.taiex.close'));
  assert.ok(!region.facts.some(row=>row.field==='market.index.otc.close'));
});
