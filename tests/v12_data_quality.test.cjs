const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../v12/data/contracts.js');

test('canonical observation carries provenance and timing', () => {
  const value = {
    schemaVersion:'foxyya-observation/1', instrumentId:'NASDAQ:NVDA', market:'US',
    field:'last_price', value:182.4, unit:'USD', currency:'USD',
    observedAt:1000, receivedAt:1010, source:'provider-fixture',
    status:'SNAPSHOT', confidence:0.9
  };
  assert.equal(C.validateObservation(value).ok, true);
});

test('LIVE cannot be accepted when received before observed or provenance is missing', () => {
  const value = {
    schemaVersion:'foxyya-observation/1', instrumentId:'TWSE:2330', market:'TW',
    field:'last_price', value:1000, unit:'TWD', currency:'TWD',
    observedAt:2000, receivedAt:1999, source:'', status:'LIVE', confidence:1
  };
  assert.equal(C.validateObservation(value).ok, false);
});

test('UNAVAILABLE may carry null but still requires provenance', () => {
  const value = {
    schemaVersion:'foxyya-observation/1', instrumentId:'NASDAQ:NVDA', market:'US',
    field:'options_iv', value:null, unit:'PCT', currency:'USD',
    observedAt:1000, receivedAt:1000, source:'provider-fixture',
    status:'UNAVAILABLE', confidence:0
  };
  assert.equal(C.validateObservation(value).ok, true);
});