"""Read-only acceptance gate for completed research bundles; no performance audit."""
from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path

from backtest.historical_market import HistoricalDataset
from backtest.binance_history import validate_study_input_completeness
from backtest.report import LABEL, MODE, _write_json_atomic

REQUIRED_FILES = ('events.sqlite', 'input_data.json', 'data_manifest.json',
                  'run_config.json', 'metrics.json', 'report.json', 'report.md')
SEAL = 'artifact_checksums.json'


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False,
                      allow_nan=False).encode('utf-8')


def _require(condition, message):
    if not condition:
        raise ValueError('invalid research artifacts: ' + message)


def _reject_constant(value):
    raise ValueError('non-finite JSON value: ' + value)


def validate_run_artifacts(run_dir: Path, *, expected_git_sha=None,
                           expected_manifest_sha256=None, require_seal=True) -> dict:
    """Validate files, provenance, inputs and persisted event chain without any writes."""
    run_dir = Path(run_dir).resolve()
    raw = {}
    for name in (*REQUIRED_FILES, *((SEAL,) if require_seal else ())):
        path = run_dir / name
        _require(path.is_file() and not path.is_symlink() and path.resolve().parent == run_dir,
                 'missing or unsafe ' + name)
        raw[name] = path.read_bytes()
    _require(not any((run_dir / ('events.sqlite' + suffix)).exists() for suffix in ('-wal', '-shm')),
             'ledger must be closed and checkpointed')
    docs = {name: json.loads(raw[name], parse_constant=_reject_constant)
            for name in raw if name.endswith('.json')}
    _require(all(isinstance(doc, dict) for doc in docs.values()), 'JSON objects required')
    hashes = {name: hashlib.sha256(raw[name]).hexdigest() for name in REQUIRED_FILES}
    if require_seal:
        _require(docs[SEAL].get('schema') == 'foxyya-backtest-artifact-checksums/1', 'checksum schema')
        _require(docs[SEAL].get('sha256') == hashes, 'artifact checksum mismatch')
    cfg, metrics, report = (docs[name] for name in ('run_config.json', 'metrics.json', 'report.json'))
    inputs, manifest = docs['input_data.json'], docs['data_manifest.json']
    _require(cfg.get('run_id') == run_dir.name, 'run ID mismatch')
    _require(cfg.get('paper_only') is True and cfg.get('real_orders') is False, 'paper safety flags')
    _require(cfg.get('symbol') == 'ETHUSDT' and cfg.get('tradable_symbols') == ['ETHUSDT'], 'symbol scope')
    _require(bool(cfg.get('git_sha')) and cfg['git_sha'] != 'UNAVAILABLE' and bool(cfg.get('strategy_version')), 'code provenance')
    if expected_git_sha is not None:
        _require(cfg['git_sha'] == expected_git_sha, 'Git SHA mismatch')
    manifest_sha = hashlib.sha256(_canonical(manifest)).hexdigest()
    _require(cfg.get('manifest_sha256') == manifest_sha, 'manifest hash mismatch')
    if expected_manifest_sha256 is not None:
        _require(manifest_sha == expected_manifest_sha256, 'input manifest mismatch')
    validate_study_input_completeness(inputs)
    reconstructed = HistoricalDataset(exchange_info=inputs['exchange_info'],
        rows_by_symbol=inputs['rows_by_symbol'], funding_rows_by_symbol=inputs['funding_rows_by_symbol'],
        retrieved_at_ms=inputs['retrieved_at_ms'], source_family=inputs['source_family']).manifest()
    _require(reconstructed == manifest, 'input data does not match manifest')
    start, end = int(cfg['start_ms']), int(cfg['end_ms'])
    _require(end - start == int(cfg['execution_days']) * 86400000 and end > start, 'execution window')
    _require(inputs.get('end_ms') == end and inputs.get('execution_start_ms') == start, 'input window')
    _require(int(cfg['requested_end_ms']) - end == int(cfg['data_lag_ms']) >= 0, 'data lag')
    _require(cfg.get('source_family') == manifest.get('source_family') == 'Binance USD-M Public Data', 'source')
    for doc in (metrics, report):
        _require(doc.get('mode') == MODE and doc.get('label') == LABEL, 'historical labels')
    _require((metrics.get('start_ms'), metrics.get('end_ms'), metrics.get('symbol')) == (start, end, 'ETHUSDT'),
             'metrics scope')
    provenance = report.get('provenance')
    _require(isinstance(provenance, dict), 'report provenance')
    for key in ('run_id', 'git_sha', 'strategy_version', 'symbol', 'manifest_sha256'):
        _require(provenance.get(key) == cfg.get(key), 'report ' + key)
    for key in ('performance', 'cost_attribution', 'funnel', 'risk', 'segments'):
        _require(isinstance(metrics.get(key), dict), 'missing metrics section: ' + key)
    _require(isinstance(metrics.get('monthly_returns'), list), 'monthly returns')
    required_metric_keys = {
        'performance': {'closed_trades', 'win_rate', 'win_rate_n', 'net_return', 'net_pnl_usdt',
                        'avg_r', 'expectancy_r', 'profit_factor', 'max_drawdown', 'drawdown_duration_ms'},
        'cost_attribution': {'gross_raw_pnl_usdt', 'gross_fill_pnl_usdt', 'slippage_usdt',
                             'fees_usdt', 'funding_usdt', 'net_pnl_usdt'},
        'funnel': {'qualified', 'filled', 'qualified_to_filled', 'cancellation_reasons'},
        'risk': {'portfolio_cap_fraction', 'max_reserved_risk_fraction'},
        'segments': {'family', 'side', 'regime', 'book'},
    }
    for section, keys in required_metric_keys.items():
        _require(keys <= metrics[section].keys(), 'missing metric fields: ' + section)
    _require(isinstance(metrics.get('equity_curve'), list) and bool(metrics['equity_curve']), 'equity curve')

    for key in ('performance', 'cost_attribution', 'funnel', 'risk', 'segments', 'monthly_returns'):
        _require(report.get(key) == metrics.get(key), 'report/metrics mismatch: ' + key)
    integrity = cfg.get('integrity')
    _require(isinstance(integrity, dict) and integrity.get('ledger_integrity') is True, 'integrity status')
    for key in ('duplicate_fills', 'backfill_count', 'out_of_window_fills', 'real_order_events', 'execution_required_open_gaps'):
        _require(integrity.get(key) == 0, key)
    _require(report.get('integrity') == integrity, 'report integrity')
    # immutable=1 suppresses journal creation, and only closed sealed ledgers are accepted.
    with sqlite3.connect((run_dir / 'events.sqlite').as_uri() + '?mode=ro&immutable=1', uri=True) as db:
        _require(db.execute('PRAGMA integrity_check').fetchone() == ('ok',), 'SQLite integrity')
        rows = db.execute('SELECT event_id,payload,previous_hash,event_hash FROM events ORDER BY seq').fetchall()
    events, previous, ids = [], '0' * 64, set()
    for event_id, payload, prev, digest in rows:
        _require(prev == previous and hashlib.sha256((prev + payload).encode()).hexdigest() == digest, 'ledger hash chain')
        event = json.loads(payload, parse_constant=_reject_constant)
        _require(isinstance(event, dict) and event.get('event_id') == event_id and event_id not in ids, 'event identity')
        _require(event.get('real_orders') is not True, 'real-order event')
        ids.add(event_id); events.append(event); previous = digest
    _require(len(events) >= 2 and events[0].get('kind') == 'BACKTEST_RUN_STARTED'
             and events[-1].get('kind') == 'BACKTEST_RUN_COMPLETED', 'replay completion boundaries')
    for event in (events[0], events[-1]):
        for key in ('run_id', 'git_sha', 'strategy_version', 'start_ms', 'end_ms', 'manifest_sha256'):
            _require(event.get(key) == cfg.get(key), 'event provenance: ' + key)
    summary = cfg.get('replay_summary', {})
    _require(isinstance(summary, dict), 'replay summary')
    _require(summary.get('event_count') == len(events), 'event count')
    _require(summary.get('cycle_count') == (end - start) // 3600000 == events[-1].get('cycle_count'), 'cycle count')
    intents = {event.get('intent_id'): event for event in events if event.get('kind') == 'INTENT_CREATED'}
    fills = set()
    for event in events:
        if event.get('kind') != 'PAPER_ENTRY':
            continue
        intent = intents.get(event.get('intent_id'))
        fill_ms = int(event['fill_ms'])
        _require(intent is not None and int(intent['decision_persist_ms']) < fill_ms, 'backfill')
        _require(start <= fill_ms < end and event.get('position_id') not in fills, 'duplicate/out-of-window fill')
        fills.add(event.get('position_id'))
    return {'run_config': cfg, 'metrics': metrics, 'report': report,
            'manifest': manifest, 'sha256': hashes, 'ledger_event_count': len(events)}


def seal_run_artifacts(run_dir: Path) -> None:
    payload = validate_run_artifacts(run_dir, require_seal=False)
    _write_json_atomic(Path(run_dir) / SEAL, {
        'schema': 'foxyya-backtest-artifact-checksums/1', 'sha256': payload['sha256']})
