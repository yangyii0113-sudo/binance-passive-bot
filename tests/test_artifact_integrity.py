import json
import hashlib
import sqlite3
from pathlib import Path

import pytest
import service
from backtest.cli import run_eth_365_study
from backtest.binance_history import DAY_MS
from test_eth_one_year_replay import _payload


def make_run(root, *, end_ms=1000 * DAY_MS):
    kwargs = dict(output_root=root, now_ms=end_ms, input_payload=_payload(end_ms, 1, 60),
                  execution_days=1, warmup_days=60, git_sha='artifact-test-sha')
    result = run_eth_365_study(**kwargs)
    return Path(result['run_dir']), kwargs


@pytest.mark.parametrize('missing', ['events.sqlite', 'input_data.json', 'data_manifest.json', 'report.md'])
def test_cached_run_rejects_missing_evidence_without_recreating_it(tmp_path, missing):
    run, kwargs = make_run(tmp_path)
    (run / missing).unlink()
    before = {p.name: p.read_bytes() for p in run.iterdir()}
    with pytest.raises((ValueError, RuntimeError)):
        run_eth_365_study(**kwargs)
    assert {p.name: p.read_bytes() for p in run.iterdir()} == before


def test_cached_run_rejects_persisted_hash_tamper(tmp_path):
    run, kwargs = make_run(tmp_path)
    with sqlite3.connect(run / 'events.sqlite') as db:
        db.execute('DROP TRIGGER events_no_update')
        db.execute("UPDATE events SET event_hash='invalid' WHERE seq=1")
    # Even if a copied bundle updates its outer file checksum, the persisted
    # canonical chain must be verified independently.
    checksum = run / 'artifact_checksums.json'
    seal = json.loads(checksum.read_text())
    seal['sha256']['events.sqlite'] = hashlib.sha256((run / 'events.sqlite').read_bytes()).hexdigest()
    checksum.write_text(json.dumps(seal))
    with pytest.raises((ValueError, RuntimeError)):
        run_eth_365_study(**kwargs)


def test_api_rejects_incomplete_and_malformed_bundles(tmp_path):
    bad = tmp_path / 'bt-invalid'
    bad.mkdir()
    for name in ['run_config.json', 'metrics.json', 'report.json']:
        (bad / name).write_text('{}')
    assert service._load_backtest_payload(tmp_path, bad.name) is None
    (bad / 'run_config.json').write_text('[]')
    assert service._latest_backtest_payload(tmp_path) is None


def test_latest_skips_invalid_newer_run_and_reads_valid_run_without_writes(tmp_path):
    valid, kwargs = make_run(tmp_path)
    invalid, _ = make_run(tmp_path, end_ms=1001 * DAY_MS)
    (invalid / 'report.md').unlink()
    before = {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in valid.iterdir()}
    payload = service._latest_backtest_payload(tmp_path)
    assert payload['run_config']['run_id'] == valid.name
    assert {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in valid.iterdir()} == before

    reused = run_eth_365_study(**kwargs)
    assert reused['reused_existing_artifacts'] is True
    assert {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in valid.iterdir()} == before


def test_artifact_gate_rejects_other_commit_and_missing_metric_fields(tmp_path):
    from backtest.artifacts import seal_run_artifacts, validate_run_artifacts
    run, _ = make_run(tmp_path)
    with pytest.raises(ValueError, match='Git SHA mismatch'):
        validate_run_artifacts(run, expected_git_sha='another-commit')
    for name in ('metrics.json', 'report.json'):
        path = run / name
        payload = json.loads(path.read_text())
        del payload['performance']['win_rate']
        path.write_text(json.dumps(payload))
    with pytest.raises(ValueError, match='missing metric fields'):
        seal_run_artifacts(run)
