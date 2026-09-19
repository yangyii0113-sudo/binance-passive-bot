# FOXYYA TW — Phase Gates

## Golden rule

**No phase is unlocked because the UI looks complete. A phase is unlocked only when its contract, tests and failure modes pass.**

## Gate protocol

For every phase:

1. Define contracts first.
2. Add deterministic fixtures.
3. Add failing tests.
4. Implement the smallest module.
5. Run phase CI.
6. Verify failure/degraded states.
7. Mark phase COMPLETE.
8. Unlock exactly one next phase.

## Stop conditions

Construction stops immediately if any of the following occurs:

- Taiwan research imports Production execution/order modules.
- Provider raw payload is consumed directly by UI.
- A visible value lacks source or timestamp.
- Missing data is converted to zero or a fabricated value.
- A research candidate is able to authorize execution.
- A phase starts while one of its dependencies is not COMPLETE.
- CI for the active phase is red.
- A production deployment is required merely to test a research feature.

## Change-size rule

Prefer small vertical slices.

A single change should normally affect one of:
- contract
- adapter
- intelligence function
- service
- read model
- UI view

Cross-layer changes require a test that proves the boundary remains intact.

## Rollback rule

Every staging release must have:
- source commit SHA
- data-contract version
- deployment timestamp
- previous known-good SHA

No irreversible schema migration is allowed before a rollback strategy exists.

## Promotion rule

`ACTIVE -> COMPLETE` requires:
- tests green
- acceptance checklist green
- no unresolved P0 regression
- no Production Execution V2 changes

Then and only then may the next `LOCKED` phase become `ACTIVE`.
