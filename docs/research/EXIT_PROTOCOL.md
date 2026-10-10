# Exit study 1 (frozen before result inspection)

Objective: net expectancy, not signal count. All dates reuse prior inspected data:
EXPLORATORY_REUSED_DATA. No OOS or Forward claim, no promotion.

B/C/ABCD x cost screen off/on (fixed prior 0.15R) x base/stress x three exits:
- ohlc_2r: unchanged prior execution reference, exact trade parity required.
- close_2r: hourly closed-price stop; 120h timeout before TP; full exit at observed
  close when >=2R. Actual observed price with adverse slippage, not threshold fill.
- close_partial: hourly approximation of ForwardRunner exit decision ordering:
  stop, 120h timeout, 50% TP at >=1.5R once, then ATR14*1.5 tightening only.
  Trailing stop update applies to future observations. No hard 2.5R exit (shadow only).

close_partial versus close_2r isolates exit policy at the same hourly observation
frequency. Comparing either against OHLC also changes observation/fill assumptions.
Hourly closes are trade prices, not a reconstruction of live mark-price ticks.
No claim to reproduce production portfolio or cost-aware family-specific sizing:
all arms retain prior 0.5% initial price-risk sizing, 5x notional cap, ETH only.
Partial quantity matches PortfolioService exact fraction; no extra lot rounding.
Funding charged on remaining position at each settlement before that hour's exit.
Missing funding mark proxy uses held candle open as before. Base fees/slip and
stress costs unchanged. No cost threshold search or combined CHOCH experiment.

Record one aggregated trade per original position, its exit legs, total fees,
funding, gross and net P&L, and NAV reconciliation. Close-based price MFE/MAE use
only observed closes up to and including exit, never highs/lows after exit.
Also record maximum observed liquidation net R (realized partial plus liquidation
value of remaining qty after modeled exit costs) and giveback to final net R.
These sampled extrema miss intrahour excursions; they are diagnostics, not proof
that the extrema were executable or could have been captured by another policy.

Report all prior metrics plus total net R, sample counts, exit reasons, mean MFE,
MAE and net-equity giveback. Interpret full segment sets and doubled costs.
No rule modifications after seeing results; no automatic production/Forward rollout.
