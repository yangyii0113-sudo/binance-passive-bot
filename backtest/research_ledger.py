from __future__ import annotations

from pathlib import Path

from foxyya.ledger import EventLedger


PRODUCTION_LEDGER_PATH = Path("/data/foxyya_v2_paper.sqlite")


def _resolved(path: str | Path) -> Path:
    return Path(path).expanduser().resolve(strict=False)


class ResearchLedger(EventLedger):
    """Append-only FOXYYA ledger that is forbidden from opening production data.

    Historical replay deliberately reuses the production EventLedger format so
    portfolio/risk/execution code sees identical event semantics. The only new
    behavior is a fail-closed path guard around the canonical Forward Paper DB.
    """

    def __init__(self, path: str | Path):
        resolved = _resolved(path)
        if resolved == _resolved(PRODUCTION_LEDGER_PATH):
            raise ValueError("historical replay cannot open the production paper ledger")
        resolved.parent.mkdir(parents=True, exist_ok=True)
        self.path = resolved
        super().__init__(resolved)
