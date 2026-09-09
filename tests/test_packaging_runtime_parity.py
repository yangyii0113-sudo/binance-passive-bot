from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]

FIXTURE = r'''
import base64
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import zipfile
from types import SimpleNamespace

ROOT = Path(os.environ["FOXYYA_REPO_ROOT"])
MODE = os.environ["FOXYYA_SOURCE_MODE"]
archive_tmp = None

if MODE == "archive":
    archive_tmp = tempfile.TemporaryDirectory()
    packed = b"".join(p.read_bytes() for p in sorted((ROOT / "backend_parts2").glob("part*")))
    zipfile.ZipFile(io.BytesIO(base64.b64decode(packed, validate=True))).extractall(archive_tmp.name)
    source_root = Path(archive_tmp.name) / "foxyya_runtime_backend" / "src"
elif MODE == "normalized":
    source_root = ROOT / "src"
else:
    raise RuntimeError(MODE)

sys.path.insert(0, str(source_root))
sys.path.insert(1, str(ROOT))

from foxyya.execution import ExecutionEngine, HOUR
from foxyya.ledger import EventLedger
from foxyya.portfolio import PortfolioService
from foxyya.risk import RiskBook
from runtime_view import project_runtime

with tempfile.TemporaryDirectory() as td:
    ledger = EventLedger(Path(td) / "paper.sqlite")
    risk = RiskBook(1000)
    engine = ExecutionEngine(ledger, risk, nav=1000)
    decision = SimpleNamespace(
        qualified=True,
        signal_id="signal-parity",
        symbol="ETHUSDT",
        side="LONG",
        family="A",
        decision_close_ms=HOUR - 1,
        stop=98,
    )
    intent = engine.create_intent(
        decision,
        decision_persist_ms=HOUR + 1,
        reference_price=100,
        step=.001,
        bucket="ETH_BETA",
    )
    engine.revalidate_intent(
        intent["intent_id"],
        observed_ms=2 * HOUR - 1000,
        mark=100,
        atr_extension=1,
        data_latest_ms=2 * HOUR - 1000,
    )
    entry = engine.fill_due_intent(
        intent["intent_id"], 2 * HOUR, 100, observed_ms=2 * HOUR + 1
    )
    portfolio = PortfolioService(ledger, risk, initial_nav=1000)
    pid = entry["position_id"]
    portfolio.mark(pid, 2 * HOUR + 2, 104)
    portfolio.funding("fund-parity", pid, 2 * HOUR + 3, .0001, 104)
    portfolio.partial_exit("tp-parity", pid, 2 * HOUR + 4, 104, .5, "TP1")
    portfolio.exit("exit-parity", pid, 2 * HOUR + 5, 101, "TRAIL")
    projection = project_runtime(ledger.events(), 1000, 3 * HOUR)
    print(json.dumps(projection, sort_keys=True, separators=(",", ":")))
    ledger.close()
'''


def run_projection(mode: str) -> dict:
    env = os.environ.copy()
    env["FOXYYA_REPO_ROOT"] = str(ROOT)
    env["FOXYYA_SOURCE_MODE"] = mode
    output = subprocess.check_output(
        [sys.executable, "-c", FIXTURE],
        cwd=ROOT,
        env=env,
        text=True,
    )
    return json.loads(output)


def test_archive_and_normalized_source_produce_identical_runtime_projection():
    archive_projection = run_projection("archive")
    normalized_projection = run_projection("normalized")

    assert normalized_projection == archive_projection
    assert normalized_projection["status"] == "PAPER_ONLY"
    assert normalized_projection["real_orders"] is False
    assert normalized_projection["complete"] is True
    assert len(normalized_projection["trades"]) == 1
    assert normalized_projection["trades"][0]["closed"] is True
