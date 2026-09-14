# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-14

## Current priority: P0 Storage Recovery

Do not resume Market Data Coverage Gate or UI feature work until this P0 is closed.

### Current facts

- Primary lineage journal is 444,055,552 bytes on a 500 MB Railway volume.
- A second persistent helper volume is live at `/backup`.
- The full legacy lineage has been durably backed up and compressed to 3,972,235 bytes with metadata; no temp transfer artifacts remain.
- Backup helper deployment is healthy and reports `DURABLE_STORAGE=true RESEARCH_ONLY=true EXECUTION_WRITE=false`.
- Main staging migration previously failed closed with `LINEAGE_JOURNAL_CORRUPT` before replacement.
- Conservative salvage implementation and salvage-gated migration preflight are now GREEN.
- Code commit `008a479aef47e9bbdd27099842e698c9faeb6790` passed complete v12 Node contracts, existing JavaScript regressions, Python regression, and Production safety gate in CI run `34815486804`.
- The original persistent lineage has not been intentionally deleted.

## Exact next steps

1. Deploy the GREEN salvage build only to `foxyya-v12-staging`.
   - Source-trigger may run the wrong Production Python image; if it does, treat as invalid.
   - Capture the target snapshot, then use native Railway redeploy.
   - Valid deployment must use Node/v12 runtime, not `foxyya_runtime_backend/service.py`.

2. Observe actual salvage migration logs.
   - Backup must remain VERIFIED.
   - Salvage must operate on scratch first.
   - If corruption is ambiguous or unrecoverable, fail closed and keep persistent source unchanged.
   - If salvage succeeds, expect migration status `SALVAGED_COMPACTED`.

3. Validate recovered persistent journal.
   - No `LINEAGE_JOURNAL_CORRUPT`.
   - Storage kind is compressed frames.
   - Full restart replay succeeds.
   - Source/output identity checks succeed.
   - Observation/source reference checks succeed.
   - Time-order checks succeed.
   - Representative `traceOutput()` works.

4. Confirm disk recovery.
   - `/data/foxyya-v12.lineage.jsonl` must be materially smaller than 444 MB.
   - Backup helper copy remains available independently on `/backup`.
   - No direct lineage deletion.

5. Validate service recovery.
   - `/health` passes.
   - `RESEARCH_ONLY=true`.
   - `EXECUTION_WRITE=false`.
   - Home API refresh succeeds.
   - TW/US/Crypto research publication remains valid.
   - No `DURABLE_WRITE_FAILED`.

6. Observe at least 3 refresh cycles before declaring P0 closed.
   - Prefer normal 30-minute cadence for final acceptance.
   - Controlled short validation can be used first but does not replace final three-cycle observation.

7. At each material checkpoint update `FOXYYA_STATE.json` and this file.

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
