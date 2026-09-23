#!/usr/bin/env python3
"""Read-only official public disclosure -> P3.4 acceptance (no credentials)."""
from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research.tw.contracts import Availability
from research.tw.disclosure_archive import DisclosureArchive
from research.tw.fundamental_contracts import instant
from research.tw.providers.disclosures import DisclosureProvider, SOURCES
from research.tw.providers.http import UrllibJsonTransport
from research.tw.services.fundamentals import build_fundamentals

ACCEPTANCE = (('TWSE', '2330'), ('TWSE', '2317'), ('TWSE', '2454'),
              ('TWSE', '2308'), ('TWSE', '2881'), ('TPEX', '6488'))


def fundamentals_smoke_summary(batches, *, as_of: str) -> dict:
    batches = tuple(batches)
    expected = set(SOURCES)
    if {b.dataset for b in batches} != expected:
        raise RuntimeError('all eight official disclosure datasets are required')
    failed_sources = {b.dataset: b.error for b in batches if b.error}
    if failed_sources:
        raise RuntimeError('official disclosure source failures: ' +
                           json.dumps(failed_sources, ensure_ascii=False, sort_keys=True))
    results = []
    dataset_coverage = {}
    for venue, symbol in ACCEPTANCE:
        snapshot = build_fundamentals(batches, instrument_id=f'{venue.lower()}:{symbol}',
                                      venue=venue, as_of=as_of)
        revenue = snapshot.revenue
        if (revenue.availability != Availability.AVAILABLE or revenue.record is None
            or revenue.mom_percent is None or revenue.yoy_percent is None
            or snapshot.execution_allowed or snapshot.corporate_action_adjusted):
            raise RuntimeError(f'{venue}:{symbol} revenue acceptance failed: {revenue.reason}')
        for coverage in snapshot.coverage:
            allowed = {Availability.AVAILABLE}
            if coverage.dataset == 'tpex_dividend':
                allowed.add(Availability.STALE)  # verified archival source; not fresh coverage
            if coverage.availability not in allowed:
                raise RuntimeError(f'{coverage.dataset} acceptance failed: {coverage.reason}')
            dataset_coverage[coverage.dataset] = asdict(coverage)
        if any(instant(e.record.evidence.available_at) > instant(as_of) for e in snapshot.events):
            raise RuntimeError('future knowledge leaked into timeline')
        results.append({
            'instrument_id': snapshot.instrument_id, 'period': revenue.record.period,
            'current_revenue': revenue.record.current, 'unit': revenue.record.unit,
            'mom_percent': str(revenue.mom_percent), 'yoy_percent': str(revenue.yoy_percent),
            'evidence': asdict(revenue.record.evidence), 'known_event_count': len(snapshot.events),
            'price_mode': snapshot.price_mode, 'corporate_action_adjusted': False,
            'execution_allowed': False,
        })
    return {'ok': True, 'kind': 'official_fundamentals_events_acceptance',
            'method_version': 'tw-fundamentals.v1', 'as_of': as_of,
            'datasets': list(dataset_coverage.values()), 'results': results,
            'limitations': ['TPEx dividend resolutions may be archival; inspect STALE coverage.',
                            'Daily material feeds are not a complete earnings calendar or history.',
                            'Current fetch cannot establish historical knowledge before receipt.']}


def run(archive_dir: Path) -> dict:
    archive = DisclosureArchive(archive_dir)
    provider = DisclosureProvider(UrllibJsonTransport(timeout_seconds=30, attempts=2), archive)
    # Every dataset is attempted; error receipts are persisted for diagnosis/replay.
    batches = tuple(provider.fetch(dataset) for dataset in SOURCES)
    now = datetime.now(timezone.utc).isoformat()
    result = fundamentals_smoke_summary(batches, as_of=now)
    replay = archive.replay()
    if not all(batch in replay for batch in batches):
        raise RuntimeError('persisted disclosure replay differs from received batch')
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive-dir', type=Path, help='Keep exact raw responses and receipt history here.')
    args = parser.parse_args()
    if args.archive_dir:
        result = run(args.archive_dir)
    else:
        with tempfile.TemporaryDirectory(prefix='tw-disclosures-') as path:
            result = run(Path(path))
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
