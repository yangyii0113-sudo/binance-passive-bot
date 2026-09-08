const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../v12/core/index.js');

test('foundation exposes stable market clock contracts and quality surfaces', () => {
  assert.equal(typeof F.market.instrumentId, 'function');
  assert.equal(typeof F.clock.sessionState, 'function');
  assert.equal(typeof F.contracts.validateObservation, 'function');
  assert.equal(typeof F.quality.assessObservation, 'function');
});