# P3.3 Technical Research

Input: canonical `HistoricalWindow` only. Output: `TechnicalResearchSnapshot`
with daily indicators, weekly trend, provenance, coverage and research state.
This is a deterministic historical calculation, never an execution signal or
a claim of live freshness. Method version: `tw-technical.v1`.

## Contract and calculation rules

- Move the unchanged HistoricalWindow dataclass into `research/tw/history.py`;
  keep the existing service import available for compatibility.
- Each metric carries value or null, availability, required/observed periods,
  coverage ratio, observed date, field-level evidence and an unavailable reason.
- Daily: close, SMA20/60, EMA12/26, RSI14, MACD line/signal/histogram (12/26/9),
  momentum20, ROC20 (%), support20, resistance20, volume ratio20, ATR14, ATR14 (%).
- SMA uses arithmetic means. EMA seeds from the first N valid closes in the
  trailing uninterrupted series, then alpha = 2/(N+1). MACD signal seeds from
  the first nine available MACD values (34 closes total).
- RSI uses 14 close changes (15 closes), Wilder smoothing, 100 for no losses,
  0 for no gains, and 50 for an unchanged series. ATR uses 14 true ranges with
  previous closes (15 OHLC bars), Wilder smoothing. No first-bar TR shortcut.
- Recursive metrics use all supplied consecutive valid history since the last
  invalid input. Their values can differ with the supplied window length;
  required-period coverage is readiness, not convergence or predictive confidence.
- Momentum20 = close minus close 20 sessions ago. ROC20 = that difference /
  the earlier close * 100. Neither compresses missing sessions.
- Support/resistance are trailing low/high extrema over the **previous** 20
  bars, excluding the current bar. They are descriptive ranges, not predicted
  price targets. Volume ratio is current volume / previous-20 mean volume;
  zero baseline is unavailable, observed zero current volume is a real zero.
- Volume context: above-average volume plus rising/falling close gives
  `confirming_up` / `confirming_down`; otherwise `below_average`, `average`,
  `above_average_flat`, `no_volume`, or `insufficient_data`. These labels do not authorize orders.
- Volatility context compares the current ATR14 with the previous ATR14:
  `expanding`, `contracting`, `stable`, or `insufficient_data`. No calibrated
  low/high risk threshold is implied.
- Daily trend: close > SMA20 > SMA60 is bullish; reversed is bearish;
  other complete comparisons are neutral. Weekly trend uses close/SMA4/SMA12.
- Overall state requires complete requested history, all daily metrics and
  sufficient daily/weekly trend. Matching bullish/bearish trends produce that
  state; disagreement or neutrality produces neutral; missing inputs produce
  insufficient_data. Component values remain available independently.

## Weekly and integrity rules

- Group bars by ISO Monday-Friday week; use its last close. Admit a week only
  once its Friday is <= window cutoff. Conservatively exclude a leading week
  whose Monday precedes the window start. No future or partial closing week.
- Every supplied close and source in a weekly group must be valid. An empty
  intervening ISO week breaks the rolling weekly history; never backfill it.
  If the latest closed ISO week is missing altogether, weekly trend is
  unavailable rather than silently carrying forward an older weekly state.
- Without an expected-session calendar, missing trading dates/holidays inside
  a supplied week cannot be distinguished. Weekly coverage describes supplied
  closed-week groups, not proof of exchange-calendar completeness. A Friday
  holiday week is only admitted at Friday or later, never early on Thursday.
- Invalid numeric data, absent provenance or missing inputs become null for
  affected metrics; no forward fill, zero substitution, or skipping holes.
  Nonpositive prices, negative volume, bool/NaN/Inf and inconsistent OHLC are
  invalid. Close-only metrics remain usable when only volume is absent.
- Revalidate identity, venue, strictly increasing dates, cutoff, price modes,
  window metadata and lookahead flag. Malformed windows fail with an integrity
  error. Mixed/raw-as-adjusted price modes cannot enter this v1 calculation.
- Raw/unadjusted prices and corporate-action discontinuity limitations are
  carried in every snapshot. Corporate-action correction belongs to P3.4+.
- `execution_allowed` is always false and rejects construction with true.

## Acceptance

1. Hand-checked nonlinear EMA/RSI/MACD/ATR vectors; warm-up boundaries.
2. Rising/falling/flat daily and weekly fixtures with source/date evidence.
3. Missing/invalid prices, volume, source, insufficient history and recovery.
4. No lookahead, incomplete weeks, ISO-year boundary, empty weeks, tampering.
5. TWSE/TPEx fixture adapter -> window -> technical integration.
6. All Taiwan architecture/phase tests and compile gate pass; execution source
   unchanged. Live smoke distinguishes network failure from technical failure.

Local acceptance on 2026-09-20: 142 Taiwan tests, 286 complete Python tests,
16 existing runtime Node tests passed. `tools/tw_technical_smoke.py --end-date
2026-09-18` passed using 120 official sessions for each of TWSE 2330 and TPEx 6488.
Published implementation: `bceb6e70ee27087a8e7d21dadb50e8d00e0707ee`.
Both [Research Architecture Gate](https://github.com/yangyii0113-sudo/binance-passive-bot/actions/runs/35487120948)
and [Official Data Live Smoke](https://github.com/yangyii0113-sudo/binance-passive-bot/actions/runs/35487120957)
passed for that exact commit. P3.3 is COMPLETE; see the P3.3 handoff.

## Formula references

Implementation conventions (seeds, flat RSI, week closure and states) above
are explicit v1 choices. The underlying formulas were checked against Fidelity's
official indicator guides:
[EMA](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/ema),
[RSI](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/RSI),
[MACD](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/macd),
[ATR](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr).
