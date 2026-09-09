# FOXYYA Backtest Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the FOXYYA historical-research subsystem through deterministic cost attribution, metrics/reporting, Binance public historical-data ingestion, an ETHUSDT trailing-365-day study, read-only historical API/UI, and reproducible artifacts without changing Forward Paper Control semantics.

**Architecture:** Keep `src/foxyya` as the single shared strategy/risk/execution core. Historical code in `backtest/` fetches immutable public data, drives `HistoricalReplayEngine`, projects research-ledger events into metrics/report artifacts, then exposes only read-only results under `/api/backtest/*`. ETHUSDT is the only tradable symbol for the first study; BTCUSDT/ETHUSDT/SOLUSDT remain context symbols for regime/benchmark calculations.

**Tech Stack:** Python 3.12, standard library (`urllib`, `json`, `hashlib`, `zoneinfo`, `sqlite3`), existing FOXYYA Python core, pytest, Node built-in test runner, GitHub Actions, Docker.

**Spec:** `docs/superpowers/specs/2026-09-09-foxyya-backtest-source-normalization-design.md`

## Global Constraints

- `PAPER_ONLY=true` remains mandatory.
- `REAL_ORDER_LOCK=true` remains mandatory.
- No private/signed exchange endpoints or real-order capability.
- A/B/C/D and LONG/SHORT Control rules are unchanged.
- No Backfill.
- Fully Closed Bar visibility remains enforced.
- Future Legal 1H Open remains enforced.
- Portfolio planned open risk remains `<= 1.50% NAV` in the shared core.
- Production ledger remains `/data/foxyya_v2_paper.sqlite` and is never opened by historical study code.
- ETHUSDT is the first-study tradable universe; BTCUSDT/ETHUSDT/SOLUSDT are allowed as historical context datasets.
- Warm-up data is excluded from performance KPIs.
- Historical results are labeled `HISTORICAL BACKTEST / 歷史模擬・非 Forward Performance`.
- No return, win-rate, PF, or trade-count threshold is an acceptance criterion.
- If Binance historical inputs are incomplete, non-monotonic, duplicated, or required 1H opens are missing, the run fails closed.

---

### Task 1: Deterministic trade/cost projection and metrics

**Files:**
- Create: `backtest/metrics.py`
- Test: `tests/test_backtest_metrics.py`

**Interfaces:**
- Produces `project_closed_trades(events: list[dict]) -> list[dict]`.
- Produces `build_metrics(events: list[dict], *, initial_nav: float, start_ms: int, end_ms: int, symbol: str) -> dict`.

- [ ] Write failing fixtures with one LONG and one SHORT closed position containing `PAPER_ENTRY`, partial/final exits, fees implied by shared `FEE`, slippage implied by fill prices, and funding events.
- [ ] Assert each closed-trade record contains `position_id`, `symbol`, `side`, `family`, `regime`, `entry_ms`, `exit_ms`, `planned_risk_usdt`, `gross_raw_pnl_usdt`, `gross_fill_pnl_usdt`, `slippage_cost_usdt`, `fees_usdt`, `funding_usdt`, `net_pnl_usdt`, `net_r`, `mfe_r`, `mae_r`.
- [ ] Assert cost identity: `net_pnl_usdt == gross_fill_pnl_usdt - fees_usdt + funding_usdt` within tolerance and `slippage_cost_usdt == gross_raw_pnl_usdt - gross_fill_pnl_usdt`.
- [ ] Assert metrics contain closed trades, win rate + n, gross/net P&L, net return, Avg R, Expectancy R, PF, max drawdown, drawdown duration, equity curve, monthly returns, cost attribution, funnel, risk, and segmentation by family/side/regime/book.
- [ ] Implement deterministic event projection. Use `SCAN_SUMMARY.time_ms == INTENT_CREATED.decision_persist_ms` to associate regime; if unavailable, report `UNAVAILABLE` rather than inventing a regime.
- [ ] Mark segment samples with `n < 20` as `Sample Insufficient`.
- [ ] Preserve `UNAVAILABLE` for unsupported `Avoided Loss` / `Missed Opportunity` instead of fabricating values.
- [ ] Run `PYTHONPATH=src:. python -m pytest tests/test_backtest_metrics.py -v` until GREEN.

### Task 2: Run-artifact writer and report

**Files:**
- Create: `backtest/report.py`
- Test: `tests/test_backtest_report.py`

**Interfaces:**
- Produces `write_run_artifacts(run_dir: Path, *, input_payload: dict, manifest: dict, run_config: dict, metrics: dict, report: dict) -> dict[str, Path]`.
- Produces `build_report(metrics: dict, run_config: dict, manifest: dict) -> dict`.

- [ ] Write failing tests requiring `input_data.json`, `data_manifest.json`, `run_config.json`, `metrics.json`, `report.json`, `report.md`, and existing `events.sqlite` under one deterministic run directory.
- [ ] Require JSON output to use stable key ordering and UTF-8; write atomically through temporary files followed by replace.
- [ ] Report must include historical labels, symbol, strategy version, Git SHA, run ID, UTC and Asia/Taipei window, data-source family, manifest SHA-256, execution-fidelity disclosure, performance KPIs, cost attribution, segments, funnel, and integrity diagnostics.
- [ ] `report.md` must explicitly state that intrabar mark-price path reconstruction is unavailable in Research Grade v1 and that execution/position management uses the accepted historical sampling model.
- [ ] Run report tests until GREEN.

### Task 3: Binance USD-M public historical fetcher

**Files:**
- Create: `backtest/binance_history.py`
- Test: `tests/test_binance_history.py`

**Interfaces:**
- Produces `BinancePublicHistoryClient` with only public GET endpoints.
- Produces `fetch_study_inputs(*, end_ms: int, execution_days: int = 365, warmup_days: int = 200) -> dict`.

- [ ] Unit-test URL/path allowlist; only `/fapi/v1/exchangeInfo`, `/fapi/v1/klines`, and `/fapi/v1/fundingRate` are accepted.
- [ ] Test pagination with an injected transport; reject duplicate/non-monotonic timestamps.
- [ ] Fetch native `1h`, `4h`, `1d` for `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, plus funding history for those symbols.
- [ ] Fetch from `execution_start - 200 days` through `end_ms`; execution KPIs remain `[execution_start, end_ms)`.
- [ ] Filter `exchange_info.symbols` to `ETHUSDT` only so Scanner can trade only ETH while context rows still include BTC/ETH/SOL.
- [ ] Preserve complete kline arrays returned by Binance and record retrieval time/source family.
- [ ] Fail closed if any required execution-window ETH 1H open is missing.
- [ ] Run fetcher unit tests until GREEN.

### Task 4: Formal study runner / CLI

**Files:**
- Create: `backtest/cli.py`
- Modify: `backtest/replay_engine.py`
- Test: `tests/test_eth_one_year_replay.py`

**Interfaces:**
- Produces `run_eth_365_study(*, output_root: Path, now_ms: int | None = None, input_payload: dict | None = None) -> dict`.
- CLI: `PYTHONPATH=src:. python -m backtest.cli eth365 --output-root artifacts/backtests`.

- [ ] Write a deterministic fixture test using injected historical input payload; verify warm-up events do not contribute to KPI trade counts and execution timestamps are inside `[start_ms,end_ms)`.
- [ ] Resolve `end_ms = floor(run_start_ms / 1h) * 1h`; `start_ms = end_ms - 365 days`; warm-up begins 200 days earlier.
- [ ] Load `FOXYYA_V2_CONFIG.json`, strategy version and initial NAV without mutating it.
- [ ] Construct `HistoricalDataset`, `HistoricalClock`, `HistoricalMarketAdapter(primary_symbol='ETHUSDT')`, deterministic run ID, and isolated `ResearchLedgerFactory`.
- [ ] Run `HistoricalReplayEngine`; then build metrics/report and write all artifacts.
- [ ] Run config must include UTC and Asia/Taipei ISO timestamps, execution fidelity, fee/slippage/funding model, Git SHA, strategy version, data manifest SHA, symbol scope, warm-up range, `paper_only=true`, `real_orders=false`.
- [ ] A successful result requires ledger integrity, no duplicate fills, no backfill, no required-open gaps, and complete provenance; otherwise return/raise failed diagnostics instead of normal metrics.

### Task 5: Read-only historical API

**Files:**
- Modify: `service.py`
- Test: `tests/test_backtest_api.py`

**Interfaces:**
- Adds `GET /api/backtest/latest` and `GET /api/backtest/report?run_id=<id>`.
- Reads only from `FOXYYA_BACKTEST_ROOT`, defaulting to `/data/backtests`; never writes from HTTP handlers.

- [ ] Test no artifact root returns `{"status":"UNAVAILABLE","mode":"HISTORICAL BACKTEST"}` with 503.
- [ ] Test valid latest report returns only report/metrics/run-config data and historical labels.
- [ ] Test path traversal in `run_id` returns 400.
- [ ] Test API handler does not open or mutate production paper ledger for backtest reads.
- [ ] Keep `/api/runtime/*` behavior unchanged.

### Task 6: Historical Backtest UI

**Files:**
- Modify: `runtime_ui.js`
- Modify: `live_ui.html` only if a navigation anchor is required by the existing router.
- Test: `tests/runtime_backtest.test.cjs`

**Interfaces:**
- Adds one separate Backtest screen sourced only from `/api/backtest/latest`.

- [ ] Add a regression test proving Backtest copy contains `HISTORICAL BACKTEST` and `歷史模擬・非 Forward Performance`.
- [ ] Show Run ID, ETHUSDT period, strategy/Git provenance, closed trades, win rate + n, net return, PF, Expectancy R, Max DD, costs, funnel and segment sample status.
- [ ] Never reuse Forward Paper headline KPIs as backtest values.
- [ ] If historical report is unavailable, show an explicit unavailable state; never substitute current Forward data.
- [ ] Keep desktop and mobile layout within existing platform conventions.

### Task 7: Full CI and formal ETHUSDT trailing-365-day study

**Files:**
- Create: `.github/workflows/phase3-ci.yml`
- Create: `.github/workflows/eth365-study.yml`

**Interfaces:**
- Phase 3 CI runs all Phase 0/1/2/3 Python and Node tests plus Docker safety smoke.
- ETH study workflow fetches Binance public inputs, runs the study, uploads the deterministic run directory as a GitHub Actions artifact, and prints a compact metrics summary.

- [ ] Phase 3 CI must run on the feature branch and PRs to `main`.
- [ ] ETH study workflow on this feature branch must run once after implementation, use Python 3.12, install only pytest if needed, set `PYTHONPATH=src:.`, and run `python -m backtest.cli eth365 --output-root artifacts/backtests`.
- [ ] Upload `artifacts/backtests/**` using `actions/upload-artifact@v4`.
- [ ] Inspect workflow output and artifact. Require: no integrity error, no lookahead/backfill violation, duplicate fills = 0, complete hashes/provenance, explicit gross-vs-net costs, and all accepted metrics.
- [ ] Do not reject the study for poor strategy performance or low trade count.
- [ ] Run full Docker build and safety smoke confirming `REAL_ORDER_LOCK=True`, `paper_only=True`, `real_order_lock=True`.

### Task 8: Integration review and staging verification

**Files:**
- No strategy-core changes expected.

- [ ] Compare `main...feature` and reject unexpected modifications under `src/foxyya/` unless strictly required for a discovered parity bug; any such need must be separately reviewed.
- [ ] Create a PR only after Phase 3 CI and the formal study workflow succeed.
- [ ] Re-run Phase 0/1/2/3 PR checks.
- [ ] Deploy to isolated staging only; do not apply the existing unknown Railway staged patch and do not repoint the production paper service.
- [ ] Verify staging runtime remains PAPER_ONLY / REAL_ORDER_LOCK and the backtest API is read-only.
- [ ] Production rollout remains blocked until the unknown Railway staged patch can be safely inspected or discarded outside this implementation.

## Completion Definition

The Backtest subsystem is code-complete when Tasks 1–8 pass and one actual Binance-public ETHUSDT trailing-365-day study artifact exists with complete provenance. FOXYYA production deployment is not declared complete unless the Railway production configuration is also safely reconciled; no unknown staged changes may be applied merely to reach a percentage target.