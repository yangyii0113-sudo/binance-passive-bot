'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {createOfficialSourceBindings}=require('../v12/staging/official_source_binding.js');
const {buildBootstrapInput}=require('../v12/staging/live_research_bootstrap.js');
const {buildMarketCoverage}=require('../v12/read_model/market_coverage.js');

function row(name,code,date='2026-09-08'){
  return {
    report_date_as_yyyy_mm_dd:date,
    cftc_contract_market_code:code,
    market_and_exchange_names:name,
    contract_market_name:name,
    commodity_name:name,
    open_interest_all:'100000',
    asset_mgr_positions_long:'42000',
    asset_mgr_positions_short:'18000',
    asset_mgr_positions_spread:'6000',
    lev_money_positions_long:'21000',
    lev_money_positions_short:'30000',
    lev_money_positions_spread:'5000',
    dealer_positions_long_all:'15000',
    dealer_positions_short_all:'27000'
  };
}

test('official CFTC binding keeps only latest US equity-index positioning rows and remains read-only',async()=>{
  const loader={load:async()=>Object.freeze({
    status:'AVAILABLE',sourceId:'cftc-cot',fetchStartedAt:5900,receivedAt:6000,
    data:Object.freeze([
      row('E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE','13874A','2026-09-08'),
      row('NASDAQ-100 STOCK INDEX - CHICAGO MERCANTILE EXCHANGE','209742','2026-09-08'),
      row('2-YEAR U.S. TREASURY NOTES - CHICAGO BOARD OF TRADE','042601','2026-09-08'),
      row('E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE','13874A','2026-09-01')
    ]),researchOnly:true,executionWrite:false
  })};
  const binding=createOfficialSourceBindings().cftcTffEquityIndex({loader});
  const result=await binding.load();
  assert.equal(result.status,'AVAILABLE');
  assert.equal(result.sourceId,'cftc-cot');
  assert.equal(result.lineageMeta.datasetId,'CFTC:TFF:gpe5-46if:EQUITY_INDEX');
  assert.equal(result.data.series.length,2);
  assert.deepEqual(result.data.series.map(x=>x.contractCode).sort(),['13874A','209742']);
  assert.ok(result.data.series.every(x=>x.reportDate==='2026-09-08'));
  assert.ok(result.data.series.every(x=>x.observations.some(o=>o.field==='positioning.cot.asset_manager.net')));
  assert.equal(result.researchOnly,true);
  assert.equal(result.executionWrite,false);
});

test('live bootstrap declares a public CFTC TFF input for US without claiming index or breadth readiness',()=>{
  const input=buildBootstrapInput(Date.parse('2026-09-14T12:00:00Z'));
  assert.ok(Array.isArray(input.regions.US.cftc));
  assert.equal(input.regions.US.cftc.length,1);
  assert.match(input.regions.US.cftc[0].endpoint,/publicreporting\.cftc\.gov\/resource\/gpe5-46if\.json/);
});

test('available CFTC runtime evidence adds FUTURES_POSITIONING but does not falsely unlock US direction readiness',()=>{
  const coverage=buildMarketCoverage({
    asOf:6000,
    providerDiagnostics:{datasets:[{
      sourceId:'cftc-cot',datasetId:'CFTC:TFF:gpe5-46if:EQUITY_INDEX',subjectId:'REGION:US',
      status:'AVAILABLE',reason:null,receivedAt:6000,observedAt:6000
    }]},
    home:{
      opportunities:{US:[{instrumentId:'NASDAQ:NVDA'}]},
      regions:[{region:'US',status:'AVAILABLE',asOf:6000,facts:[{field:'inflation.cpi_index',value:300,status:'SNAPSHOT'}]}],
      marketPulse:[],events:[]
    }
  });
  const us=coverage.markets.US;
  assert.ok(us.availableCapabilities.includes('FUTURES_POSITIONING'));
  assert.equal(us.coverageStatus,'BLOCKED');
  assert.notEqual(us.directionReadiness,'READY');
  assert.ok(us.missingCapabilities.includes('INDEX'));
  assert.ok(us.missingCapabilities.includes('MARKET_BREADTH'));
  assert.ok(us.missingCapabilities.includes('VOLATILITY_CONTEXT'));
  assert.ok(us.missingCapabilities.includes('QUOTE'));
});
