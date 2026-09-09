const test=require('node:test');
const assert=require('node:assert/strict');
const {createStagingHomeService}=require('../v12/staging/home_service.js');
const {createStagingSourcePipeline}=require('../v12/staging/source_pipeline.js');

const nowMs=Date.parse('2026-09-09T06:30:00Z');
const instrument=Object.freeze({instrumentId:'NASDAQ:NVDA',exchange:'NASDAQ',symbol:'NVDA',market:'US',region:'US',currency:'USD',timezone:'America/New_York',assetType:'EQUITY'});

function response(body,{status=200}={}){
  return {ok:status>=200&&status<300,status,headers:{get(){return 'application/json; charset=utf-8'}},async json(){return body}};
}

function fixtures(){
  return new Map([
    ['https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',response([{Date:'1150909',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'10000',TradeValue:'1000000000',Transaction:'5000'}])],
    ['https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json',response({cik:'1045810',facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{label:'Revenue',description:'Revenue',units:{USD:[{val:30000000000,accn:'0001',form:'10-Q',filed:'2026-08-20',start:'2026-05-01',end:'2026-07-31',fy:2026,fp:'Q2'}]}}}}})],
    ['https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0',response({status:'REQUEST_SUCCEEDED',message:[],Results:{series:[{seriesID:'CUUR0000SA0',data:[{year:'2026',period:'M08',periodName:'August',latest:'true',value:'326.5'}]}]}})],
    ['https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR',response([{TIME_PERIOD:'2026-08',OBS_VALUE:'2.1',OBS_STATUS:'A'}])]
  ]);
}

function createPipeline(overrides={}){
  const calls=[];
  const table=fixtures();
  const fetchImpl=overrides.fetchImpl||(async(url,init)=>{
    calls.push({url,init});
    if(!table.has(url))throw Error('unexpected url '+url);
    return table.get(url);
  });
  const service=createStagingHomeService();
  const pipeline=createStagingSourcePipeline({fetchImpl,clock:()=>nowMs,publishHome:service.publishHome});
  return {pipeline,service,calls,table};
}

function config(){
  return {
    nowMs,
    twQuotes:[{symbol:'2330',endpoint:'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'}],
    usAssets:[{
      instrument,
      sec:{endpoint:'https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json',taxonomy:'us-gaap',concept:'RevenueFromContractWithCustomerExcludingAssessedTax',unit:'USD'},
      researchEvidence:[],earlyEvidence:[]
    }],
    regions:{
      US:{bls:[{endpoint:'https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0',definitions:{CUUR0000SA0:{entityId:'MACRO:US:CPI',scope:'US',field:'inflation.cpi_index',unit:'INDEX'}}}]},
      EU:{ecb:[{endpoint:'https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR',definition:{seriesKey:'ICP.M.U2.N.000000.4.ANR',entityId:'MACRO:EU:HICP',scope:'EU',field:'inflation.hicp_yoy',unit:'PCT'}}]}
    }
  };
}

test('source pipeline composes approved public loaders, official bindings and orchestrator into one published home snapshot',async()=>{
  const {pipeline,calls}=createPipeline();
  const result=await pipeline.run(config());
  assert.equal(result.schemaVersion,'foxyya-staging-source-pipeline-result/1');
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
  assert.equal(result.orchestration.published.schemaVersion,'foxyya-home-read-model/1');
  assert.equal(result.orchestration.published.home.opportunities.US.length,1);
  assert.equal(result.orchestration.published.home.opportunities.TW.length,0,'TW quote alone must not become TW research opportunity');
  assert.equal(result.sources.TWSE[0].status,'AVAILABLE');
  assert.equal(result.sources.TWSE[0].instrumentId,'TWSE:2330');
  assert.equal(result.orchestration.diagnostics.REGIONS.US.status,'AVAILABLE');
  assert.equal(result.orchestration.diagnostics.REGIONS.EU.status,'AVAILABLE');
  assert.equal(calls.length,4);
  for(const call of calls){assert.equal(call.init.method,'GET');assert.equal(call.init.redirect,'error')}
});

test('SEC transport failure removes only the US asset while regional and TW source probes still publish honestly',async()=>{
  const table=fixtures();
  table.set('https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json',response({}, {status:503}));
  const calls=[];
  const {pipeline}=createPipeline({fetchImpl:async(url,init)=>{calls.push({url,init});return table.get(url)}});
  const result=await pipeline.run(config());
  assert.equal(result.orchestration.published.home.opportunities.US.length,0);
  assert.equal(result.orchestration.diagnostics.US[0].status,'UNAVAILABLE');
  assert.equal(result.orchestration.diagnostics.US[0].reason,'HTTP_503');
  assert.equal(result.sources.TWSE[0].status,'AVAILABLE');
  assert.equal(result.orchestration.diagnostics.REGIONS.US.status,'AVAILABLE');
  assert.equal(result.orchestration.diagnostics.REGIONS.EU.status,'AVAILABLE');
});

test('all unavailable regional sources stay unavailable instead of becoming neutral context',async()=>{
  const table=fixtures();
  table.set('https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0',response({}, {status:503}));
  const {pipeline}=createPipeline({fetchImpl:async url=>table.get(url)});
  const result=await pipeline.run(config());
  assert.equal(result.orchestration.diagnostics.REGIONS.US.status,'UNAVAILABLE');
  assert.equal(result.orchestration.diagnostics.REGIONS.US.reason,'ALL_SOURCES_UNAVAILABLE');
  const usRegion=result.orchestration.published.home.regions.find(x=>x.region==='US');
  assert.equal(usRegion.status,'UNAVAILABLE');
});

test('forbidden endpoint is rejected before fetch and does not publish a partial invalid run',async()=>{
  let calls=0;
  const {pipeline}=createPipeline({fetchImpl:async()=>{calls++;return response([])}});
  const bad=config();
  bad.usAssets[0].sec.endpoint='https://example.com/companyfacts.json';
  await assert.rejects(()=>pipeline.run(bad),/SOURCE_ENDPOINT_FORBIDDEN/);
  assert.equal(calls,0);
});

test('source pipeline surface is run-only and carries no execution command',()=>{
  const {pipeline}=createPipeline();
  assert.deepEqual(Object.keys(pipeline),['run']);
  assert.doesNotMatch(JSON.stringify(Object.keys(pipeline)).toLowerCase(),/order|trade|execute|fill/);
});
