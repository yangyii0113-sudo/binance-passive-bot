# FOXYYA Taiwan Market Intelligence — Master Index

This directory is the control room for Taiwan-platform construction.

## Source of truth

1. `BUILD_ROADMAP.md` — what gets built and in what order.
2. `PHASE_GATES.md` — what must pass before the next phase is unlocked.
3. `DEPENDENCY_RULES.md` — allowed module dependencies.
4. `../../research/tw/phase_manifest.json` — machine-readable phase state.
5. `../superpowers/specs/2026-09-19-foxyya-tw-platform-architecture-v1.md` — architecture specification.

## Construction rule

Only one phase may be ACTIVE at a time.

A later phase may be designed on paper, but implementation must not bypass an unmet gate.

## Product boundary

Taiwan equities are a **Research Plane**.

- No brokerage order submission.
- No private trading credentials.
- No mutation of Production Execution V2.
- Research state is not an executable order.
- UI never consumes raw provider payloads directly.
