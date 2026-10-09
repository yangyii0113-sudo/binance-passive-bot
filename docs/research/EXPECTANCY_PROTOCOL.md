# Net expectancy study 1 — frozen exploratory protocol

2026-10-10 Asia/Taipei. Objective: improve mean net R after fees, slippage and
funding. Not optimize signal counts, win rate, or indicator count.

All 2025-10-01 through 2026-09-30 inputs were already inspected in SMC v1.
Every segment in this experiment is EXPLORATORY_REUSED_DATA, including the old
`test` segment. No fresh holdout or forward-performance claim is permitted.

Prior decomposition (same realized paths, not a hypothetical zero-cost rerun):
B old-test gross price R before modeled costs = +0.1867; fees = 0.1278R,
slippage = 0.0767R, funding = 0.0085R; net = -0.0262R. This motivates a
cost filter, but does not establish that a different executable strategy wins.

## Three fixed variants; no threshold search

For each of B, C, ABCD, run base and stress costs:

1. `control`: identical to SMC v1 matched 2R OHLC research model.
2. `cost_cap`: identical, except reject an entry if projected round-trip cost
   exceeds 0.15R. R denominator = abs(actual next open - planned stop).
   Cost numerator = (open + stop) * (0.0005 + 0.0003) + open * 0.0001.
   The last term is a fixed funding reserve, NOT future realized funding.
   The eligibility threshold always uses base cost constants in BOTH fee scenarios;
   stress doubles charged fees/slippage only. Actual funding still applies.
   0.15R is a predeclared hypothesis, not selected by evaluating alternative cutoffs.
3. `choch_veto`: identical, except veto when an opposite CHOCH appears in the
   latest three fully closed 1h candles and no later same-direction structure break
   has superseded it. Recheck before due open. No other SMC confluence required.

No combined cost+CHOCH variant in this experiment: attribute each effect separately.
No exit, stop, sizing, universe, router, time-window or risk increase.
Signal scan/invalidation semantics and all inherited limitations match SMC v1.

## Measure the desired outcome

Report mean net R, its change versus same-family/same-cost control, n, win rate,
PF, marked max DD, total net R, total net P&L, trades/control retention and
net R per 30 calendar days. Higher expectancy with two lucky trades is not a win.
Raw qualified counts precede filters; filter rejections are reported separately.
Do not claim that retained raw signals equal filled opportunities.

B/C/ABCD are correlated overlapping hypotheses, not independent replications.
A candidate can only be called 'promising for fresh validation' if base and stress
net expectancy and PF exceed zero/one in all three exploratory segments, and
old-test has at least 20 trades. This is a screening rule, NOT statistical proof.
No automatic live/Forward promotion even if these conditions pass. Any subsequent
threshold changes require a new version and fresh temporal holdout or genuine
Forward Paper observations; the prior 100-trade final promotion gate still applies.

Use prior input.json without re-downloading. Run:

```bash
PYTHONPATH=src:. python -m pytest tests -q
PYTHONPATH=src:. python -m backtest.smc_research.expectancy --input /ABS/input.json --output /tmp/expectancy-new
```

The output root must be new. Prior experiment outputs remain immutable.
Production Execution V2, PAPER_ONLY, REAL_ORDER_LOCK and No Backfill unchanged.
