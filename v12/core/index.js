'use strict';
module.exports = Object.freeze({
  market: require('./market_core.js'),
  clock: require('./market_clock.js'),
  contracts: require('../data/contracts.js'),
  quality: require('../data/quality_gate.js'),
  normalizer: require('../data/normalizer.js'),
  providers: require('../providers/index.js'),
  intelligence: require('../intelligence/index.js'),
  earlyTrend: require('../early_trend/index.js'),
  research: require('../research/index.js'),
  workspace: require('../workspace/index.js'),
  crypto: require('../crypto/index.js'),
  results: require('../results/index.js'),
  lab: require('../lab/index.js'),
});