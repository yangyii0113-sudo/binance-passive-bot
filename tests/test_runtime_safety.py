from __future__ import annotations

import importlib
import json
from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "src").resolve()
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

service = importlib.import_module("service")
from foxyya import REAL_ORDER_LOCK
from foxyya.config import load_runtime_config
from foxyya.market import PUBLIC_PATHS, PublicBinanceClient
from foxyya.security import audit_source_tree, prohibited_tokens


def test_runtime_status_is_paper_only_and_real_order_locked():
    snapshot = service.RuntimeState("safety-test").snapshot()
    assert snapshot["paper_only"] is True
    assert snapshot["real_order_lock"] is True
    assert REAL_ORDER_LOCK is True


def test_runtime_config_rejects_disabling_real_order_lock(tmp_path: Path):
    config = tmp_path / "unsafe.json"
    config.write_text(json.dumps({"real_order_lock": False}), encoding="utf-8")
    with pytest.raises(ValueError, match="paper-only lock cannot be disabled"):
        load_runtime_config(config)


def test_service_keeps_canonical_production_ledger_default():
    source = (ROOT / "service.py").read_text(encoding="utf-8")
    assert 'os.getenv("FOXYYA_DB", "/data/foxyya_v2_paper.sqlite")' in source


def test_canonical_source_tree_passes_private_order_audit():
    result = audit_source_tree(SRC / "foxyya")
    assert result["real_order_lock"] is True
    assert result["hits"] == []
    assert result["safe"] is True


def test_market_client_rejects_private_or_signed_paths_before_network_access():
    client = PublicBinanceClient(base="https://example.invalid")
    forbidden = [
        "/fapi/v1/order",
        "/fapi/v1/leverage",
        "/fapi/v2/account",
        "/fapi/v3/account",
        "/sapi/v1/capital/withdraw/apply",
    ]
    for path in forbidden:
        with pytest.raises(ValueError, match="public path not allowed"):
            client._get(path)

    assert set(PUBLIC_PATHS.values()).isdisjoint(set(forbidden))
    assert "/fapi/v1/order" in prohibited_tokens()
