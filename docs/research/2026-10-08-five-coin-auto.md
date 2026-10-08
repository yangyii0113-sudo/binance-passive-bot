# Five-coin foreground opportunity workflow

## Scope

The Lite homepage and advice page now share five explicit coin buttons and one detailed plan. The main flow automatically checks all three holding periods for each candidate. Technical evidence and historical comparison remain optional disclosures. No new execution strategy, order endpoint, historical fill backfill, account NAV, or Production Execution V2 change.

## Selection and display

Fresh market and contract gates remain mandatory. The existing rising top-ten and falling top-five research pools are combined, sorted by absolute 24-hour move, turnover, and full contract identity, and limited to five. Members must have absolute movement between zero and 30 percent and at least 10 million USDT turnover. No padded slots. Existing complete research pools are retained. Valid plans reorder the displayed five but do not change membership. With no explicit selection, a coin with a valid plan and then an eligible period is selected. User period choices remain respected. Rankings are neither win rates nor profit forecasts.

## Automatic analysis

Two coins at a time, three periods per coin. Identical requests are shared within that coin: one contract check and five unique candle intervals, each response independently passed through unchanged period gates. Foreground cycles run again 30 seconds after completion. Hidden, offline, or departed pages cancel candle requests and reject delayed results. Returning starts fresh; no missed bars are treated as trades. The existing legacy scanner is opt-in to avoid duplicate default work. Manual retry and pause remain visible. Expensive historical comparisons remain manual.

Existing selected-coin forward tracking is still explicitly enabled by the user, uses a ticket acquired before analysis, and accepts only current eligible records through its original registration gates. Automatic analysis does not start real orders or silently activate tracking.

## Validation before publication

- 249 Node tests plus existing smoke, architecture, pipeline, and staging checks passed.
- 22 independent research service tests passed.
- Static build passed; diff checked for whitespace and scope.
- Browser dimensions and actual published revision are checked after publication.

## Profitability evidence boundary

Indicator evidence and single-filter backtest comparisons already exist. This change makes them easier to reach without introducing unvalidated trading rules. The existing comparisons expose net PnL, average net R, profit factor, closed-trade drawdown, sample counts, holdout results, double-cost stress, missing confirmations, and incomplete trades. They do not establish profitability. Funding, depth, quantity precision, selection bias, and unrealized drawdown remain limitations. Previous Binance HTTP 451 observations belong to the verification environment and do not establish the user's access status. A failed source must produce an honest blocked state, never synthetic live candidates.

## CI test fixture correction

The existing cross-process SQLite lock test twice failed in CI while passing locally. Its child constructed an unreferenced store, allowing garbage collection to release the lock before the parent assertion. The fixture now retains the store through its heartbeat and uses an explicit IPC READY message. Production and research store implementations are unchanged; the lock assertion and crash-release verification are retained.
