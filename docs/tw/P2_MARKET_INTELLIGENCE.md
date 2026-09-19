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

## P2.3 Margin / Short Context — COMPLETE

Build:
- TWSE exact-date MI_MARGN RWD normalization
- TPEx `tpex_mainboard_margin_balance` normalization
- financing / short balances
- previous-day balances and day-over-day changes
- margin / short ratio and usage fields
- market-level leverage context
- degraded coverage instead of fabricated zero
- transient invalid-JSON retry before snapshot persistence

Gate:
- [x] deterministic TWSE / TPEx margin fixtures green
- [x] grouped TWSE RWD fields parsed with official positional layout
- [x] architecture test suite green
- [x] exact-date TWSE margin session validation green
- [x] official TWSE / TPEx margin live smoke green

## P2.4 Sector Rotation — COMPLETE

Build:
- sector mapping from canonical Instrument metadata
- sector breadth / diffusion
- trade-value-weighted sector return
- sector turnover participation
- descriptive leaders / laggards
- partial-data coverage and evidence provenance

Gate:
- [x] deterministic sector-rotation tests green
- [x] instruments without sector mapping excluded instead of guessed
- [x] intelligence layer has no provider/network dependency
- [x] official live sector coverage exceeds minimum threshold
- [x] TWSE / TPEx leader-laggard ranking available

## P2.5 Market Regime Fusion — COMPLETE

Build:
- index-direction vote with deadband
- market-breadth confirmation
- foreign institutional-flow confirmation
- sector-diffusion confirmation
- leverage retained as context rather than forced directional vote
- fail-closed date/coverage checks
- descriptive market-regime state only; no execution authority

Gate:
- [x] deterministic fusion tests green
- [x] venue/date mismatch fails closed
- [x] missing foreign flow fails closed
- [x] intelligence has no provider or execution dependency
- [x] official live regime fusion green for TWSE and TPEx

## P2.6 Read Models / Exit Gate — ACTIVE

P2 COMPLETE requires:
- market intelligence built only from canonical observations
- every derived output exposes evidence/provenance
- partial inputs yield degraded/insufficient states rather than fabricated values
- deterministic fixtures render a complete dashboard read model without network
- P2 architecture and intelligence CI gates green
