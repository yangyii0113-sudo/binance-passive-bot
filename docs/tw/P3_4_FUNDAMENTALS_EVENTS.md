# P3.4 Fundamentals and Events

Status: ACTIVE. Contract/method version: `tw-fundamentals.v1`.

## Scope and sources

Official, public, credential-free disclosure snapshots only:

| Dataset | TWSE OpenAPI v1 path | TPEx OpenAPI v1 path |
|---|---|---|
| Monthly revenue | opendata/t187ap05_L | mopsfin_t187ap05_O |
| Material announcements | opendata/t187ap04_L | mopsfin_t187ap04_O |
| Dividend resolutions | opendata/t187ap45_L | mopsfin_t187ap39_O |
| Ex-right / ex-dividend schedule | exchangeReport/TWT48U_ALL | tpex_exright_prepost |

Official schema roots: [TWSE](https://openapi.twse.com.tw/v1/swagger.json),
[TPEx](https://www.tpex.org.tw/openapi/swagger.json).
The 2026-09-20 source probe found the TPEx dividend-resolution feed still dated
2021-08-04. It must be STALE, never fresh current dividend coverage. The current
TPEx ex-right schedule is a separate feed and cannot repair this coverage claim.
`t187ap31` is a governance snapshot without financial event dates; it is excluded.
Financial reports/conferences are discoverable topic tags on original material
announcements, not a complete earnings calendar or inferred earnings release.

## Canonical contract and knowledge boundary

Each record carries dataset, official URL, source observation date, exact response
SHA-256, received timestamp and optional official publication timestamp. All
instants require a timezone and normalize to UTC. `available_at` is the later of
received and published time. Report period, board/fact/ex date and snapshot date
are separate fields; none substitutes for when the system knew the record.
Replay uses the persisted capture time, never today's fetch with a backdated
cutoff. New revisions are visible only after receipt. The attempt journal retains earlier receipts even when identical raw content
is fetched again, including failed refreshes. Source-defined snapshot dates
cannot be in the future. Unparseable required fields fail closed.

Revenue uses exact Decimal values in **TWD_THOUSAND**, including explicit zeros;
missing values remain null. MoM, YoY and YTD YoY are calculated from the amounts
within the same source record, rounded to six decimal places. Zero denominators
produce an unavailable ratio. No growth score or trading recommendation is made.
The latest eligible reporting period is selected after knowledge-time filtering;
its latest known revision wins. Conflicting records at the same capture time
fail closed. No absent month is interpolated.

Events retain original subject/detail, event date role and source status.
Material announcements use `fact_date`, which can describe a future conference
or an older accounting period: it is not automatically a confirmed schedule.
Dividend records use `board_resolution_date`; cash components are summed only
when all required components exist. Ex-right records use `ex_date`. Unverified
stock-allotment ratio units are excluded from calculations. Event identity is
source-specific. Legacy TPEx dividend rows omit quarter identity; they use an
explicit archival_row_fingerprint, preserve ambiguous rows, and cannot be summed
or interpreted as a reliable revision chain. Cross-source duplicates are retained, and amended announcements
remain separate announcements. A future event can be visible once known.

## Coverage and failure policy

Every requested venue has four dataset coverage entries. Missing/failed fetches
are UNAVAILABLE, a valid empty event list is an available empty snapshot, and an
empty revenue list is UNAVAILABLE. A successful empty feed never proves that a
company has no events outside that rolling feed. Snapshot age over 14 days is
STALE. Revenue more than two reporting months behind the cutoff is also STALE;
this is a research freshness policy, not a statutory filing deadline.
A failed refresh must retain its attempted time/status rather than silently
substitute older successful data as current coverage; older known records may
still be displayed with degraded coverage. Missing company/period in the latest successful revenue
snapshot makes any retained historical value UNAVAILABLE. Timeline entries wrap
the original event with latest-source presence, availability and reason. Removed
future ex-date records are UNAVAILABLE (schedule no longer confirmed); records
that age out of rolling feeds remain clearly marked historical/STALE. All
eligible receipt conflicts are checked before version selection, independently
of input order. Revenue identity uses dataset/company/month as well as source
IDs; a batch cannot override the observation dates of its records. Acquisition persists exact bytes even
when parsing fails, and records a failure result for the caller.

## Boundaries and acceptance

The pure intelligence/service accepts canonical batches, never provider payloads
or network clients. Raw persistence/replay belongs to acquisition. Research
snapshots enforce execution_allowed=false; price_mode stays raw_unadjusted and
corporate_action_adjusted=false. This module does not adjust prices, emit orders,
connect brokers, push notifications, or implement P3.5/P3.6.

Required acceptance: both-venue deterministic fixtures, known-time/revision and
future-event tests, missing/invalid/zero/empty/stale/failure cases, dependency
boundary tests, full regressions, independent review and official live smoke.
Only after the two GitHub gates pass may P3.4 complete and P3.5 unlock.

Archive use is a single acquisition writer per directory. Keep the exact raw files
and attempt journal together. This phase does not schedule background collection.
