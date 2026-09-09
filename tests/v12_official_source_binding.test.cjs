const test=require('node:test');
const assert=require('node:assert/strict');
const {createOfficialSourceBindings}=require('../v12/staging/official_source_binding.js');

const receivedAt=Date.parse('2026-09-09T06:30:00Z');
const available=(sourceId,data)=>Object.freeze({status:'AVAILABLE',sourceId,receivedAt,data,researchOnly:true,executionWrite:false});
const unavailable=(sourceId,reason)=>Object.freeze({status:'UNAVAILABLE',sourceId,reason,receivedAt:null,data:null,researchOnly:true,executionWrite:false});
const loader=result=>Object.freeze({load:async()=>result});

const instrument=Object.freeze({instrumentId:'NASDAQ:NVDA',exchange:'NASDAQ',symbol:'NVDA',market:'US',region:'US',currency:'USD',timezone:'America/New_York',assetType:'EQUITY'});

function bindings(){
  return createOfficialSourceBindings();
}

test('TWSE quote binding selects requested symbol and passes transport receive time into official adapter',async()=>{
  const source=available('twse-openapi',[
    {Date:'1150909',Code:'2330',Name:'台積電',OpeningPrice:'1200',HighestPrice:'1220',LowestPrice:'1190',ClosingPrice:'1215',Change:'+15',TradeVolume:'10000',TradeValue:'1000000000',Transaction:'5000'},
    {Date:'1150909',Code:'2317',Name:'鴻海',OpeningPrice:'200',HighestPrice:'205',LowestPrice:'198',ClosingPrice:'203',Change:'+3',TradeVolume:'5000',TradeValue:'100000000',Transaction:'1000'}
  ]);
  const result=await bindings().twseDailyQuote({loader:loader(source),symbol:'2330'}).load();
  assert.equal(result.status,'AVAILABLE');
  assert.equal(result.sourceId,'twse-openapi');
  assert.equal(result.receivedAt,receivedAt);
  assert.equal(result.data.instrument.instrumentId,'TWSE:2330');
  assert.equal(result.data.tradeDate,'2026-09-09');
  assert.equal(result.executionWrite,false);
  assert.equal(result.researchOnly,true);
});

test('TWSE quote binding returns explicit unavailable when symbol is absent rather than choosing another row',async()=>{
  const source=available('twse-openapi',[{Date:'1150909',Code:'2317',Name:'鴻海'}]);
  const result=await bindings().twseDailyQuote({loader:loader(source),symbol:'2330'}).load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.reason,'ENTITY_NOT_FOUND');
  assert.equal(result.data,null);
});

test('SEC company fact binding keeps actual filing data research-only and preserves adapter semantics',async()=>{
  const payload={cik:'1045810',facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{label:'Revenue',description:'Revenue',units:{USD:[{val:30000000000,accn:'0001',form:'10-Q',filed:'2026-08-20',start:'2026-05-01',end:'2026-07-31',fy:2026,fp:'Q2'}]}}}}};
  const result=await bindings().secCompanyFact({
    loader:loader(available('sec-edgar',payload)),instrument,taxonomy:'us-gaap',concept:'RevenueFromContractWithCustomerExcludingAssessedTax',unit:'USD'
  }).load();
  assert.equal(result.status,'AVAILABLE');
  assert.equal(result.data.source,'SEC:companyfacts');
  assert.equal(result.data.observations[0].instrumentId,'NASDAQ:NVDA');
  assert.equal(result.data.pointInTimeSafe,false);
});

test('BLS and ECB bindings pass explicit semantic definitions and receive time',async()=>{
  const blsPayload={status:'REQUEST_SUCCEEDED',message:[],Results:{series:[{seriesID:'CUUR0000SA0',data:[{year:'2026',period:'M08',periodName:'August',latest:'true',value:'326.5'}]}]}};
  const bls=await bindings().blsSeries({loader:loader(available('bls-public',blsPayload)),definitions:{CUUR0000SA0:{entityId:'MACRO:US:CPI',scope:'US',field:'inflation.cpi_index',unit:'INDEX'}}}).load();
  assert.equal(bls.status,'AVAILABLE');
  assert.equal(bls.data.series[0].observations[0].scope,'US');
  assert.equal(bls.data.receivedAt,receivedAt);

  const ecb=await bindings().ecbSeries({loader:loader(available('ecb-data',[{TIME_PERIOD:'2026-08',OBS_VALUE:'2.1',OBS_STATUS:'A'}])),definition:{seriesKey:'ICP.M.U2.N.000000.4.ANR',entityId:'MACRO:EU:HICP',scope:'EU',field:'inflation.hicp_yoy',unit:'PCT'}}).load();
  assert.equal(ecb.status,'AVAILABLE');
  assert.equal(ecb.data.observations[0].scope,'EU');
  assert.equal(ecb.data.receivedAt,receivedAt);
});

test('transport unavailable passes through without invoking adapter or fabricating data',async()=>{
  const result=await bindings().twseDailyQuote({loader:loader(unavailable('twse-openapi','HTTP_503')),symbol:'2330'}).load();
  assert.equal(result.status,'UNAVAILABLE');
  assert.equal(result.reason,'HTTP_503');
  assert.equal(result.data,null);
});

test('source-id mismatch and writable transport are validation failures, not downgraded unavailable',async()=>{
  await assert.rejects(()=>bindings().twseDailyQuote({loader:loader(available('sec-edgar',[])),symbol:'2330'}).load(),/SOURCE_ID_MISMATCH/);
  const unsafe={...available('twse-openapi',[]),executionWrite:true};
  await assert.rejects(()=>bindings().twseDailyQuote({loader:loader(unsafe),symbol:'2330'}).load(),/READ_ONLY_REQUIRED/);
});

test('binding factory surface is fixed and contains no execution methods',()=>{
  const api=bindings();
  assert.deepEqual(Object.keys(api).sort(),['blsSeries','ecbSeries','secCompanyFact','twseDailyQuote']);
  assert.doesNotMatch(JSON.stringify(Object.keys(api)).toLowerCase(),/order|trade|execute|fill/);
});
