const test = require('node:test');
const assert = require('node:assert/strict');
const {makeObservation} = require('../v12/data/normalizer.js');

const nvda={instrumentId:'NASDAQ:NVDA',symbol:'NVDA',exchange:'NASDAQ',market:'US',region:'US',currency:'USD',timezone:'America/New_York',assetType:'EQUITY'};

test('normalizer emits canonical observation from validated instrument', () => {
  const o=makeObservation({
    instrument:nvda, field:'last_price', value:182.4, unit:'USD',
    observedAt:1000, receivedAt:1010, source:'fixture', status:'SNAPSHOT', confidence:.9
  });
  assert.equal(o.schemaVersion,'foxyya-observation/1');
  assert.equal(o.instrumentId,'NASDAQ:NVDA');
  assert.equal(o.market,'US');
  assert.equal(o.currency,'USD');
});

test('normalizer rejects invalid instrument identity', () => {
  assert.throws(()=>makeObservation({
    instrument:{...nvda,market:'TW'}, field:'last_price', value:1, unit:'USD',
    observedAt:1, receivedAt:1, source:'fixture', status:'SNAPSHOT', confidence:1
  }),/INSTRUMENT_INVALID/);
});

test('normalizer does not fabricate missing live value', () => {
  assert.throws(()=>makeObservation({
    instrument:nvda, field:'last_price', value:null, unit:'USD',
    observedAt:1, receivedAt:1, source:'fixture', status:'LIVE', confidence:1
  }),/OBSERVATION_INVALID/);
});