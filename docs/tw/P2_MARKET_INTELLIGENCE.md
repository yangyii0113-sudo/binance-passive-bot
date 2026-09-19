# P2 — Taiwan Market Intelligence

**Status:** ACTIVE  
**Top-level phase:** P2  
**Rule:** Only the active slice may be implemented. Later slices remain design-only until the previous gate is green.

## P2.1 Market Structure — ACTIVE

Build:
- canonical daily change-percent derivation
- TWSE / TPEx breadth
- turnover aggregation
- index context
- evidence references
- partial-data coverage metrics

Gate:
- [ ] deterministic tests green
- [ ] missing observations degrade coverage instead of crashing
- [ ] outputs reference source + date
- [ ] no provider/network access from intelligence layer
- [ ] architecture CI green

## P2.2 Institutional Flow — LOCKED

Future:
- TWSE market institutional summary
- TPEx institutional summary
- foreign / investment trust / dealer canonical flow contracts

## P2.3 Margin / Short Context — LOCKED

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
