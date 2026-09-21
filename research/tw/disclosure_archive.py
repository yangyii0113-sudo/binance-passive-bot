"""Exact-byte disclosure archive plus durable acquisition-attempt history."""
from __future__ import annotations

from hashlib import sha256
import json
import os
from pathlib import Path

from .fundamental_contracts import DisclosureBatch, DisclosureIntegrityError, instant
from .storage.snapshots import RawSnapshotStore


class DisclosureArchive:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.store = RawSnapshotStore(self.root)
        self.journal = self.root / 'disclosure_attempts.jsonl'

    @staticmethod
    def _normalize(dataset, raw, captured_at, error=None):
        from .providers.disclosures import SOURCES, normalize_disclosures
        digest = sha256(raw).hexdigest() if raw is not None else None
        if not error:
            try:
                return normalize_disclosures(dataset, json.loads(raw.decode('utf-8-sig')),
                                             captured_at=captured_at, raw_sha256=digest)
            except (DisclosureIntegrityError, UnicodeError, ValueError, TypeError) as exc:
                error = f'parse_failed:{type(exc).__name__}:{exc}'
        venue, kind = dataset.split('_')
        return DisclosureBatch(dataset, venue.upper(), kind, captured_at, None,
                               SOURCES[dataset], digest, error=error)

    def record(self, dataset: str, raw: bytes | None, *, captured_at: str,
               error: str | None = None) -> DisclosureBatch:
        from .providers.disclosures import SOURCES, TAIPEI
        if dataset not in SOURCES or (raw is None and not error):
            raise DisclosureIntegrityError('dataset and response/error required')
        captured_at = instant(captured_at).isoformat()
        receipt_day = instant(captured_at).astimezone(TAIPEI).date().isoformat()
        stored = None
        if raw is not None:
            stored = self.store.append(dataset=dataset, observed_date=receipt_day,
                                       captured_at=captured_at, source_url=SOURCES[dataset], payload=raw)
        result = self._normalize(dataset, raw, captured_at, error)
        attempt = {'dataset': dataset, 'captured_at': captured_at, 'error': result.error,
                   'raw_path': stored.relative_path if stored else None,
                   'raw_sha256': stored.sha256 if stored else None}
        self.root.mkdir(parents=True, exist_ok=True)
        with self.journal.open('a', encoding='utf-8') as handle:
            handle.write(json.dumps(attempt, ensure_ascii=False, sort_keys=True) + '\n')
            handle.flush()
            os.fsync(handle.fileno())
        return result

    def replay(self) -> tuple[DisclosureBatch, ...]:
        from .providers.disclosures import SOURCES
        if not self.journal.exists():
            return ()
        batches = []
        try:
            for line in self.journal.read_text(encoding='utf-8').splitlines():
                attempt = json.loads(line)
                if attempt['dataset'] not in SOURCES:
                    raise DisclosureIntegrityError('unknown archived dataset')
                raw = None
                if attempt['raw_path'] is not None:
                    target = (self.root / attempt['raw_path']).resolve()
                    if not target.is_relative_to((self.root / 'raw').resolve()):
                        raise DisclosureIntegrityError('archive path outside raw store')
                    raw = target.read_bytes()
                    if sha256(raw).hexdigest() != attempt['raw_sha256']:
                        raise DisclosureIntegrityError('archived response hash mismatch')
                elif not attempt['error'] or attempt['raw_sha256'] is not None:
                    raise DisclosureIntegrityError('missing archived response')
                batches.append(self._normalize(attempt['dataset'], raw, attempt['captured_at'], attempt['error']))
        except (OSError, ValueError, TypeError, KeyError, AttributeError) as exc:
            raise DisclosureIntegrityError('corrupt disclosure archive') from exc
        return tuple(batches)
