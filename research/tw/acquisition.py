from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import time
from typing import Any, Callable

from .providers.http import BytesTransport, ProviderError
from .providers.parsing import parse_roc_date
from .storage.snapshots import RawSnapshotStore


DateResolver = Callable[[Any], str | None]


@dataclass(frozen=True)
class DatasetPolicy:
    dataset: str
    url: str
    resolve_observed_date: DateResolver


def latest_row_date(*keys: str) -> DateResolver:
    def resolve(payload: Any) -> str | None:
        if not isinstance(payload, list):
            return None
        dates: list[str] = []
        for row in payload:
            if not isinstance(row, dict):
                continue
            for key in keys:
                if key not in row:
                    continue
                parsed = parse_roc_date(row.get(key))
                if parsed:
                    dates.append(parsed)
                    break
        return max(dates) if dates else None

    return resolve


class SnapshottingJsonTransport:
    """Fetch exact bytes, persist immutable snapshot, then parse JSON.

    Providers can use this transport without becoming responsible for storage.
    Unknown URLs are rejected so new datasets cannot silently bypass snapshot
    policy.
    """

    def __init__(
        self,
        *,
        transport: BytesTransport,
        store: RawSnapshotStore,
        policies: tuple[DatasetPolicy, ...],
        now: Callable[[], datetime] | None = None,
        attempts: int = 2,
        retry_backoff_seconds: float = 1.0,
    ) -> None:
        self.transport = transport
        self.store = store
        self.policies = {policy.url: policy for policy in policies}
        if attempts < 1:
            raise ValueError("attempts must be >= 1")
        self.now = now or (lambda: datetime.now(timezone.utc))
        self.attempts = attempts
        self.retry_backoff_seconds = retry_backoff_seconds

    def get_json(self, url: str) -> Any:
        policy = self.policies.get(url)
        if policy is None:
            raise ProviderError(f"no snapshot policy registered for: {url}")

        last_error: Exception | None = None
        for attempt in range(1, self.attempts + 1):
            payload = self.transport.get_bytes(url)
            try:
                parsed = json.loads(payload.decode("utf-8-sig"))
            except Exception as exc:
                last_error = exc
                if attempt < self.attempts:
                    time.sleep(self.retry_backoff_seconds * attempt)
                    continue
                break

            observed_date = policy.resolve_observed_date(parsed)
            if observed_date is None:
                raise ProviderError(
                    f"cannot derive observed date for dataset: {policy.dataset}"
                )

            captured_at = self.now().astimezone(timezone.utc).isoformat()
            self.store.append(
                dataset=policy.dataset,
                observed_date=observed_date,
                captured_at=captured_at,
                source_url=url,
                payload=payload,
            )
            return parsed

        raise ProviderError(
            f"provider returned invalid JSON after "
            f"{self.attempts} attempt(s): {url}"
        ) from last_error
