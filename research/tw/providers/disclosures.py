"""Strict adapters for official TWSE/TPEx public disclosure snapshots."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, localcontext
from hashlib import sha256
from html import unescape
import json
import re
from typing import TYPE_CHECKING, Callable

from ..fundamental_contracts import (
    DisclosureBatch, DisclosureEvidence, DisclosureEvent, DisclosureIntegrityError,
    RevenueRecord, instant, iso_date,
)
from .http import BytesTransport

if TYPE_CHECKING:
    from ..disclosure_archive import DisclosureArchive

TAIPEI = timezone(timedelta(hours=8))
SOURCES = {
    'twse_revenue': 'https://openapi.twse.com.tw/v1/opendata/t187ap05_L',
    'twse_material': 'https://openapi.twse.com.tw/v1/opendata/t187ap04_L',
    'twse_dividend': 'https://openapi.twse.com.tw/v1/opendata/t187ap45_L',
    'twse_exright': 'https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL',
    'tpex_revenue': 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O',
    'tpex_material': 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O',
    'tpex_dividend': 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap39_O',
    'tpex_exright': 'https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost',
}
REVENUE_FIELDS = (
    '營業收入-當月營收', '營業收入-上月營收', '營業收入-去年當月營收',
    '累計營業收入-當月累計營收', '累計營業收入-去年累計營收',
)


def _text(value) -> str:
    return unescape(str(value)).strip() if value is not None else ''


def _required(row, key) -> str:
    value = _text(row.get(key))
    if not value:
        raise DisclosureIntegrityError(f'missing {key}')
    return value


def _date(value, *, optional=False) -> str | None:
    value = _text(value).replace('/', '').replace('-', '')
    if value in ('', '0', '--') and optional:
        return None
    if not re.fullmatch(r'\d{7,8}', value):
        raise DisclosureIntegrityError('invalid official date')
    year = int(value[:-4]) + (1911 if len(value) == 7 else 0)
    result = f'{year:04d}-{value[-4:-2]}-{value[-2:]}'
    iso_date(result)
    return result


def _period(value) -> str:
    value = _text(value).replace('/', '').replace('-', '')
    if not re.fullmatch(r'\d{5,6}', value):
        raise DisclosureIntegrityError('invalid revenue period')
    year = int(value[:-2]) + (1911 if len(value) == 5 else 0)
    result = f'{year:04d}-{value[-2:]}'
    iso_date(result + '-01')
    return result


def _number(value) -> Decimal | None:
    if value is None or _text(value) in ('', '--', '-', 'N/A', '尚未公告'):
        return None
    try:
        if isinstance(value, bool):
            raise ValueError('boolean')
        text = _text(value)
        if ',' in text and not re.fullmatch(r'-?\d{1,3}(,\d{3})+(\.\d+)?', text):
            raise ValueError('invalid grouping')
        number = Decimal(text.replace(',', ''))
        if (not number.is_finite() or number.copy_abs() >= Decimal('1e30')
            or number.as_tuple().exponent < -12):
            raise ValueError('number out of bounds')
        return number
    except (ValueError, InvalidOperation) as exc:
        raise DisclosureIntegrityError('invalid official numeric value') from exc


def _integer(value) -> int | None:
    number = _number(value)
    if number is None:
        return None
    if number != number.to_integral_value():
        raise DisclosureIntegrityError('revenue must be integral TWD_THOUSAND')
    return int(number)


def _sum_fields(row, keys) -> Decimal | None:
    values = tuple(_number(row.get(key)) for key in keys)
    if any(v is None for v in values):
        return None
    with localcontext() as ctx:
        ctx.prec = 60
        return sum(values, Decimal(0))


def _identity(dataset, symbol, *parts) -> str:
    digest = sha256(json.dumps((symbol, *parts), ensure_ascii=False).encode()).hexdigest()
    return dataset + ':' + digest


def normalize_disclosures(dataset: str, payload, *, captured_at: str,
                          raw_sha256: str) -> DisclosureBatch:
    if dataset not in SOURCES or not isinstance(payload, list):
        raise DisclosureIntegrityError('unsupported dataset or non-list official payload')
    venue, kind = dataset.split('_')
    captured_at = instant(captured_at).isoformat()
    received_day = instant(captured_at).astimezone(TAIPEI).date().isoformat()
    records = {}
    observed_dates = []
    for original in payload:
        if not isinstance(original, dict):
            raise DisclosureIntegrityError('official row must be an object')
        row = {k.strip(): v for k, v in original.items()}
        if len(row) != len(original):
            raise DisclosureIntegrityError('ambiguous source field names')
        foreign_keys = venue == 'tpex' and kind in ('material', 'exright')
        code_key = 'SecuritiesCompanyCode' if foreign_keys else ('Code' if kind == 'exright' else '公司代號')
        symbol = _required(row, code_key)
        if not re.fullmatch(r'[A-Za-z0-9]+', symbol):
            raise DisclosureIntegrityError('invalid security code')
        instrument = f'{venue}:{symbol}'
        observation = received_day if kind == 'exright' else _date(row.get('Date' if foreign_keys else '出表日期'))
        if observation > received_day:
            raise DisclosureIntegrityError('source snapshot date is in the future')
        observed_dates.append(observation)
        published = None
        if kind == 'material':
            day = _date(row.get('發言日期'))
            time = _required(row, '發言時間').replace(':', '').zfill(6)
            if not re.fullmatch(r'\d{6}', time):
                raise DisclosureIntegrityError('invalid publication time')
            published = instant(f'{day}T{time[:2]}:{time[2:4]}:{time[4:]}+08:00').isoformat()
        evidence = DisclosureEvidence(dataset, SOURCES[dataset], observation,
                                      captured_at, raw_sha256, published)
        if kind == 'revenue':
            period = _period(row.get('資料年月'))
            if period > observation[:7]:
                raise DisclosureIntegrityError('reporting period exceeds source snapshot date')
            if any(key not in row for key in REVENUE_FIELDS):
                raise DisclosureIntegrityError('revenue field schema missing')
            record = RevenueRecord(_identity(dataset, symbol, period), instrument, period,
                                   *(_integer(row[k]) for k in REVENUE_FIELDS), evidence)
        elif kind == 'material':
            title = _required(row, '主旨')
            normalized_title = re.sub(r'\s+', '', title)
            topics = []
            if any(word in normalized_title for word in ('法說會', '法人說明會')):
                topics.append('investor_conference')
            if '財務報告' in normalized_title and any(word in normalized_title for word in ('自結', '重編', '更補正', '董事會通過', '通過本公司')):
                topics.append('financial_report')
            record = DisclosureEvent(
                _identity(dataset, symbol, published, _text(row.get('符合條款')), normalized_title),
                instrument, kind, title, _text(row.get('說明')),
                _date(row.get('事實發生日'), optional=True), 'fact_date', evidence, tuple(topics),
            )
        elif kind == 'dividend':
            year = _required(row, '股利年度')
            if not re.fullmatch(r'\d{3,4}', year):
                raise DisclosureIntegrityError('invalid dividend year')
            year = str(int(year) + (1911 if len(year) == 3 else 0))
            season = _text(row.get('股利所屬年(季)度')) or '年度'
            period = f'{year}:{season}:{_required(row, "期別")}'
            if venue == 'twse':
                prefix = '股東配發-'
                cash_keys = [prefix + text for text in (
                    '盈餘分配之現金股利(元/股)', '法定盈餘公積發放之現金(元/股)', '資本公積發放之現金(元/股)')]
                stock_keys = [prefix + text for text in (
                    '盈餘轉增資配股(元/股)', '法定盈餘公積轉增資配股(元/股)', '資本公積轉增資配股(元/股)')]
                board_key = '董事會（擬議）股利分派日'
            else:
                prefix = '股東配發內容-'
                cash_keys = [prefix + text for text in (
                    '盈餘分配之現金股利(元/股)', '法定盈餘公積、資本公積發放之現金(元/股)')]
                stock_keys = [prefix + text for text in (
                    '盈餘轉增資配股(元/股)', '法定盈餘公積、資本公積轉增資配股(元/股)')]
                board_key = '董事會決議通過股利分派日'
            # Legacy TPEx rows omit quarter identity and can share year/period/board
            # date. Preserve row identity; never infer a revision chain or sum them.
            legacy_identity = json.dumps({k: v for k, v in row.items() if k != '出表日期'}, ensure_ascii=False, sort_keys=True) if venue == 'tpex' else None
            record = DisclosureEvent(
                _identity(dataset, symbol, period, _date(row.get(board_key), optional=True), legacy_identity), instrument, kind, f'{year} {season} 股利分派',
                _text(row.get('備註')), _date(row.get(board_key), optional=True),
                'board_resolution_date', evidence, status=_text(row.get('決議（擬議）進度')) or None,
                cash_dividend_per_share=_sum_fields(row, cash_keys),
                stock_dividend_twd_per_share=_sum_fields(row, stock_keys), fiscal_period=period,
                identity_basis='archival_row_fingerprint' if venue == 'tpex' else 'source_fields',
            )
        else:
            day = _date(row.get('ExRrightsExDividendDate' if venue == 'tpex' else 'Date'))
            status = _required(row, 'ExRrightsExDividend' if venue == 'tpex' else 'Exdividend')
            record = DisclosureEvent(
                _identity(dataset, symbol, day, status), instrument, kind,
                f'{_text(row.get("CompanyName" if venue == "tpex" else "Name"))} {status}', '',
                day, 'ex_date', evidence, status=status, cash_dividend_per_share=_number(row.get('CashDividend')),
            )
        old = records.get(record.record_id)
        if old is not None and old != record:
            raise DisclosureIntegrityError('conflicting duplicate disclosure')
        records[record.record_id] = record
    return DisclosureBatch(dataset, venue.upper(), kind, captured_at,
                           max(observed_dates, default=received_day), SOURCES[dataset], raw_sha256,
                           tuple(records[key] for key in sorted(records)))


class DisclosureProvider:
    """Public-only fetch; the archive owns durable receipt and raw replay."""
    def __init__(self, transport: BytesTransport, archive: DisclosureArchive,
                 *, clock: Callable[[], str] | None = None):
        self.transport = transport
        self.archive = archive
        self.clock = clock or (lambda: datetime.now(timezone.utc).isoformat())

    def fetch(self, dataset: str) -> DisclosureBatch:
        if dataset not in SOURCES:
            raise DisclosureIntegrityError('unsupported dataset')
        raw = None
        error = None
        try:
            raw = self.transport.get_bytes(SOURCES[dataset])
        except Exception as exc:  # network boundary, no success fallback
            error = f'fetch_failed:{type(exc).__name__}'
        # Receipt is recorded after the response, never before a slow request.
        return self.archive.record(dataset, raw, captured_at=self.clock(), error=error)
