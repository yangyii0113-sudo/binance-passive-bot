# SMC research v1 — isolated, historical only

Goal: test whether causal SMC setup rules add useful cost-adjusted opportunities.
No assumption of profitability. No integration into ForwardRunner, Production Execution
V2, the live scanner, UI or Forward Paper ledger. PAPER_ONLY / REAL_ORDER_LOCK / No Backfill.

## Repository audit (2026-10-09)

Base: main `94dde5babd22061aba1ada0947bb1749f1e8b3fc`.
All 48 fetched remote refs (including origin/HEAD) were searched for Python `liquidity sweep`, `order block`,
`CHOCH`, and `smart money` implementations; none found. This is bounded evidence,
not proof about deleted/unfetched/private branches. Commit `dbe4793` on Lite/iPad
branches adds UI SMC definitions, not an executable strategy.

## Fixed causal rules

All inputs must be finite positive, contiguous hourly OHLC with explicit closed=True.
Use the most recent 140 closed hourly bars, matching the existing adapter window.

| Component | v1 definition |
|---|---|
| Swing | Strict high/low relative to 2 bars on each side; usable only on the candle AFTER right-side confirmation. Equal highs/lows do not qualify. |
| BOS | Close beyond the latest confirmed, unconsumed swing in the direction of the preceding structural break. First break in the visible window is INITIAL_BREAK. |
| CHOCH | Same close-break rule, opposite the preceding structural break. |
| Liquidity Sweep | Wick strictly beyond an unconsumed confirmed swing, close strictly back inside. Bullish sweep crosses a low; bearish crosses a high. |
| FVG | Strict three-candle gap: bullish low[i] > high[i-2], bearish high[i] < low[i-2]; middle candle has matching direction. Known only at third close. |
| Order Block | Last opposite candle among six candles before structure break; zone is its entire high-low range. This is a reproducible hypothesis, not evidence of actual institutional orders. |
| Qualified signal | Matching sweep within 12 bars BEFORE break; FVG forms at break through break+2; first later touch of FVG closes beyond its favorable edge within 6 bars of break. OB must exist. INITIAL_BREAK/BOS/CHOCH all allowed and logged separately. |
| Invalid before signal | Opposite break, close through OB distal edge, previously touched FVG, expiry, or incomplete sequence. |
| Entry | Persist after confirmation; earliest fill is the FOLLOWING hourly open after persistence, never the just-observed open. |
| Stop | Beyond both sweep extreme and OB distal edge by 0.1 × closed-bar ATR14; mirrored for shorts. |
| Target | 2 × actual fill-to-stop price risk, calculated after entry slippage. |
| Entry invalidation | Next-open price at/beyond stop, absolute gap over 0.5 reference R, expired open, invalid/minimum size. No retrospective fills. |
| After entry | Stop, target, 120-hour timeout, or mandatory segment-end liquidation. |

A given break's setup ID can be traded once per arm per segment. No parameter search
is performed. The initial visible trend resets at the 140-bar boundary; BOS/CHOCH
labels are local-window definitions. SMC does not require daily/4h alignment;
A/B/C/D retain their existing alignment rules. This is an intentional hypothesis.

## Matched comparison, not a Production performance claim

Reuse HistoricalDataset, HistoricalMarketAdapter, HistoricalReplayEngine and
ResearchLedgerFactory, injecting an independent ComparisonRunner through the
engine's existing runner parameter. Shared production files are unchanged.

Six arms: A, B, C, D, existing ABCD regime selector, SMC. Each gets the same ETH
universe screen (60-day age, $5m 24h volume), closed data and execution model.
BTC and SOL provide market context. ETH is the only ranked tradable asset, so rank=1;
this does not validate multi-coin ranking. Opposite candidates are evaluated symmetrically;
if both qualify, the existing LONG-then-SHORT deterministic priority is explicit.

Each arm starts with $10,000; 0.5% NAV initial price risk, at most 5× NAV notional,
quantity floored to 0.001, $5 minimum notional, one simultaneous position per arm.
Fees/slippage can cause realized risk to exceed 0.5%. No liquidation simulation.

- Base: 5 bps fee and 3 bps adverse slippage PER SIDE. These are assumptions,
  not a claim about the user's exchange tier.
- Stress: both fee and slippage doubled. Actual observed funding unchanged.
- Funding: signed historical settlements; if markPrice absent, use that held
  candle's open as an explicit proxy. For opening gaps only settlements through the open are included; otherwise all settlements in the exit candle are
  charged/credited; intrabar exit/funding order is not known from OHLC.
- Known open gap first. Adverse stop gap fills at open; favorable target gap capped
  at target. Otherwise if both stop and target touched, stop first. Apply adverse
  exit slippage even on the target (market-exit assumption).
- Report maximum drawdown of HOURLY marked equity, including cash costs;
  this is not intrabar worst-case drawdown.
- All arms use full 2R exit. Original Forward uses partial exits/trailing/portfolio
  constraints; this study isolates setup quality and does NOT reproduce those results.
- Pass rate = qualified side/candle candidates / all eligible evaluated side/candles,
  before occupancy and gap gates. Filled trades and gate rejections are separate.
- Win rate and PF use net realized P&L; average R = expectancy R = mean net
  P&L divided by actual initial fill-to-stop price risk. PF with no losses is null,
  not infinity; zero-trade rates/expectancy are null.

Chronological split: first 60% train, next 20% validation, final 20% held-out test.
Fixed parameters throughout; every segment starts flat with fresh NAV. Prior closed
bars remain available for indicator warmup, but no pending orders/positions cross
boundaries. Test is temporal holdout, not proof of independent future performance.
Once inspected it must not be reused to select parameters; subsequent versions need
fresh holdout periods or pre-registered walk-forward folds.

## Reproduction

From repository root, Python 3.12, Node 22:

```bash
python -m pip install pytest
PYTHONPATH=src:. python -m pytest tests -q
node --test tests/runtime_bridge.test.cjs tests/runtime_layout.test.cjs tests/runtime_metrics.test.cjs tests/runtime_backtest.test.cjs
```

Download through the existing official public-data loader; its geo-block fallback
uses completed monthly archives and verifies funding/data coverage. Do not substitute
missing funding with zero or generate synthetic market data for performance claims.

```bash
PYTHONPATH=src:. python - <<'PY'
import json
from backtest.binance_history import fetch_study_inputs
p = fetch_study_inputs(end_ms=1791504000000, execution_days=365, warmup_days=80)
with open('smc-input.json', 'w') as f:
    json.dump(p, f)
PY
PYTHONPATH=src:. python -m backtest.smc_research.study --input smc-input.json --output /tmp/foxyya-smc-study-1
```

The output directory must not exist. Preserve the source input alongside the output.
Outputs: manifest hashes, exact code identity, per-segment research SQLite ledgers,
per-arm closed trades and comparison.json. These must NEVER be imported into Forward
Paper tables or displayed as live history. `BACKTEST_RUN_COMPLETED` describes the
shared replay engine boundary; `SMC_RESEARCH_RESULT` seals research-only final-bar
management and boundary liquidation. All trade events are research namespace only.

## Advancement gate (predeclared)

Do not promote directly to live trading or claim positive expectancy. At least 100
closed SMC test trades, positive test net expectancy/PF>1 at both costs, no materially
worse drawdown than ABCD, stability across regimes, and block-bootstrap uncertainty
review are required before considering a limited Forward Paper challenger. This
single-symbol study cannot satisfy regime/multi-asset robustness by itself. Low sample,
negative net expectancy, or missing data => hold/reject pending further research.
