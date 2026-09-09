from pathlib import Path
from types import SimpleNamespace

from backtest.cli import build_run_config, resolve_trailing_window
from backtest.metrics import compute_backtest_metrics
from backtest.report import build_backtest_report
from backtest.research_ledger import ResearchLedger
from foxyya.execution import HOUR
from foxyya.portfolio import PortfolioService
from foxyya.runner import ForwardRunner


DAY = 24 * HOUR


def _decision(signal_id="signal-report-contract"):
    return SimpleNamespace(
        qualified=True,
        signal_id=signal_id,
        decision_close_ms=10 * HOUR,
        symbol="ETHUSDT",
        side="LONG",
        family="A",
        stop=95.0,
        action="ENTRY",
        quality="NORMAL",
    )


def _open_trade_ledger(path: Path):
    ledger = ResearchLedger(path)
    runner = ForwardRunner(ledger, initial_nav=1000)
    persist_ms = 10 * HOUR + 7 * 60_000
    intent = runner.execution.create_intent(
        _decision("signal-open-terminal"),
        decision_persist_ms=persist_ms,
        reference_price=100.0,
        step=0.001,
        bucket="ETH_BETA",
    )
    runner.execution.revalidate_intent(
        intent["intent_id"],
        observed_ms=10 * HOUR + 30 * 60_000,
        mark=100.0,
        atr_extension=1.0,
        data_latest_ms=10 * HOUR + 30 * 60_000,
    )
    runner.execution.fill_due_intent(
        intent["intent_id"],
        11 * HOUR,
        100.0,
        observed_ms=11 * HOUR,
    )
    return ledger


def _closed_trade_ledger(path: Path):
    ledger = ResearchLedger(path)
    runner = ForwardRunner(ledger, initial_nav=1000)
    persist_ms = 10 * HOUR + 7 * 60_000
    intent = runner.execution.create_intent(
        _decision(),
        decision_persist_ms=persist_ms,
        reference_price=100.0,
        step=0.001,
        bucket="ETH_BETA",
    )
    runner.execution.revalidate_intent(
        intent["intent_id"],
        observed_ms=10 * HOUR + 30 * 60_000,
        mark=100.0,
        atr_extension=1.0,
        data_latest_ms=10 * HOUR + 30 * 60_000,
    )
    entry = runner.execution.fill_due_intent(
        intent["intent_id"],
        11 * HOUR,
        100.0,
        observed_ms=11 * HOUR,
    )
    service = PortfolioService(ledger, runner.risk_book, initial_nav=1000)
    service.mark(entry["position_id"], 12 * HOUR, 108.0)
    service.exit("report-contract", entry["position_id"], 13 * HOUR, 110.0, "TEST_EXIT")
    return ledger


def test_trailing_window_ends_at_first_not_yet_closed_hour_boundary():
    now_ms = 500 * DAY + 10 * HOUR + 37 * 60_000
    start_ms, end_ms = resolve_trailing_window(now_ms, days=365)

    assert end_ms == 500 * DAY + 10 * HOUR
    assert start_ms == end_ms - 365 * DAY
    assert end_ms % HOUR == 0


def test_report_contract_has_provenance_labels_funnel_costs_and_fidelity(tmp_path: Path):
    ledger = _closed_trade_ledger(tmp_path / "events.sqlite")
    try:
        start_ms = 10 * HOUR
        end_ms = 20 * HOUR
        run_config = build_run_config(
            symbol="ETHUSDT",
            start_ms=start_ms,
            end_ms=end_ms,
            strategy_version="FOXYYA-EXEC-V2-20260908",
            git_sha="abc123",
            data_manifest_sha256="manifest123",
            initial_nav=1000,
            universe_scope="ETHUSDT_ISOLATED",
        )
        metrics = compute_backtest_metrics(ledger, initial_nav=1000, start_ms=start_ms, end_ms=end_ms)
        report = build_backtest_report(run_config, metrics, ledger_integrity=ledger.verify())

        assert report["label"] == "HISTORICAL BACKTEST"
        assert report["label_zh"] == "歷史模擬・非 Forward Performance"
        assert report["status"] == "VALID_RESEARCH_RUN"
        assert report["provenance"]["symbol"] == "ETHUSDT"
        assert report["provenance"]["strategy_version"] == "FOXYYA-EXEC-V2-20260908"
        assert report["provenance"]["git_sha"] == "abc123"
        assert report["provenance"]["run_id"] == run_config["run_id"]
        assert report["provenance"]["data_manifest_sha256"] == "manifest123"
        assert report["fidelity"]["position_management"] == "HOURLY_MARK_OBSERVATION_APPROXIMATION"
        assert report["fidelity"]["ranking_scope"] == "ETHUSDT_ISOLATED"

        assert metrics["performance"]["closed_trades"] == 1
        assert metrics["performance"]["win_rate"] == 1.0
        assert metrics["performance"]["gross_pnl_usdt"] > metrics["performance"]["net_pnl_usdt"]
        assert metrics["costs"]["fees_usdt"] > 0
        assert metrics["costs"]["slippage_usdt"] > 0
        assert metrics["funnel"]["filled"] == 1
        assert metrics["funnel"]["closed"] == 1
        assert metrics["segmentation"]["family"]["A"]["sample_status"] == "Sample Insufficient"
        assert metrics["integrity"]["backfill_count"] == 0
        assert metrics["integrity"]["duplicate_fill_count"] == 0
    finally:
        ledger.close()


def test_terminal_equity_marks_open_positions_without_forcing_fake_exit(tmp_path: Path):
    ledger = _open_trade_ledger(tmp_path / "open.sqlite")
    try:
        before = len(ledger.events())
        metrics = compute_backtest_metrics(
            ledger,
            initial_nav=1000,
            start_ms=10 * HOUR,
            end_ms=20 * HOUR,
            terminal_marks={"ETHUSDT": 110.0},
        )
        after = len(ledger.events())

        assert before == after
        assert metrics["performance"]["closed_trades"] == 0
        assert metrics["performance"]["net_return"] == 0.0
        assert metrics["performance"]["terminal_open_positions"] == 1
        assert metrics["performance"]["terminal_unrealized_pnl_usdt"] > 0
        assert metrics["performance"]["terminal_equity_usdt"] > 1000
        assert metrics["performance"]["equity_return_including_unrealized"] > 0
        assert not any(event.get("kind") == "PAPER_EXIT" for event in ledger.events())
    finally:
        ledger.close()


def test_zero_closed_sample_is_unavailable_not_fake_zero_expectancy(tmp_path: Path):
    ledger = ResearchLedger(tmp_path / "empty.sqlite")
    try:
        metrics = compute_backtest_metrics(ledger, initial_nav=1000, start_ms=0, end_ms=DAY)
        assert metrics["performance"]["closed_trades"] == 0
        assert metrics["performance"]["win_rate"] is None
        assert metrics["performance"]["average_r"] is None
        assert metrics["performance"]["expectancy_r"] is None
        assert metrics["performance"]["profit_factor"] is None
    finally:
        ledger.close()


def test_run_id_is_deterministic_and_bound_to_manifest_and_git_sha():
    args = dict(
        symbol="ETHUSDT",
        start_ms=100,
        end_ms=200,
        strategy_version="v1",
        git_sha="sha1",
        data_manifest_sha256="manifest1",
        initial_nav=1000,
        universe_scope="ETHUSDT_ISOLATED",
    )
    first = build_run_config(**args)
    second = build_run_config(**args)
    assert first["run_id"] == second["run_id"]

    changed_manifest = build_run_config(**{**args, "data_manifest_sha256": "manifest2"})
    changed_git = build_run_config(**{**args, "git_sha": "sha2"})
    assert changed_manifest["run_id"] != first["run_id"]
    assert changed_git["run_id"] != first["run_id"]
