# Official integration source-date readiness

P3.4 remains ACTIVE until the full integration gate passes. This diagnostic
change does not unlock P3.5 or weaken any acceptance requirement.

## Confirmed cause

Official responses captured on 2026-09-21 after 20:18 Asia/Taipei show TWSE
quotes/index dated 2026-09-18, TPEx quotes/index/institutional data dated
2026-09-21, and TPEx margin data dated 2026-09-18. The common-date integration
cannot produce a coherent result. The former sector-ranking exception hid this
upstream cause. These are actual source dates, not fabricated test timestamps.

## Contract

`require_aligned_sources(sources)` in `tools/tw_public_data_smoke.py` consumes
canonical Observation sequences for exactly eight datasets: quotes, index,
institutional and margin for each venue. It returns a JSON-compatible date
alignment report only if every dataset has usable evidence, exactly one valid
ISO calendar date, and all eight dates match. Success means date alignment only;
all existing downstream coverage, numerical, research and execution checks run.

Missing datasets, empty feeds, missing/invalid dates, missing source evidence,
wrong venues, unusable feeds and mixed dates fail with
`OfficialSourceReadinessError.report`. The exception remains fatal/nonzero.
Reports retain each actual date and source; they never rewrite dates, choose a
majority/latest date, backfill absent observations, or treat an incomplete
response as complete. Ordering of inputs cannot change readiness.

The live smoke reports `OFFICIAL_SOURCE_READINESS` JSON on stderr before sector
ranking. Provider/network errors still fail at their original boundary. The
independent technical and fundamental smoke steps continue reporting their own
results while the overall workflow remains failed.
