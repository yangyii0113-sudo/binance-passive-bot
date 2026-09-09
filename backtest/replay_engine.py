from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from backtest.historical_clock import HOUR_MS
from foxyya.model import deterministic_id
from foxyya.portfolio import replay_books
from foxyya.runner import ForwardRunner


@dataclass(frozen=True)
class ReplayPoint:
    phase: str
    open_ms: int
    observed_ms: int


def _canonical_bytes(value) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def _manifest_sha256(dataset) -> str:
    return hashlib.sha256(_canonical_bytes(dataset.manifest())).hexdigest()


def build_replay_points(
    *,
    open_times_ms: list[int],
    start_ms: int,
    end_ms: int,
    preopen_lead_ms: int = 1,
    open_observation_delay_ms: int = 1,
) -> list[ReplayPoint]:
    start_ms = int(start_ms)
    end_ms = int(end_ms)
    preopen_lead_ms = int(preopen_lead_ms)
    open_observation_delay_ms = int(open_observation_delay_ms)

    if start_ms % HOUR_MS or end_ms % HOUR_MS:
        raise ValueError("replay window must be hour aligned")
    if end_ms <= start_ms:
        raise ValueError("replay end must be after start")
    if preopen_lead_ms <= 0 or preopen_lead_ms >= HOUR_MS:
        raise ValueError("preopen lead must be between zero and one hour")
    if open_observation_delay_ms <= 0:
        raise ValueError("open observation delay must be positive")
    if open_observation_delay_ms >= HOUR_MS:
        raise ValueError("open observation delay must be less than one hour")

    available = {int(value) for value in open_times_ms}
    required = list(range(start_ms, end_ms, HOUR_MS))
    missing = [value for value in required if value not in available]
    if missing:
        raise ValueError(f"missing required execution 1h open: {missing[0]}")

    points: list[ReplayPoint] = []
    for open_ms in required:
        preopen_ms = open_ms - preopen_lead_ms
        if preopen_ms >= start_ms:
            points.append(ReplayPoint("PREOPEN", open_ms, preopen_ms))

        observed_ms = open_ms + open_observation_delay_ms
        if observed_ms >= end_ms:
            raise ValueError("open observation delay crosses replay end")
        points.append(ReplayPoint("OPEN_CYCLE", open_ms, observed_ms))

    return points


class HistoricalReplayEngine:
    """Deterministically drives the existing ForwardRunner over historical snapshots."""

    MODE = "HISTORICAL BACKTEST"
    LABEL = "歷史模擬・非 Forward Performance"

    def __init__(self, clock, market, ledger, *, initial_nav: float, runner=None):
        self.clock = clock
        self.market = market
        self.ledger = ledger
        self.initial_nav = float(initial_nav)
        self.runner = runner if runner is not None else ForwardRunner(ledger, initial_nav=self.initial_nav)
        self._ran = False

    def _boundary_event(self, kind: str, *, run_id: str, strategy_version: str, git_sha: str, start_ms: int, end_ms: int, **extra):
        payload = {
            "event_id": deterministic_id(kind.lower(), run_id),
            "kind": kind,
            "run_id": str(run_id),
            "strategy_version": str(strategy_version),
            "git_sha": str(git_sha),
            "start_ms": int(start_ms),
            "end_ms": int(end_ms),
            "mode": self.MODE,
            "label": self.LABEL,
            "paper_only": True,
            "real_orders": False,
            **extra,
        }
        return self.ledger.append(payload)

    def run(self, *, start_ms: int, end_ms: int, run_id: str, strategy_version: str, git_sha: str) -> dict:
        if self._ran:
            raise ValueError("replay engine may run only once")

        start_ms = int(start_ms)
        end_ms = int(end_ms)
        if self.clock.now_ms != start_ms:
            raise ValueError("replay clock must start at execution window start")
        if not run_id:
            raise ValueError("run_id required")

        self.ledger.verify()
        manifest_sha256 = _manifest_sha256(self.market.dataset)
        open_times = [
            int(row[0])
            for row in self.market.dataset.rows(self.market.primary_symbol, "1h")
        ]
        points = build_replay_points(
            open_times_ms=open_times,
            start_ms=start_ms,
            end_ms=end_ms,
        )

        self._ran = True
        self._boundary_event(
            "BACKTEST_RUN_STARTED",
            run_id=run_id,
            strategy_version=strategy_version,
            git_sha=git_sha,
            start_ms=start_ms,
            end_ms=end_ms,
            time_ms=start_ms,
            manifest_sha256=manifest_sha256,
        )

        cycle_count = 0
        for point in points:
            self.clock.advance_to(point.observed_ms)
            snapshot = self.market.snapshot()

            if point.phase == "PREOPEN":
                self.runner.revalidate(snapshot, now_ms=self.clock.now_ms)
                continue

            if point.phase != "OPEN_CYCLE":
                raise ValueError(f"unknown replay phase: {point.phase}")

            self.runner.execute_open(
                snapshot,
                open_ms=point.open_ms,
                observed_ms=self.clock.now_ms,
            )
            self.runner.apply_funding(snapshot, now_ms=self.clock.now_ms)
            self.runner.manage_positions(snapshot, now_ms=self.clock.now_ms)
            self.runner.revalidate(snapshot, now_ms=self.clock.now_ms)
            self.runner.scan_if_new_close(snapshot, now_ms=self.clock.now_ms)
            cycle_count += 1

        pending_intents = len(self.runner.pending())
        state = replay_books(self.ledger, self.initial_nav)["books"]["5x"]
        open_positions_5x = len(state["positions"])

        self._boundary_event(
            "BACKTEST_RUN_COMPLETED",
            run_id=run_id,
            strategy_version=strategy_version,
            git_sha=git_sha,
            start_ms=start_ms,
            end_ms=end_ms,
            time_ms=self.clock.now_ms,
            manifest_sha256=manifest_sha256,
            cycle_count=cycle_count,
            pending_intents=pending_intents,
            open_positions_5x=open_positions_5x,
        )
        ledger_integrity = bool(self.ledger.verify())

        return {
            "run_id": str(run_id),
            "manifest_sha256": manifest_sha256,
            "cycle_count": cycle_count,
            "ledger_integrity": ledger_integrity,
            "event_count": len(self.ledger.events()),
            "pending_intents": pending_intents,
            "open_positions_5x": open_positions_5x,
            "clock_end_ms": self.clock.now_ms,
        }
