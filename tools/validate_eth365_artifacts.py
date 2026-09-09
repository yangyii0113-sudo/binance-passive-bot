"""Validate formal run evidence; final strategy performance-value audit is separate."""
import argparse
import json
from pathlib import Path
from backtest.artifacts import validate_run_artifacts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('root', type=Path)
    parser.add_argument('--expected-git-sha', required=True)
    args = parser.parse_args()
    runs = sorted(path for path in args.root.glob('bt-*') if path.is_dir())
    if len(runs) != 1:
        raise ValueError('formal artifact must contain exactly one deterministic run')
    payload = validate_run_artifacts(runs[0], expected_git_sha=args.expected_git_sha)
    cfg = payload['run_config']
    if cfg['execution_days'] != 365 or cfg['warmup_days'] != 200:
        raise ValueError('formal study requires 365 execution and 200 warmup days')
    if cfg['retrieval_mode'] not in {'BINANCE_REST', 'BINANCE_OFFICIAL_PUBLIC_ARCHIVE'}:
        raise ValueError('formal study requires actual Binance public data')
    print(json.dumps({
        'status': 'VERIFIED', 'run_id': cfg['run_id'], 'git_sha': cfg['git_sha'],
        'execution_start_utc': cfg['execution_start_utc'], 'execution_end_utc': cfg['execution_end_utc'],
        'requested_end_utc': cfg['requested_end_utc'], 'data_lag_ms': cfg['data_lag_ms'],
        'retrieval_mode': cfg['retrieval_mode'], 'end_boundary_policy': cfg['end_boundary_policy'],
        'manifest_sha256': cfg['manifest_sha256'], 'integrity': cfg['integrity'],
        'artifact_sha256': payload['sha256'], 'performance_value_audit': 'DEFERRED',
    }, ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main()
