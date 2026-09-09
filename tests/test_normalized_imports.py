from __future__ import annotations

import importlib
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "src").resolve()
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))


def test_canonical_foxyya_modules_resolve_from_repo_src_tree():
    modules = [
        importlib.import_module("foxyya"),
        importlib.import_module("foxyya.config"),
        importlib.import_module("foxyya.execution"),
        importlib.import_module("foxyya.ledger"),
        importlib.import_module("foxyya.runner"),
    ]

    for module in modules:
        module_path = Path(module.__file__).resolve()
        assert module_path.is_relative_to(SRC), module_path


def test_current_service_imports_against_normalized_source_tree():
    service = importlib.import_module("service")
    assert service.ForwardRunner.__module__ == "foxyya.runner"
    assert service.EventLedger.__module__ == "foxyya.ledger"
    assert service.PublicBinanceClient.__module__ == "foxyya.market"
