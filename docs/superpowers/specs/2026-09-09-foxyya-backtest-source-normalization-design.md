# FOXYYA Backtest + Source Normalization Design

Date: 2026-09-09  
Status: APPROVED FOR IMPLEMENTATION PLANNING  
Repository: `yangyii0113-sudo/binance-passive-bot`

## 1. Purpose

Build a historical backtest subsystem for FOXYYA without creating a second, divergent strategy engine. The implementation first normalizes the production backend into a normal Git source tree, then adds a historical clock and market-data adapter around the same strategy, risk, execution, portfolio and ledger semantics used by Forward Paper Trading.

The first formal study target is `ETHUSDT` on Binance USD-M over a deterministic trailing 365-day execution window ending at the latest fully closed 1H candle available when the run starts.

## 2. Non-negotiable safety and governance constraints

The following rules are unchanged and apply to every phase:

- `PAPER_ONLY=true` remains mandatory.
- `REAL_ORDER_LOCK=true` remains mandatory.
- No private/signed exchange order endpoint may be introduced.
- No real-order capability may exist in the backtest subsystem.
- No Backfill: a decision made after a legal open may never be retroactively filled at that open.
- Signals use only fully closed bars.
- Portfolio planned open risk remains `<= 1.50% NAV`.
- Canonical NAV and trade state are ledger-derived, not manually overwritten by UI state.
- A/B/C/D and LONG/SHORT Control rules remain frozen during the 30-day Control Freeze.
- Backtest results are research evidence and may not silently replace Forward Control parameters.
- Every reported number must retain data source, time range, strategy version and Git commit provenance.

## 3. Current-state problem

Production currently imports `foxyya.*` modules from `service.py`, but the canonical Python package is not stored as a normal source tree in the repository. Docker reconstructs the backend by concatenating `backend_parts2/part00..part04`, decoding Base64, opening a ZIP and extracting the runtime package during image build.

This packaging is deployable but unsuitable as the long-term foundation for parity testing, historical replay and maintainable strategy research. It also makes it difficult to prove that Forward and Backtest use identical code paths.

## 4. Scope

### In scope

1. Extract the exact currently deployed backend into a canonical source tree without strategy-semantic changes.
2. Replace Docker's Base64/ZIP reconstruction path with direct source-tree copying only after parity verification.
3. Establish regression and parity gates before any historical feature is added.
4. Create a historical market adapter and deterministic historical clock.
5. Reuse the existing strategy/risk/execution/portfolio rules through a replay orchestrator.
6. Create a dedicated historical research ledger/output boundary; never write historical replay events into `/data/foxyya_v2_paper.sqlite`.
7. Implement ETHUSDT trailing-365-day replay with sufficient pre-window warm-up data for every production indicator/context calculation.
8. Produce performance, risk, cost, strategy-segmentation and opportunity-funnel reports.
9. Persist a data manifest and hashes so each accepted run is reproducible.
10. Label historical results distinctly from Forward Paper results in every API/UI representation.

### Out of scope

- Real trading or exchange private API integration.
- Lowering setup thresholds to increase trade count.
- Adding Setup E/F/G.
- Optimizing A/B/C/D parameters as part of this project.
- Replacing the existing 5x primary / 8x / 10x comparison policy.
- Homepage redesign work unrelated to exposing read-only backtest summaries.
- Auto-promotion of Shadow variants into Control.

## 5. Target repository structure

After Phase 0, the backend should be understandable directly from Git:

```text
src/
└── foxyya/
    ├── __init__.py
    ├── config.py
    ├── execution.py
    ├── ledger.py
    ├── live.py
    ├── market.py
    ├── portfolio.py
    ├── runner.py
    ├── security.py
    ├── setups.py
    ├── universe.py
    └── ...existing production modules exactly as extracted

backtest/
├── __init__.py
├── historical_clock.py
├── historical_market.py
├── replay_engine.py
├── cost_model.py
├── metrics.py
├── report.py
└── cli.py

tests/
├── ...existing tests
├── test_source_parity.py
├── test_no_lookahead.py
├── test_future_legal_open.py
├── test_backtest_forward_parity.py
├── test_cost_parity.py
├── test_risk_parity.py
└── test_eth_one_year_replay.py
```

The exact list under `src/foxyya/` must be derived from the currently deployed archive. No module may be invented, renamed or split during normalization unless a separate later refactor is approved.

`backtest/cost_model.py` supplies historical fee/slippage/funding inputs or explicit approximations only. It must not duplicate or override the shared production sizing/risk rules.

## 6. Architecture

### 6.1 Shared Core

The canonical strategy core remains the existing FOXYYA runtime package. Backtest code may orchestrate it but must not duplicate its setup predicates, risk sizing or position-management rules.

```text
                         Shared FOXYYA Core
                  strategy / risk / execution / ledger
                               |
              +----------------+----------------+
              |                                 |
      Live Market Adapter              Historical Adapter
      Binance Public API               historical closed data
              |                                 |
          Real Clock                       Historical Clock
              |                                 |
       Forward Paper                  Historical Replay Ledger
```

### 6.2 Historical Clock

`historical_clock.py` supplies deterministic timestamps. It advances only to known historical boundaries and must make it impossible for strategy code to observe future candles.

At timestamp `T`, the visible dataset contains only bars whose close time is `<= T`. A signal requiring a fully closed 1H candle becomes eligible only after that candle is closed. Any resulting execution is evaluated at the next future legal 1H open, never the open preceding decision completion.

### 6.3 Historical Market Adapter

`historical_market.py` exposes historical data in a shape compatible with the current snapshot/runner boundary. It is responsible for:

- Native Binance USD-M public 1H, 4H and Daily klines wherever production uses those native intervals.
- No custom timeframe aggregation unless the current production code already performs the same aggregation.
- Filtering every interval so only bars with `close_time <= historical_clock.now` are visible.
- Public funding history when available for the requested interval.
- Deterministic missing-data behavior: unavailable data is marked `UNAVAILABLE`; it is never fabricated.
- Source URL family, retrieval time, symbol, interval, first/last timestamp, row count and content hash in a run data manifest.

### 6.4 Replay Engine

`replay_engine.py` advances the Historical Clock and invokes the same logical lifecycle as Forward Paper:

```text
closed-bar update
→ scan_if_new_close
→ pending intent creation
→ revalidation before legal open
→ execute at future legal open
→ funding
→ position management
→ close/cancel
→ research ledger event
```

The replay implementation may adapt function signatures, but any changed shared-core interface must preserve identical behavior for the live `ForwardRunner`.

### 6.5 Research Ledger and artifact isolation

Historical events must never enter the production SQLite ledger at `/data/foxyya_v2_paper.sqlite`.

Default replay output uses an explicit research directory:

```text
artifacts/backtests/<run_id>/
├── events.sqlite
├── data_manifest.json
├── run_config.json
├── metrics.json
└── report.json
```

Each run receives a deterministic `run_id` derived from strategy version, Git commit SHA, symbol, execution window and backtest configuration. The manifest hashes the actual historical input datasets. Reports include the `run_id`, strategy version, Git commit SHA and input-data hashes.

## 7. ETHUSDT first-study specification

### Instrument and deterministic window

- Venue/data family: Binance USD-M Public Data
- Symbol: `ETHUSDT`
- Primary execution timeframe: 1H
- Context timeframes: native 4H and Daily
- `end_time`: open time of the first not-yet-closed 1H candle at run start; therefore every candle strictly before `end_time` is fully closed.
- `start_time`: `end_time - 365 days`.
- Execution/trade metrics include events with legal execution timestamps in `[start_time, end_time)`.
- The adapter fetches additional pre-`start_time` warm-up bars required by existing production calculations; warm-up events do not contribute P&L or trade-count KPIs.

The exact resolved UTC and Asia/Taipei timestamps are written to `run_config.json`.

### Strategy and execution behavior

Retain current Control behavior:

- A/B/C/D
- LONG/SHORT symmetry
- Regime Router semantics
- Fully Closed Bar requirement
- Future Legal 1H Open
- Structure Stop
- current Partial TP rule
- current ATR Trail rule
- Time Stop / Momentum Failure behavior where already present in production
- Cost-aware sizing
- 5x primary and 8x/10x comparison books according to current book policy
- Portfolio planned risk `<= 1.50% NAV`

### Costs

The replay must account for every production-supported cost category that materially affects the ledger:

- entry fee
- exit fee
- entry slippage
- exit slippage
- funding reserve / realized funding according to current runtime semantics

If a production cost component cannot be reconstructed historically with sufficient fidelity, the report must label it `UNAVAILABLE` or document the explicit deterministic approximation in `run_config.json`. No silent zero-cost assumption is allowed.

## 8. Metrics and reporting

Every backtest report contains at least:

### Performance

- closed trade count
- win rate with sample size
- gross and net P&L
- net return
- Average R
- Net Expectancy R
- Profit Factor
- Max Drawdown
- drawdown duration when derivable
- equity curve
- monthly returns

### Strategy segmentation

- A/B/C/D
- LONG vs SHORT
- Regime
- 5x/8x/10x books
- sample size for every slice

Any slice with fewer than 20 trades is labeled `Sample Insufficient`.

### Execution funnel

Track at least:

```text
Eligible
→ Candidate
→ Qualified
→ Executable
→ Pending Intent
→ Filled
→ Closed
```

Report conversion rates, cancellation/rejection reasons, Qualified→Filled, Opportunity Utilization, Avoided Loss and Missed Opportunity when supported by available event data.

### Risk and excursion

- planned/open portfolio risk
- exposure
- margin utilization
- consecutive losses
- MFE
- MAE
- Capture Ratio

### Cost attribution

- fees
- slippage
- funding
- gross-to-net performance delta

## 9. Forward-vs-backtest separation

Historical results must be visually and structurally separated from live Forward Paper metrics.

Required labels:

- `HISTORICAL BACKTEST`
- `歷史模擬・非 Forward Performance`

Backtest APIs must not reuse endpoint names in a way that makes historical metrics look canonical. Any future API uses a dedicated namespace such as `/api/backtest/*`.

## 10. Error handling and integrity rules

A replay run fails closed when:

- candle chronology is non-monotonic
- duplicate timestamps violate expected uniqueness
- required execution bars are missing and the engine cannot determine a legal open
- strategy code requests data newer than Historical Clock time
- ledger integrity verification fails
- result provenance or input hashes are incomplete

A failed run must not return a normal performance summary. It returns an explicit failed/incomplete status with integrity diagnostics.

## 11. Test strategy and acceptance gates

### Phase 0 — Source normalization gate

Before changing Docker packaging:

1. Extract the exact current production archive.
2. Compare extracted file hashes with the reconstructed package used by current Docker build.
3. Run all existing repository tests against the normalized source tree.
4. Run a controlled ledger/API replay fixture and compare existing runtime projections.
5. Confirm `PAPER_ONLY`, `REAL_ORDER_LOCK`, database path behavior and public-only market access remain unchanged.

Docker may switch to direct source-tree copy only after parity evidence is recorded.

### Backtest integrity gate

Required tests include:

- future bars are invisible before their close
- native 4H/Daily bars are also filtered by their own close times
- a decision after an open cannot backfill that open
- next legal open timing is identical to Forward semantics
- risk sizing parity for identical snapshots
- fee/slippage/funding accounting parity where historical inputs are equivalent
- a deterministic replay produces identical event sequence and metrics on repeated runs with the same manifest
- historical replay cannot open the production paper ledger path
- the same `run_config.json` and input hashes reproduce the same accepted report

### ETH 365-day acceptance gate

The first study is accepted as a valid research run only if:

- the run completes without integrity error
- no lookahead violation is detected
- Backfill count is zero
- duplicate fill count is zero
- every closed trade maps to signal/intent/position identifiers
- every reported KPI includes period, symbol, strategy version, Git SHA and run ID
- the result distinguishes gross from net performance
- the funnel exposes why Qualified does or does not become Filled
- input manifests and hashes are complete

No minimum return, win rate or trade count is an acceptance criterion. Negative performance is a valid result if the replay is correct.

## 12. Deployment strategy

Implementation proceeds on an isolated feature branch/worktree. Production `main` remains untouched until parity gates pass.

Recommended sequence:

1. Normalize source only.
2. Prove parity and update Docker packaging.
3. Add historical clock/adapter with no UI exposure.
4. Add deterministic replay and metrics.
5. Run ETHUSDT trailing-365-day study.
6. Add read-only historical summary UI/API only after backend report correctness is established.

The live Forward Paper service remains the canonical operational truth throughout this project.

## 13. Current diagnostic context

At design time, the production runtime is active and the observed 24H diagnostics show a healthy scanner with a low Qualified→Filled conversion. Recent observations were approximately 74 Qualified and 3 Filled, roughly 4.05% conversion. This is a diagnostic motivation for funnel analysis, not a target to optimize during source normalization or the first historical replay.

The project preserves the current governance rule: investigate Intent→Fill timing/cancellation causes before changing setup thresholds.
