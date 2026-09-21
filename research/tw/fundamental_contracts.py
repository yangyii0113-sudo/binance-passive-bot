"""Immutable, point-in-time public disclosure contracts (no provider imports)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import re

from .contracts import Availability

KINDS = ('revenue', 'material', 'dividend', 'exright')


class DisclosureIntegrityError(ValueError):
    pass


def instant(value: str) -> datetime:
    try:
        result = datetime.fromisoformat(value)
        if result.tzinfo is None or result.utcoffset() is None:
            raise ValueError('timezone required')
        return result.astimezone(timezone.utc)
    except (ValueError, TypeError, AttributeError) as exc:
        raise DisclosureIntegrityError('invalid timezone-aware timestamp') from exc


def iso_date(value: str) -> date:
    try:
        if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
            raise ValueError('date format')
        return date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise DisclosureIntegrityError('invalid calendar date') from exc


@dataclass(frozen=True)
class DisclosureEvidence:
    dataset: str
    source_url: str
    observed_at: str
    captured_at: str
    raw_sha256: str
    published_at: str | None = None

    @property
    def available_at(self) -> str:
        known = instant(self.captured_at)
        if self.published_at is not None:
            known = max(known, instant(self.published_at))
        return known.isoformat()

    def __post_init__(self) -> None:
        instant(self.captured_at)
        observed = iso_date(self.observed_at)
        if observed > instant(self.captured_at).astimezone(timezone(timedelta(hours=8))).date():
            raise DisclosureIntegrityError('future source observation')
        if self.published_at is not None:
            instant(self.published_at)
        if not self.dataset or not self.source_url.startswith('https://'):
            raise DisclosureIntegrityError('source required')
        if not re.fullmatch(r'[a-f0-9]{64}', self.raw_sha256):
            raise DisclosureIntegrityError('raw SHA-256 required')


def _validate_record(record_id, instrument_id, evidence) -> None:
    if (not isinstance(record_id, str) or not record_id
        or not isinstance(instrument_id, str)
        or not re.fullmatch(r'(twse|tpex):[A-Za-z0-9]+', instrument_id)
        or not isinstance(evidence, DisclosureEvidence)):
        raise DisclosureIntegrityError('invalid canonical record identity/evidence')


@dataclass(frozen=True)
class RevenueRecord:
    record_id: str
    instrument_id: str
    period: str
    current: int | None
    previous_month: int | None
    previous_year: int | None
    cumulative: int | None
    previous_cumulative: int | None
    evidence: DisclosureEvidence
    unit: str = 'TWD_THOUSAND'

    def __post_init__(self) -> None:
        _validate_record(self.record_id, self.instrument_id, self.evidence)
        iso_date(self.period + '-01')
        if self.period > self.evidence.observed_at[:7]:
            raise DisclosureIntegrityError('future reporting period')
        if self.unit != 'TWD_THOUSAND':
            raise DisclosureIntegrityError('unsupported revenue unit')
        for value in (self.current, self.previous_month, self.previous_year,
                      self.cumulative, self.previous_cumulative):
            if value is not None and (type(value) is not int or abs(value) >= 10**30):
                raise DisclosureIntegrityError('invalid revenue amount')


@dataclass(frozen=True)
class DisclosureEvent:
    record_id: str
    instrument_id: str
    kind: str
    title: str
    detail: str
    event_date: str | None
    date_role: str
    evidence: DisclosureEvidence
    topics: tuple[str, ...] = ()
    status: str | None = None
    cash_dividend_per_share: Decimal | None = None
    stock_dividend_twd_per_share: Decimal | None = None
    fiscal_period: str | None = None
    identity_basis: str = 'source_fields'

    def __post_init__(self) -> None:
        _validate_record(self.record_id, self.instrument_id, self.evidence)
        if self.kind not in KINDS[1:] or not self.title:
            raise DisclosureIntegrityError('invalid event')
        roles = {'material': 'fact_date', 'dividend': 'board_resolution_date', 'exright': 'ex_date'}
        if self.date_role != roles[self.kind] or (self.kind == 'exright' and self.event_date is None):
            raise DisclosureIntegrityError('event date/role inconsistent with kind')
        if self.event_date is not None:
            iso_date(self.event_date)
        for value in (self.cash_dividend_per_share, self.stock_dividend_twd_per_share):
            if value is not None and (not isinstance(value, Decimal) or not value.is_finite()
                                      or value < 0 or value >= Decimal('1e30')):
                raise DisclosureIntegrityError('invalid dividend amount')


@dataclass(frozen=True)
class DisclosureBatch:
    dataset: str
    venue: str
    kind: str
    captured_at: str
    observed_at: str | None
    source_url: str
    raw_sha256: str | None
    records: tuple[RevenueRecord | DisclosureEvent, ...] = ()
    error: str | None = None

    def __post_init__(self) -> None:
        instant(self.captured_at)
        if self.venue not in ('TWSE', 'TPEX') or self.kind not in KINDS:
            raise DisclosureIntegrityError('unsupported disclosure dataset')
        if self.dataset != f'{self.venue.lower()}_{self.kind}':
            raise DisclosureIntegrityError('dataset mismatch')
        if not self.source_url.startswith('https://'):
            raise DisclosureIntegrityError('source required')
        if self.observed_at is not None:
            if iso_date(self.observed_at) > instant(self.captured_at).astimezone(timezone(timedelta(hours=8))).date():
                raise DisclosureIntegrityError('future source observation')
        if self.error and self.records:
            raise DisclosureIntegrityError('failed batch cannot contain records')
        if not self.error and (self.observed_at is None or not self.raw_sha256
                              or not re.fullmatch(r'[a-f0-9]{64}', self.raw_sha256)):
            raise DisclosureIntegrityError('successful batch requires provenance')
        if not isinstance(self.records, tuple):
            raise DisclosureIntegrityError('records must be immutable')
        revenue_keys = {}
        for record in self.records:
            expected_type = RevenueRecord if self.kind == 'revenue' else DisclosureEvent
            if not isinstance(record, expected_type):
                raise DisclosureIntegrityError('wrong canonical record type')
            evidence = record.evidence
            if (not record.record_id or not record.instrument_id.startswith(self.venue.lower() + ':')
                or evidence.dataset != self.dataset or evidence.captured_at != self.captured_at
                or evidence.source_url != self.source_url or evidence.raw_sha256 != self.raw_sha256
                or (isinstance(record, DisclosureEvent) and record.kind != self.kind)):
                raise DisclosureIntegrityError('record/batch provenance mismatch')
            if isinstance(record, RevenueRecord):
                key = (record.instrument_id, record.period)
                if key in revenue_keys and revenue_keys[key] != record:
                    raise DisclosureIntegrityError('conflicting semantic revenue key')
                revenue_keys[key] = record
        if not self.error:
            expected_observation = max(
                (record.evidence.observed_at for record in self.records),
                default=instant(self.captured_at).astimezone(timezone(timedelta(hours=8))).date().isoformat(),
            )
            if self.observed_at != expected_observation:
                raise DisclosureIntegrityError('batch observation must match record provenance')


@dataclass(frozen=True)
class DisclosureCoverage:
    dataset: str
    availability: Availability
    captured_at: str | None
    observed_at: str | None
    source_url: str | None
    row_count: int
    reason: str | None


@dataclass(frozen=True)
class RevenueContext:
    record: RevenueRecord | None
    availability: Availability
    mom_percent: Decimal | None
    yoy_percent: Decimal | None
    ytd_yoy_percent: Decimal | None
    reason: str | None = None


@dataclass(frozen=True)
class TimelineEvent:
    record: DisclosureEvent
    availability: Availability
    source_presence: str
    reason: str | None = None


@dataclass(frozen=True)
class FundamentalsSnapshot:
    instrument_id: str
    venue: str
    as_of: str
    revenue: RevenueContext
    events: tuple[TimelineEvent, ...]
    coverage: tuple[DisclosureCoverage, ...]
    limitations: tuple[str, ...]
    method_version: str = 'tw-fundamentals.v1'
    price_mode: str = 'raw_unadjusted'
    corporate_action_adjusted: bool = False
    execution_allowed: bool = False

    def __post_init__(self) -> None:
        if self.execution_allowed or self.corporate_action_adjusted or self.price_mode != 'raw_unadjusted':
            raise DisclosureIntegrityError('fundamental research cannot authorize execution or price adjustment')
