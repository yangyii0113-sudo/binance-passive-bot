# P1 — Taiwan Data Core

**Status:** ACTIVE  
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
- [ ] market index observations
- [ ] historical accumulator / snapshot persistence

### P1.3 TPEx OTC market
- [x] OTC-company registry adapter
- [x] latest daily OHLCV snapshot adapter
- [x] canonical Observation mapping
- [ ] OTC index observations
- [ ] historical accumulator / snapshot persistence

### P1.4 Market calendar/session
- [x] canonical Taiwan timezone/session definition
- [x] weekday baseline helper
- [ ] official holiday calendar source
- [ ] session validation against official calendar

### P1.5 Data persistence
- [ ] raw immutable snapshot store
- [ ] normalized observation store
- [ ] de-duplication by source/date/instrument/field
- [ ] snapshot manifest and hashes

### P1.6 P1 exit gate
P1 may become COMPLETE only when:
- [ ] TWSE + TPEx registry works from official public data
- [ ] TWSE + TPEx daily market snapshot normalizes deterministically
- [ ] index observations exist for both markets
- [ ] official holiday/session logic exists
- [ ] raw snapshots can be persisted without destructive overwrite
- [ ] fixture tests and architecture gates are green
- [ ] no raw provider payload reaches UI/read models directly

## Official public sources

- TWSE OpenAPI base: `https://openapi.twse.com.tw/v1`
- TWSE listed daily quote: `/exchangeReport/STOCK_DAY_ALL`
- TWSE listed company profile: `/opendata/t187ap03_L`
- TPEx OpenAPI base: `https://www.tpex.org.tw/openapi/v1`
- TPEx OTC daily quote: `/tpex_mainboard_daily_close_quotes`
- TPEx OTC company profile: `/mopsfin_t187ap03_O`

These OpenAPI datasets are treated as latest-snapshot sources. History must be accumulated separately; callers must not pretend that adding a date parameter produces historical data.
