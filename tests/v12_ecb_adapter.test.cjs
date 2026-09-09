const test=require('node:test');
const assert=require('node:assert/strict');
const ECB=require('../v12/providers/ecb_adapter.js');

function dataPortalPayload(){
  return {
    header:{id:'fixture',prepared:'2026-09-09T17:16:55.328+02:00'},
    dataSets:[{action:'Information',series:{'0:0:0:0:0:0':{observations:{
      '0':[2.1,1],
      '1':[null,2]
    }}}}],
    structure:{
      dimensions:{
        series:[
          {id:'FREQ',values:[{id:'M',name:'Monthly'}]},
          {id:'REF_AREA',values:[{id:'U2',name:'Euro area'}]},
          {id:'ADJUSTMENT',values:[{id:'N',name:'Neither seasonally nor working day adjusted'}]},
          {id:'ICP_ITEM',values:[{id:'000000',name:'HICP - Overall index'}]},
          {id:'STS_INSTITUTION',values:[{id:'4',name:'Eurostat'}]},
          {id:'ICP_SUFFIX',values:[{id:'ANR',name:'Annual rate of change'}]}
        ],
        observation:[{id:'TIME_PERIOD',values:[{id:'2026-08',name:'2026-08'},{id:'2026-09',name:'2026-09'}]}]
      },
      attributes:{observation:[{id:'OBS_STATUS',values:[{id:'A',name:'Normal value'},{id:'E',name:'Estimated value'},{id:'M',name:'Missing value'}]}]}
    }
  };
}

test('ECB descriptor is read-only and server-side',()=>{
  assert.equal(ECB.descriptor.executionWrite,false);
  assert.equal(ECB.descriptor.serverOnly,true);
  assert.deepEqual(ECB.descriptor.markets,['EU','GLOBAL']);
  assert.ok(ECB.descriptor.capabilities.includes('MACRO'));
});

test('ECB SDMX rows normalize into context observations without pretending reference period is knowledge time',()=>{
  const receivedAt=Date.parse('2026-09-09T02:00:00Z');
  const out=ECB.normalizeSeries([
    {TIME_PERIOD:'2026-08-01',OBS_VALUE:'2.00',OBS_STATUS:'A'},
    {TIME_PERIOD:'2026-09-01',OBS_VALUE:'1.75',OBS_STATUS:'A'},
  ],{receivedAt,definition:{seriesKey:'FM.TEST.DFR',entityId:'MACRO:EU:ECB_DFR',scope:'EU',field:'policy.deposit_facility_rate',unit:'PERCENT'}});
  assert.equal(out.seriesKey,'FM.TEST.DFR');
  assert.equal(out.knowledgeTime,'RECEIVED_AT');
  assert.equal(out.pointInTimeSafe,false);
  assert.equal(out.rows[0].referencePeriod,'2026-08-01');
  assert.equal(out.rows[1].observationStatus,'A');
  assert.equal(out.observations[1].value,1.75);
  assert.equal(out.observations[1].observedAt,receivedAt);
  assert.equal(out.observations[1].receivedAt,receivedAt);
  assert.equal(out.observations[1].source,'ECB:FM.TEST.DFR');
  assert.equal(out.observations[1].status,'SNAPSHOT');
});

test('ECB missing or non-numeric observations become UNAVAILABLE instead of fabricated zero',()=>{
  const receivedAt=1000;
  const out=ECB.normalizeSeries([{TIME_PERIOD:'2026-09',OBS_VALUE:'',OBS_STATUS:'M'}],{receivedAt,definition:{seriesKey:'EXR.TEST',entityId:'MACRO:EU:EURUSD',scope:'EU',field:'fx.eur_usd',unit:'USD_PER_EUR'}});
  assert.equal(out.observations[0].value,null);
  assert.equal(out.observations[0].status,'UNAVAILABLE');
  assert.equal(out.observations[0].confidence,0);
});

test('ECB empty result is explicit UNAVAILABLE series',()=>{
  const out=ECB.normalizeSeries([],{receivedAt:1000,definition:{seriesKey:'ICP.TEST',entityId:'MACRO:EU:HICP',scope:'EU',field:'inflation.hicp',unit:'INDEX'}});
  assert.equal(out.status,'UNAVAILABLE');
  assert.deepEqual(out.observations,[]);
});

test('ECB Data Portal SDMX JSON maps its validated series, reference periods, values and missing status',()=>{
  const receivedAt=Date.parse('2026-09-09T15:17:00Z');
  const out=ECB.normalizeSeries(dataPortalPayload(),{receivedAt,definition:{seriesKey:'ICP.M.U2.N.000000.4.ANR',entityId:'MACRO:EU:HICP',scope:'EU',field:'inflation.hicp_yoy',unit:'PCT'}});
  assert.equal(out.status,'SNAPSHOT');
  assert.deepEqual(out.rows,[
    {referencePeriod:'2026-08',observationStatus:'E',value:2.1},
    {referencePeriod:'2026-09',observationStatus:'M',value:null}
  ]);
  assert.equal(out.observations[0].value,2.1);
  assert.equal(out.observations[0].status,'SNAPSHOT');
  assert.equal(out.observations[1].value,null);
  assert.equal(out.observations[1].status,'UNAVAILABLE');
});

test('ECB Data Portal SDMX JSON is rejected when its series identity does not match the requested definition',()=>{
  assert.throws(()=>ECB.normalizeSeries(dataPortalPayload(),{receivedAt:1000,definition:{seriesKey:'ICP.M.U2.N.000000.4.INX',entityId:'MACRO:EU:HICP',scope:'EU',field:'inflation.hicp_index',unit:'INDEX'}}),/ECB_SERIES_IDENTITY_MISMATCH/);
});

test('ECB requires explicit series definition',()=>{
  assert.throws(()=>ECB.normalizeSeries([],{receivedAt:1000}),/DEFINITION_REQUIRED/);
});
