# FOXYYA TW — P1 Data Retention / Recovery Policy

## P1 rule

P1 is a construction and validation phase, not a long-running production
collector. Therefore P1 performs **no automatic destructive retention**.

## Raw source snapshots

- Exact provider response bytes are content-addressed by SHA-256.
- Duplicate bytes are de-duplicated.
- Existing raw files are never overwritten with different bytes.
- Manifest entries identify dataset, observation date, capture time, source URL,
  content hash and size.
- P1 does not delete raw snapshots automatically.

## Normalized observations

- SQLite observation storage is append-only from the application interface.
- Exact records are de-duplicated by canonical record hash.
- No update/delete API is exposed by the Research Plane store.

## Recovery boundary

Before P7 long-running staging:
1. define volume high-water thresholds;
2. define backup destination;
3. test restore from raw snapshots;
4. define retention only after restore has passed.

A storage-pressure event must degrade/stop collection rather than silently
deleting unbacked research provenance.

## Session gaps

Missing observations on an officially expected trading day are classified as
`NEEDS_RECONCILIATION` or `PARTIAL`. They are not automatically labelled
an exchange closure. Scheduled closures come from the official calendar;
unscheduled closures require authoritative confirmation.
