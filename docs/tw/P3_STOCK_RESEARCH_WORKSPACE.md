# P3 — Taiwan Stock Research Workspace

**Status:** ACTIVE  
**Top-level phase:** P3  
**Rule:** Build a research workspace on top of the completed P1/P2 canonical foundation. No stock order path is permitted.

## P3.1 Stock Workspace Core — ACTIVE

Build:
- canonical instrument profile
- latest quote snapshot
- quote coverage / provenance
- compatible market-regime context
- acceptance symbols: 2330 / 2317 / 2454 / 2308 / 2881
- Research-only execution boundary

Exit gate:
- [ ] deterministic workspace tests green
- [ ] missing quote fields degrade coverage rather than invent values
- [ ] mismatched regime date/venue is not attached
- [ ] official live workspace smoke green
- [ ] no provider/network dependency in workspace service

## P3.2 Historical Research Window — LOCKED

Future:
- official historical daily OHLCV
- deterministic date-window contract
- corporate-action/session integrity
- sufficient history for daily/weekly research

## P3.3 Technical Research — LOCKED

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
