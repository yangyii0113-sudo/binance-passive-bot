# P1 — Taiwan Data Core

**Status:** COMPLETE  
**Purpose:** Build the official-data foundation before intelligence, AI scoring or deployment.

## P1 slices

### P1.1 Canonical parsing + provider transport
- [x] JSON transport boundary
- [x] ROC date normalization
- [x] numeric normalization
- [x] explicit provider errors
- [x] deterministic fixtures

### P1.2 TWSE listed market
- [x] listed-company registry adapter
- [x] latest daily OHLCV snapshot adapter
- [x] canonical Observation mapping
- [x] TAIEX market index observations via FMTQIK
- [x] live official-provider smoke validation
- [x] historical accumulator wiring

### P1.3 TPEx OTC market
- [x] OTC-company registry adapter
- [x] latest daily OHLCV snapshot adapter
- [x] canonical Observation mapping
- [x] OTC index canonicalization adapter + deterministic fixture
- [x] verify current live TPEx index field schema against official endpoint
- [x] historical accumulator wiring

### P1.4 Market calendar/session
- [x] canonical Taiwan timezone/session definition
- [x] weekday baseline helper
- [x] official TWSE holiday calendar source
- [x] distinguish holiday closure from first/last-trading-day notices
- [x] session validation against official calendar
- [x] define unscheduled closure reconciliation policy

### P1.5 Data persistence
- [x] content-addressed raw immutable snapshot store
- [x] append-only snapshot manifest + SHA-256
- [x] append-only normalized SQLite observation store
- [x] exact-record de-duplication
- [x] wire provider acquisition to exact raw response-byte capture
- [x] define P1 non-destructive retention/recovery boundary; P7 backup target remains deferred

### P1.6 P1 exit gate
P1 may become COMPLETE only when:
- [x] TWSE + TPEx registry passes official live smoke validation
- [x] TWSE + TPEx daily market snapshot passes official live smoke validation
- [x] index observations are live-verified for both markets
- [x] official holiday/session logic exists
- [x] raw snapshots can be persisted without destructive overwrite
- [x] deterministic fixture tests cover normalization/storage/calendar
- [x] all P1 live-smoke and architecture gates are green
- [x] no raw provider payload reaches UI/read models directly

## Official public sources

- TWSE OpenAPI base: `https://openapi.twse.com.tw/v1`
- TWSE listed daily quote: `/exchangeReport/STOCK_DAY_ALL`
- TWSE market statistics / TAIEX: `/exchangeReport/FMTQIK`
- TWSE listed company profile: `/opendata/t187ap03_L`
- TWSE holiday schedule: `/holidaySchedule/holidaySchedule`
- TPEx OpenAPI base: `https://www.tpex.org.tw/openapi/v1`
- TPEx OTC daily quote: `/tpex_mainboard_daily_close_quotes`
- TPEx OTC index dataset: `/tpex_daily_trading_index`
- TPEx OTC company profile: `/mopsfin_t187ap03_O`

## Data-history rule

The latest-snapshot datasets are not treated as arbitrary historical APIs.

History will be built by:
1. capturing exact provider response bytes,
2. storing immutable content-addressed raw snapshots,
3. normalizing canonical observations,
4. appending observations without destructive overwrite.

No caller may fabricate history by adding undocumented date parameters.
