# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-14

## Current priority: P0 Storage Recovery

Do not resume Market Data Coverage Gate or UI feature work until this P0 is closed.

### Current facts

- Primary lineage journal was approximately 444 MB on a 500 MB Railway volume.
- A second persistent helper volume is live at `/backup`.
- The full legacy lineage has been durably backed up and compressed to about 3.97 MB with metadata; no temp transfer artifacts remain.
- Backup helper deployment is healthy and explicitly reports `DURABLE_STORAGE=true RESEARCH_ONLY=true EXECUTION_WRITE=false`.
- Main staging migration attempted backup-gated compaction but failed closed with `LINEAGE_JOURNAL_CORRUPT` before replacement.
- The original persistent lineage has not been intentionally deleted.
- Current code head `267cf813...` is an expected RED TDD commit defining conservative salvage behavior. Do not deploy it yet.

## Exact next steps

1. Finish `lineage_salvage` implementation against the RED contract.
   - Accept an incomplete trailing torn write only when it cannot be a complete valid event.
   - Accept a partial append followed by exactly one checksum-valid retry for the expected sequence.
   - Reject sequence gaps.
   - Reject two conflicting checksum-valid events for the same sequence.
   - Reject checksum-invalid or lineage-reference-invalid candidates.

2. Salvage must write only to scratch storage first.
   - Never rewrite `/data/foxyya-v12.lineage.jsonl` before scratch validation.
   - The already verified external backup is a mandatory precondition.

3. Validate salvaged scratch journal with the normal durable lineage store.
   - Full sequence replay.
   - Source/output identity checks.
   - Observation/source reference checks.
   - Time-order checks.
   - Representative `traceOutput()` parity.

4. Convert validated salvage output into compressed lineage frames.
   - Verify restart-read parity.
   - Verify the compacted file is materially smaller than the legacy journal.

5. Only after all validation passes, atomically/carefully replace the persistent journal and fsync it.

6. Run complete CI.
   Required GREEN gates:
   - All `tests/v12_*.test.cjs`.
   - Existing runtime JavaScript regressions.
   - Python regressions.
   - Production safety-string gate.

7. Deploy only to `foxyya-v12-staging`.
   - Source-trigger may run the wrong Production Python image; if it does, treat as invalid and use native redeploy on the correct snapshot.
   - Verify Node/v12 runtime, `/health`, `RESEARCH_ONLY=true`, `EXECUTION_WRITE=false`.

8. Runtime acceptance after recovery.
   - No `LINEAGE_JOURNAL_CORRUPT`.
   - No `DURABLE_WRITE_FAILED`.
   - Home API refresh succeeds.
   - TW/US/Crypto research publication remains valid.
   - Lineage read/trace endpoint works for representative current outputs.
   - Disk usage is materially below the previous critical high-water state.

9. Observe at least 3 refresh cycles before declaring P0 closed.
   - Prefer normal 30-minute production-like cadence for final acceptance; short controlled validation may be used first, but does not replace final 3-cycle observation.

## After P0 closes

Resume `docs/superpowers/specs/2026-09-12-foxyya-v12-market-data-coverage-gate-design.md`.

Implementation order after storage recovery:

1. Market Data Coverage Gate backend truth.
2. Provider coverage / missing-input reasons per market.
3. Home coverage panel.
4. Direction eligibility gates.
5. Continue JP/KR/CN-HK source activation when credentials/licensing allow.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file. Do not generate a long conversational handoff unless the user specifically asks for one.
