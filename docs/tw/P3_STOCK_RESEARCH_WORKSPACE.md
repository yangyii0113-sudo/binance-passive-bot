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

## P3.3 Technical Research — ACTIVE

Future:
- daily / weekly trend
- MA / EMA
- RSI / MACD
- momentum
- support / resistance
- volume confirmation
- volatility state

## P3.4 Fundamentals & Events — LOCKED

Future:
- monthly revenue
- financial events
- material information
- dividends / corporate actions
- event timeline

## P3.5 Research Candidate Engine — LOCKED

Future:
- evidence requirements
- scenario
- invalidation
- risk notes
- insufficient-data fail closed
- no executable order object

## P3.6 Read Models / Exit Gate — LOCKED

P3 COMPLETE requires:
- stock workspace can render from canonical data
- historical and technical research passes look-ahead/integrity gates
- event/fundamental context is source-traceable
- candidate engine is evidence-gated and research-only
- stable stock-workspace read model passes deterministic and live smoke
