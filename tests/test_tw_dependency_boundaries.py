from __future__ import annotations

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TW_RESEARCH = ROOT / "research" / "tw"
TW_UI = ROOT / "tw_platform"

FORBIDDEN_RESEARCH_IMPORTS = (
    "foxyya.execution",
    "foxyya.runner",
    "foxyya.ledger",
    "foxyya.portfolio",
)

FORBIDDEN_UI_PROVIDER_TOKENS = (
    "twse.com.tw",
    "tpex.org.tw",
    "mops.twse.com.tw",
)


def _imports(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.append(node.module)
    return found


def test_tw_research_cannot_import_execution_plane():
    violations: list[str] = []
    for path in TW_RESEARCH.rglob("*.py"):
        for module in _imports(path):
            if any(
                module == prefix or module.startswith(prefix + ".")
                for prefix in FORBIDDEN_RESEARCH_IMPORTS
            ):
                violations.append(f"{path.relative_to(ROOT)} -> {module}")
    assert violations == []


def test_ui_cannot_call_official_provider_endpoints_directly():
    violations: list[str] = []
    for path in TW_UI.rglob("*"):
        if not path.is_file() or path.suffix not in {".html", ".js", ".css"}:
            continue
        text = path.read_text(encoding="utf-8").lower()
        for token in FORBIDDEN_UI_PROVIDER_TOKENS:
            if token in text:
                violations.append(f"{path.relative_to(ROOT)} -> {token}")
    assert violations == []
