# P2 — Taiwan Market Intelligence

**Status:** ACTIVE  
**Top-level phase:** P2  
**Rule:** Only the active slice may be implemented. Later slices remain design-only until the previous gate is green.

## P2.1 Market Structure — COMPLETE

Build:
- canonical daily change-percent derivation
- TWSE / TPEx breadth
- turnover aggregation
- index context
- evidence references
- partial-data coverage metrics

Gate:
- [x] deterministic tests green
- [x] missing observations degrade coverage instead of crashing
- [x] outputs reference source + date
- [x] no provider/network access from intelligence layer
- [x] architecture CI green

## P2.2 Institutional Flow — COMPLETE

Build:
- TWSE BFI82U market institutional summary
- TPEx `tpex_3insti_summary` market institutional summary
- canonical foreign / investment trust / dealer / total flow contracts
- evidence/provenance on all derived flow outputs
- degraded coverage rather than fabricated zero
- official live smoke validation

Gate:
- [x] deterministic institutional fixtures green
- [x] TWSE foreign-dealer rows normalized into foreign-capital bucket
- [x] intelligence layer has no provider/network dependency
- [x] official TWSE / TPEx institutional live smoke green
- [x] transient non-JSON responses retry before hard failure

## P2.3 Margin / Short Context — ACTIVE

Future:
- financing balance
- short balance
- day-over-day changes
- market-level leverage pressure context

## P2.4 Sector Rotation — LOCKED

Future:
- canonical sector mapping
- sector breadth
- sector weighted return
- turnover participation
- top/bottom rotation groups

## P2.5 Market Regime Fusion — LOCKED

Future:
- index direction
- breadth confirmation/divergence
- flow confirmation
- leverage context
- sector diffusion
- conservative research-state output

## P2.6 Read Models / Exit Gate — LOCKED

P2 COMPLETE requires:
- market intelligence built only from canonical observations
- every derived output exposes evidence/provenance
- partial inputs yield degraded/insufficient states rather than fabricated values
- deterministic fixtures render a complete dashboard read model without network
- P2 architecture and intelligence CI gates green
