import assert from 'node:assert/strict';
import { evaluateStrategyGuard } from '../src/strategy_guard.js';
import { validationSpecForMatch, researchDecision } from '../src/research_pipeline.js';

const trend = validationSpecForMatch('Trend');
assert.deepEqual(
  {supported:trend.supported,strategy:trend.strategy,timeframe:trend.timeframe,range:trend.range},
  {supported:true,strategy:'A',timeframe:'4h',range:'2Y'}
);

const momentum = validationSpecForMatch('Momentum / Breakout Watch');
assert.deepEqual(
  {supported:momentum.supported,strategy:momentum.strategy,timeframe:momentum.timeframe,range:momentum.range},
  {supported:true,strategy:'B',timeframe:'1h',range:'1Y'}
);

const range = validationSpecForMatch('Range Watch');
assert.equal(range.supported,false);
assert.match(range.reason,/Mean Reversion/);

const pass = evaluateStrategyGuard({
  trades:80,
  profitFactor:1.45,
  avgTradePct:0.4,
  netReturnPct:35,
  maxDrawdownPct:24,
  validation:{level:'INITIAL'}
});
assert.equal(pass.label,'PASS');

const caution = evaluateStrategyGuard({
  trades:80,
  profitFactor:1.45,
  avgTradePct:0.4,
  netReturnPct:35,
  maxDrawdownPct:44,
  validation:{level:'INITIAL'}
});
assert.equal(caution.label,'CAUTION');

const review = evaluateStrategyGuard({
  trades:120,
  profitFactor:0.92,
  avgTradePct:-0.1,
  netReturnPct:-12,
  maxDrawdownPct:25,
  validation:{level:'REFERENCE'}
});
assert.equal(review.label,'REVIEW');

const insufficient = evaluateStrategyGuard({
  trades:10,
  profitFactor:2,
  avgTradePct:1,
  netReturnPct:20,
  maxDrawdownPct:10,
  validation:{level:'INSUFFICIENT_TRADES'}
});
assert.equal(insufficient.label,'樣本不足');

assert.equal(
  researchDecision({
    technical:{status:'LIVE'},
    guard:pass,
    risk:{status:'PASS'},
    spec:trend
  }).label,
  'VALIDATED'
);

assert.equal(
  researchDecision({
    technical:{status:'LIVE'},
    guard:{label:'RESEARCH'},
    risk:{status:'BLOCKED'},
    spec:range
  }).label,
  'BLOCKED',
  'Risk BLOCKED must override unsupported strategy baseline'
);

console.log('RESEARCH_PIPELINE_OK');
console.log('fixed strategy mapping: Trend=A/4H/2Y, Momentum=B/1H/1Y, Range=unsupported');
console.log('strategy guard and risk precedence: enforced');
