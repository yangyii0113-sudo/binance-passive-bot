# Official integration source-date readiness

P3.4 is COMPLETE. The strict common-date contract remains in force.

## Why the gate failed

Latest public snapshots can publish asynchronously. On the 2026-09-23 recheck,
the four TWSE latest feeds were dated 2026-09-21 while the four TPEx latest
feeds were dated 2026-09-22. The original guard correctly returned
`NOT_READY/source_dates_not_aligned`.

## Contract that remains unchanged

`require_aligned_sources(sources)` consumes canonical Observation sequences
for exactly eight datasets: quotes, index, institutional and margin for TWSE and
TPEx. It passes only when every dataset has usable evidence, exactly one valid
ISO date, and all eight dates match.

It still rejects:
- missing / empty datasets;
- mixed or invalid dates;
- missing source provenance;
- venue mismatches;
- unusable observations;
- cross-source date mismatches.

It never rewrites timestamps, chooses a majority date, relabels stale data, or
fabricates missing observations.

## Exact-session acquisition recovery

To avoid waiting indefinitely for asynchronous *latest-snapshot* publication,
the smoke may now recover only a lagging TWSE venue when these conditions hold:

1. all four TWSE latest datasets are internally coherent on one older date;
2. all four TPEx latest datasets are internally coherent on one newer date;
3. the only readiness issue is `source_dates_not_aligned`;
4. official TWSE exact-session endpoints can prove the newer requested date.

The recovery sources are:
- quotes: TWSE RWD `MI_INDEX`;
- index/turnover: TWSE RWD `FMTQIK`;
- institutional: TWSE `BFI82U`;
- margin: TWSE RWD `MI_MARGN`.

`TWSEExactSessionProvider` validates the official response date / requested
FMTQIK row before emitting observations. The original latest observations are
not mutated. The recovered observations are then passed back through the
unchanged strict `require_aligned_sources` gate.

If exact-session acquisition cannot prove the date, the original
`OfficialSourceReadinessError` remains fatal. This is official research data
acquisition, not a relaxation of the gate and not an Execution V2 backfill.

## Accepted remote run — 2026-09-23

Official Data Live Smoke:
`https://github.com/yangyii0113-sudo/binance-passive-bot/actions/runs/35759014192`

Result:
- overall workflow: **SUCCESS**;
- common date: **2026-09-22**;
- source alignment mode: `twse_exact_session_recovery`;
- TWSE latest date before recovery: 2026-09-21;
- recovered TWSE target date: 2026-09-22;
- all eight canonical sources: aligned with no readiness issues;
- public-data integration: SUCCESS;
- P3.3 technical smoke: SUCCESS;
- P3.4 fundamentals/events smoke: SUCCESS;
- `execution_allowed=false`.

The Research Architecture Gate with the recovery regression tests also passed:
`https://github.com/yangyii0113-sudo/binance-passive-bot/actions/runs/35759048766`.

This gate evidence allowed P3.4 to become COMPLETE and P3.5 to become ACTIVE.
