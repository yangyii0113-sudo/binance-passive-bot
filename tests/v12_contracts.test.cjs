const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MARKET_IDS,
  CONFIDENCE_STATES,
  validateMarketPulse,
  validateResearchRead,
  validateExecutionSnapshot,
} = require('../v12/data/contracts.js');

test('v12 supports one shared context across all three markets', () => {
  assert.deepEqual(MARKET_IDS, ['ALL', 'CRYPTO', 'US', 'TW']);
});

test('market pulse rejects unsupported confidence state', () => {
  const pulse = {
    market: 'US', label: 'US Market', asOf: 1, source: 'fixture', confidence: 'MAGIC',
    regime: 'RISK_ON', primary: {}, secondary: {}, breadth: {}, volumeState: 'NORMAL', riskState: 'NORMAL',
  };
  assert.equal(validateMarketPulse(pulse).ok, false);
});

test('US and TW research cannot impersonate execution positions', () => {
  const read = {
    market: 'US', symbol: 'NVDA', asOf: 1, source: 'fixture', confidence: 'SNAPSHOT',
    dimensions: {trend:'STRONG', momentum:'STRONG', fundamental:'POSITIVE', expectation:'HIGH', flow:'POSITIVE', risk:'ELEVATED'},
    scenarios: {bull:{}, base:{}, bear:{}}, executionState: 'OPEN',
  };
  assert.equal(validateResearchRead(read).ok, false);
});

test('crypto execution contract requires both paper-only locks', () => {
  const value = {
    paperOnly: true, realOrderLock: true, strategyVersion: 'v11.2',
    qualified: 1, pending: 1, open: 0, ledgerIntegrity: true, asOf: 1,
  };
  assert.equal(validateExecutionSnapshot(value).ok, true);
  assert.equal(validateExecutionSnapshot({...value, realOrderLock:false}).ok, false);
  assert.equal(validateExecutionSnapshot({...value, paperOnly:false}).ok, false);
});

test('confidence vocabulary is fixed', () => {
  assert.deepEqual(CONFIDENCE_STATES, ['LIVE','DELAYED','SNAPSHOT','STALE','UNAVAILABLE']);
});