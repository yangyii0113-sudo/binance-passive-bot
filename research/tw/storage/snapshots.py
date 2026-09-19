from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import tempfile


DATASET_RE = re.compile(r"^[A-Za-z0-9._-]+$")
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class SnapshotConflictError(RuntimeError):
    pass


@dataclass(frozen=True)
class RawSnapshotRecord:
    dataset: str
    observed_date: str
    captured_at: str
    source_url: str
    sha256: str
    size_bytes: int
    relative_path: str


class RawSnapshotStore:
    """Content-addressed, append-only raw payload store.

    Callers must pass the exact response bytes when wire-level preservation
    matters. This class never rewrites an existing snapshot with different
    bytes and never invents a canonical replacement for raw content.
    """

    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    @staticmethod
    def _validate(dataset: str, observed_date: str) -> None:
        if not DATASET_RE.fullmatch(dataset):
            raise ValueError("invalid dataset name")
        if not ISO_DATE_RE.fullmatch(observed_date):
            raise ValueError("observed_date must be YYYY-MM-DD")

    def _manifest_path(self, dataset: str) -> Path:
        return self.root / "manifests" / f"{dataset}.jsonl"

    def _manifest_has_sha(self, dataset: str, digest: str) -> bool:
        manifest = self._manifest_path(dataset)
        if not manifest.exists():
            return False
        with manifest.open("r", encoding="utf-8") as handle:
            for line in handle:
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    raise SnapshotConflictError(
                        f"corrupt snapshot manifest: {manifest}"
                    )
                if row.get("sha256") == digest:
                    return True
        return False

    def append(
        self,
        *,
        dataset: str,
        observed_date: str,
        captured_at: str,
        source_url: str,
        payload: bytes,
    ) -> RawSnapshotRecord:
        self._validate(dataset, observed_date)
        if not isinstance(payload, bytes):
            raise TypeError("payload must be exact bytes")
        if not source_url:
            raise ValueError("source_url is required")
        if not captured_at:
            raise ValueError("captured_at is required")

        digest = sha256(payload).hexdigest()
        year = observed_date[:4]
        relative = Path("raw") / dataset / year / observed_date / f"{digest}.json"
        target = self.root / relative
        target.parent.mkdir(parents=True, exist_ok=True)

        if target.exists():
            if target.read_bytes() != payload:
                raise SnapshotConflictError(
                    f"snapshot hash collision/content conflict: {target}"
                )
        else:
            with tempfile.NamedTemporaryFile(
                mode="wb",
                dir=target.parent,
                prefix=".snapshot-",
                delete=False,
            ) as handle:
                temp_path = Path(handle.name)
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_path, target)

        record = RawSnapshotRecord(
            dataset=dataset,
            observed_date=observed_date,
            captured_at=captured_at,
            source_url=source_url,
            sha256=digest,
            size_bytes=len(payload),
            relative_path=relative.as_posix(),
        )

        if not self._manifest_has_sha(dataset, digest):
            manifest = self._manifest_path(dataset)
            manifest.parent.mkdir(parents=True, exist_ok=True)
            with manifest.open("a", encoding="utf-8") as handle:
                handle.write(
                    json.dumps(
                        asdict(record),
                        ensure_ascii=False,
                        sort_keys=True,
                        separators=(",", ":"),
                    )
                    + "\n"
                )
                handle.flush()
                os.fsync(handle.fileno())

        return record
