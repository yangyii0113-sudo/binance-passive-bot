"""Pure point-in-time revenue context and source-specific event timeline."""
from __future__ import annotations

from datetime import timedelta, timezone
from decimal import Decimal, localcontext

from ..contracts import Availability
from ..fundamental_contracts import (
    KINDS, DisclosureBatch, DisclosureCoverage, DisclosureIntegrityError,
    FundamentalsSnapshot, RevenueContext, RevenueRecord, TimelineEvent, instant, iso_date,
)


def _growth(current: int | None, previous: int | None) -> Decimal | None:
    if current is None or previous in (None, 0):
        return None
    with localcontext() as ctx:
        ctx.prec = 80
        return ((Decimal(current) / Decimal(previous) - 1) * 100).quantize(Decimal('0.000001'))


def build_fundamentals(batches, *, instrument_id: str, venue: str, as_of: str) -> FundamentalsSnapshot:
    cutoff = instant(as_of)
    today = cutoff.astimezone(timezone(timedelta(hours=8))).date()
    if venue not in ('TWSE', 'TPEX') or not instrument_id.startswith(venue.lower() + ':') or not instrument_id.split(':')[1]:
        raise DisclosureIntegrityError('instrument/venue mismatch')
    eligible = []
    for batch in batches:
        if not isinstance(batch, DisclosureBatch):
            raise DisclosureIntegrityError('canonical disclosure batch required')
        if batch.venue == venue and instant(batch.captured_at) <= cutoff:
            eligible.append(batch)
    # Validate every eligible receipt before selecting newer versions; a newer
    # snapshot cannot hide an earlier integrity conflict based on input order.
    receipts = {}
    for batch in eligible:
        key = (batch.dataset, instant(batch.captured_at))
        if key in receipts and receipts[key] != batch:
            raise DisclosureIntegrityError('conflicting dataset snapshot at same receipt time')
        receipts[key] = batch
    coverage = []
    latest_batches = {}
    for kind in KINDS:
        dataset = f'{venue.lower()}_{kind}'
        matching = [b for b in eligible if b.dataset == dataset]
        if not matching:
            coverage.append(DisclosureCoverage(dataset, Availability.UNAVAILABLE, None, None, None, 0, 'not_received_by_cutoff'))
            continue
        latest_time = max(instant(b.captured_at) for b in matching)
        latest = [b for b in matching if instant(b.captured_at) == latest_time]
        # Two differing receipts with the same source/time are ambiguous.
        if any(b != latest[0] for b in latest[1:]):
            raise DisclosureIntegrityError('conflicting dataset snapshot at same receipt time')
        batch = latest[0]
        latest_batches[dataset] = batch
        status, reason = Availability.AVAILABLE, None
        if batch.error:
            status, reason = Availability.UNAVAILABLE, batch.error
        elif kind == 'revenue' and not batch.records:
            status, reason = Availability.UNAVAILABLE, 'empty_revenue_snapshot'
        elif (today - iso_date(batch.observed_at)).days > 14:
            status, reason = Availability.STALE, 'source_snapshot_older_than_14_days'
        coverage.append(DisclosureCoverage(dataset, status, batch.captured_at,
                                          batch.observed_at, batch.source_url, len(batch.records), reason))
    known = {}
    for batch in eligible:
        for record in batch.records:
            if record.instrument_id != instrument_id or instant(record.evidence.available_at) > cutoff:
                continue
            key = ((record.evidence.dataset, record.instrument_id, record.period)
                   if isinstance(record, RevenueRecord) else record.record_id)
            old = known.get(key)
            if old is None or instant(record.evidence.captured_at) > instant(old.evidence.captured_at):
                known[key] = record
            elif instant(record.evidence.captured_at) == instant(old.evidence.captured_at) and old != record:
                raise DisclosureIntegrityError('conflicting disclosure version')
    revenue_rows = [r for r in known.values() if isinstance(r, RevenueRecord)]
    revenue = max(revenue_rows, key=lambda r: r.period, default=None)
    revenue_coverage = coverage[0]
    status, reason = revenue_coverage.availability, revenue_coverage.reason
    if revenue is None:
        status, reason = Availability.UNAVAILABLE, 'no_company_revenue_known_by_cutoff'
    elif revenue.current is None:
        status, reason = Availability.UNAVAILABLE, 'current_revenue_missing'
    elif not latest_batches[revenue.evidence.dataset].error and not any(
        r.instrument_id == instrument_id and r.period == revenue.period
        for r in latest_batches[revenue.evidence.dataset].records
    ):
        status, reason = Availability.UNAVAILABLE, 'company_not_in_latest_snapshot'
    elif status == Availability.AVAILABLE:
        period = iso_date(revenue.period + '-01')
        age_months = (today.year - period.year) * 12 + today.month - period.month
        if age_months > 2 or (today - iso_date(revenue.evidence.observed_at)).days > 14:
            status, reason = Availability.STALE, 'company_revenue_is_old'
    context = RevenueContext(revenue, status,
        _growth(revenue.current, revenue.previous_month) if revenue else None,
        _growth(revenue.current, revenue.previous_year) if revenue else None,
        _growth(revenue.cumulative, revenue.previous_cumulative) if revenue else None, reason)
    events = []
    by_dataset = {item.dataset: item for item in coverage}
    for record in sorted((r for r in known.values() if not isinstance(r, RevenueRecord)),
                         key=lambda r: (r.event_date or '9999-12-31', r.record_id)):
        source = by_dataset[record.evidence.dataset]
        latest = latest_batches[record.evidence.dataset]
        state, reason = source.availability, source.reason
        if latest.error:
            presence = 'latest_fetch_failed'
        elif any(r.record_id == record.record_id for r in latest.records):
            presence = 'present_in_latest_snapshot'
            if state == Availability.AVAILABLE and (today - iso_date(record.evidence.observed_at)).days > 14:
                state, reason = Availability.STALE, 'record_source_observation_is_old'
        else:
            presence = 'absent_from_latest_snapshot'
            if record.kind == 'exright' and record.event_date >= today.isoformat():
                state, reason = Availability.UNAVAILABLE, 'schedule_no_longer_confirmed_by_latest_source'
            else:
                state, reason = Availability.STALE, 'historical_record_outside_latest_snapshot'
        events.append(TimelineEvent(record, state, presence, reason))
    events = tuple(events)
    return FundamentalsSnapshot(instrument_id, venue, cutoff.isoformat(), context, events, tuple(coverage), (
        'Material feed is rolling coverage, not a complete disclosure or earnings archive.',
        'Knowledge time is conservatively bounded by system receipt; replay requires persisted snapshots.',
        'Event fact dates and keyword topics do not prove an earnings release or confirmed future schedule.',
        'Cross-source events remain distinct; dividend events do not adjust historical prices.',
        'Each event must be interpreted with its dataset coverage and source observation date.',
    ))
