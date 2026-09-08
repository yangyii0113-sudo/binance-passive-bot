const test = require('node:test');
const assert = require('node:assert/strict');
const {sessionState} = require('../v12/core/market_clock.js');

test('crypto is 24/7', () => {
  assert.equal(sessionState('BINANCE', Date.UTC(2026,8,9,0,0)).state, 'OPEN');
});

test('TWSE regular session is recognized in Taipei time', () => {
  const open = Date.UTC(2026,8,9,1,30);
  assert.equal(sessionState('TWSE', open).state, 'OPEN');
});

test('explicit holiday override wins over base session', () => {
  const open = Date.UTC(2026,8,9,1,30);
  const value = sessionState('TWSE', open, {closed:true, reason:'HOLIDAY'});
  assert.equal(value.state, 'CLOSED');
  assert.equal(value.calendarConfidence, 'EXPLICIT_OVERRIDE');
});

test('unknown exchange is unavailable, never guessed', () => {
  assert.equal(sessionState('MARS', Date.UTC(2026,8,9,1,30)).state, 'UNAVAILABLE');
});