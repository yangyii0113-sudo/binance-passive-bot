const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../v12/data/quality_gate.js');

const base = {
  schemaVersion:'foxyya-observation/1', instrumentId:'NASDAQ:NVDA', market:'US',
  field:'last_price', value:182.4, unit:'USD', currency:'USD', observedAt:1000,
  receivedAt:1010, source:'fixture', status:'LIVE', confidence:1
};

test('fresh live value stays LIVE', () => {
  assert.equal(Q.assessObservation(base, 1500, {liveMaxAgeMs:1000, staleMaxAgeMs:5000}).status, 'LIVE');
});

test('aged value is downgraded rather than remaining LIVE', () => {
  assert.equal(Q.assessObservation(base, 3000, {liveMaxAgeMs:1000, staleMaxAgeMs:5000}).status, 'DELAYED');
});

test('too-old value becomes STALE', () => {
  assert.equal(Q.assessObservation(base, 7000, {liveMaxAgeMs:1000, staleMaxAgeMs:5000}).status, 'STALE');
});

test('snapshot never upgrades to live', () => {
  assert.equal(Q.assessObservation({...base,status:'SNAPSHOT'}, 1200, {liveMaxAgeMs:1000, staleMaxAgeMs:5000}).status, 'SNAPSHOT');
});

test('invalid observation is unavailable', () => {
  assert.equal(Q.assessObservation({...base,source:''}, 1200, {liveMaxAgeMs:1000, staleMaxAgeMs:5000}).status, 'UNAVAILABLE');
});