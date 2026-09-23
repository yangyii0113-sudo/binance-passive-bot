# P3 — Taiwan Stock Research Workspace

**Status:** ACTIVE  
**Top-level phase:** P3  
**Rule:** Build a research workspace on top of the completed P1/P2 canonical foundation. No stock order path is permitted.

## P3.1 Stock Workspace Core — COMPLETE

Build:
- canonical instrument profile
- latest quote snapshot
- quote coverage / provenance
- compatible market-regime context
- acceptance symbols: 2330 / 2317 / 2454 / 2308 / 2881
- Research-only execution boundary

Exit gate:
- [x] deterministic workspace tests green
- [x] missing quote fields degrade coverage rather than invent values
- [x] mismatched regime date/venue is not attached
- [x] official live workspace smoke green
- [x] no provider/network dependency in workspace service

## P3.2 Historical Research Window — COMPLETE

Build:
- official TWSE monthly STOCK_DAY historical adapter
- official TPEx monthly tradingStock historical adapter
- canonical HistoricalBar contract
- deterministic 20 / 60 / 120 / 250-session research windows
- no-lookahead cutoff
- duplicate/conflicting-session integrity gate
- explicit raw/unadjusted price mode
- source provenance
- insufficient-history state rather than fabricated bars

Gate:
- [x] deterministic TWSE / TPEx historical fixtures green
- [x] 20 / 60 / 120 / 250-session window tests green
- [x] future bars excluded
- [x] conflicting duplicate sessions fail closed
- [x] historical service has no provider/execution dependency
- [x] official TWSE / TPEx 20-session live smoke green
- [x] live windows end exactly at 2026-09-18

## P3.3 Technical Research — COMPLETE

Implementation, local acceptance and both GitHub gates completed on 2026-09-20.
Verified implementation: `bceb6e70ee27087a8e7d21dadb50e8d00e0707ee`.
At P3.3 acceptance, P3.4 was unlocked. Current active slice: P3.6.

Implemented:
- canonical HistoricalWindow-only daily / closed-week trend
- SMA20/60, EMA12/26, Wilder RSI14, MACD12/26/9
- momentum20 / ROC20 and prior-session support / resistance
- volume confirmation and Wilder ATR14 / ATR% / volatility change
- per-metric evidence, warm-up coverage, unavailable reasons
- window integrity revalidation and enforced Research-only execution boundary

Gate:
- [x] 142 Taiwan architecture / active-phase tests pass locally
- [x] full Python regression 286 / 286; runtime Node regression 16 / 16
- [x] official TWSE 2330 / TPEx 6488 smoke: 120 sessions each, ending 2026-09-18
- [x] incomplete / missing weeks, future bars, missing / invalid fields fail closed
- [x] independent code review findings reproduced and fixed
- [x] Production Execution V2 unchanged
- [x] publish this implementation and verify [GitHub Research Architecture Gate](https://github.com/yangyii0113-sudo/binance-passive-bot/actions/runs/35487120948)
- [x] verify [GitHub Official Data Live Smoke](https://github.com/yangyii0113-sudo/binance-passive-bot/actions/runs/35487120957) for the same implementation
- [x] promote P3.3 COMPLETE and unlock only P3.4 after those gates

Method: [P3_3_TECHNICAL_RESEARCH.md](P3_3_TECHNICAL_RESEARCH.md).
Continuation: [HANDOFF_2026-09-20_P3.3.md](HANDOFF_2026-09-20_P3.3.md).

## P3.4 Fundamentals & Events — COMPLETE

Implemented and remotely accepted:
- exact monthly revenue context and source-traceable growth
- financial/conference topics on official material announcements
- dividend resolutions and ex-right schedules with explicit archival states
- receipt/publication-gated timeline and latest-source presence
- immutable contracts, exact raw acquisition/replay, failure and integrity gates

Local Taiwan tests: 185 passed. Official eight-source smoke and six revenue
acceptance symbols passed. Method: [P3_4_FUNDAMENTALS_EVENTS.md](P3_4_FUNDAMENTALS_EVENTS.md).
Handoff: [HANDOFF_2026-09-21_P3.4.md](HANDOFF_2026-09-21_P3.4.md).
The blocking source-date mismatch was resolved without weakening the gate.
Latest snapshots still published asynchronously, so the smoke now acquires the
lagging TWSE venue from official exact-session endpoints, then reruns the same
strict eight-source common-date guard. On 2026-09-23 the full integration,
technical, and fundamentals/event smokes all passed for common date 2026-09-22.
Official Data Live Smoke run `35759014192`: SUCCESS. Research Architecture
Gate run `35759048766`: SUCCESS. Production Execution V2 remained untouched.

## P3.5 Research Candidate Engine — COMPLETE

Build:
- explicit minimum evidence contract
- technical + fundamentals/event + market-context fusion
- scenario and invalidation as research text/data only
- risk-note aggregation
- confidence based on evidence coverage, never a promised win rate
- insufficient-data fail closed
- deterministic ranking for review only
- no executable order object or broker payload

Acceptance: 234 Taiwan tests passed; official TWSE 2330 / TPEx 6488 candidate
smoke passed. Evidence: [P3_5_CANDIDATE_ENGINE.md](P3_5_CANDIDATE_ENGINE.md).

## P3.6 Read Models / Exit Gate — ACTIVE

P3 COMPLETE requires:
- stock workspace can render from canonical data
- historical and technical research passes look-ahead/integrity gates
- event/fundamental context is source-traceable
- candidate engine is evidence-gated and research-only
- stable stock-workspace read model passes deterministic and live smoke
