# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-14

## P0 Storage Recovery — CLOSED

P0 is formally closed.

Acceptance evidence:

- Recovery deployment `2ec68098-082e-41ba-b462-68ff981caf0b` succeeded.
- Live Trace probe deployment `bbbe2467-ab6f-4986-ab39-c9c444cb59a1` succeeded.
- Correct Node/v12 runtime is live with `RESEARCH_ONLY=true EXECUTION_WRITE=false`.
- Legacy lineage recovered from 444,055,552 bytes to 6,096,213 bytes and remained controlled at 6,329,972 bytes after three normal refresh cycles.
- Three-cycle growth was 233,759 bytes total, approximately 77,920 bytes per cycle.
- No post-recovery `DURABLE_WRITE_FAILED`, `LINEAGE_JOURNAL_CORRUPT`, or refresh-failure logs were observed during the three-cycle acceptance window.
- Independent durable backup remains on `/backup` as the 3,972,235-byte gzip plus metadata.
- Live localhost HTTP round-trip passed: `/v12/api/home` returned 200, a current output lineageRef was extracted, `/v12/api/lineage/output/{ref}` returned 200, source/observation trace resolved, and `researchOnly=true executionWrite=false` remained intact.
- Live representative lineage ref: `out_0834cfbeaf89c3144e2f9647cbe629eacc3ea71b866f3849e3ac9ed2374642f9`.
- Full CI for live-trace probe commit `44bd80de4410b5d682b5fb257a52ca3f2e941f12` passed Node v12 contracts, JavaScript regressions, Python regression, and Production safety gate.

## Current priority: Market Data Coverage Gate

Source spec:

`docs/superpowers/specs/2026-09-12-foxyya-v12-market-data-coverage-gate-design.md`

### Implementation order

1. Implement the backend Coverage Gate as the single source of truth for seven markets:
   - CRYPTO
   - US
   - TW
   - CN-HK
   - JP
   - KR
   - EU

2. Each market must expose a deterministic coverage status:
   - `READY`
   - `PARTIAL`
   - `BLOCKED`
   - `UNAVAILABLE`

3. Each market record must explain:
   - whether broad market direction is eligible,
   - whether instrument-level research is available,
   - whether research ranking is eligible,
   - which required inputs are present,
   - which inputs are missing,
   - why missing inputs are unavailable (provider failure, credential, entitlement, licensing, or not implemented),
   - timestamp / freshness information where relevant.

4. Do not infer broad-market readiness from isolated instrument research.
   - TW 2330/6488 research must not imply Taiwan breadth is complete.
   - SEC/BLS or NVDA research must not imply US broad market direction is complete.

5. TDD first.
   - Add backend contracts before implementation.
   - Prove `READY/PARTIAL/BLOCKED/UNAVAILABLE` semantics.
   - Prove no fake data and no execution write path.
   - Prove coverage records are deterministic and immutable/read-only.

6. Wire Coverage Gate into Home read model only after backend truth is GREEN.

7. Then add a Chinese-first Home coverage panel showing:
   - market,
   - coverage state,
   - direction eligibility,
   - research availability,
   - ranking eligibility,
   - primary missing inputs / blocking reason.

8. Full validation before deployment:
   - all `tests/v12_*.test.cjs`,
   - existing runtime JavaScript regressions,
   - Python regression,
   - Production safety-string gate.

9. Deploy only to v12 Research Staging.
   - Source-trigger wrong-image deployments remain invalid.
   - Use native redeploy after the intended snapshot is captured.
   - Verify Node/v12 runtime and `RESEARCH_ONLY=true EXECUTION_WRITE=false`.

## After Coverage Gate

1. Provider coverage expansion by market.
2. Home decision-readiness UX.
3. Direction eligibility integration.
4. JP/KR/CN-HK source activation as credentials/licensing allow.
5. Continue forward validation and research-quality measurement.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file. Do not generate a long conversational handoff unless the user specifically asks for one.
