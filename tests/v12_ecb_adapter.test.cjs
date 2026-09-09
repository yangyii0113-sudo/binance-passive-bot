const test=require('node:test');
const assert=require('node:assert/strict');
const ECB=require('../v12/providers/ecb_adapter.js');

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

test('ECB requires explicit series definition',()=>{
  assert.throws(()=>ECB.normalizeSeries([],{receivedAt:1000}),/DEFINITION_REQUIRED/);
});
