# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-14

## Current priority: P0 Storage Recovery — 3-cycle monitoring

Do not resume Market Data Coverage Gate or UI feature work until this P0 is formally closed.

### Recovery already verified

- Native recovery deployment `2ec68098-082e-41ba-b462-68ff981caf0b` is SUCCESS.
- Correct Node/v12 runtime is live with `RESEARCH_ONLY=true EXECUTION_WRITE=false`.
- Initial research bootstrap published successfully: Crypto 354 / TW 1 / US 1 / Events 40 / TW Forward Samples 4.
- `/data/foxyya-v12.lineage.jsonl` recovered from 444,055,552 bytes to 6,096,213 bytes.
- Persistent journal is now `foxyya-lineage-frame/1` with `deflate-raw-base64` and checksum.
- Independent `/backup` copy remains intact at 3,972,235 bytes plus metadata.
- Current disk usage is approximately 0.055 GB versus previous peak approximately 0.495 GB.
- Recovery deployment currently has no error-level deployment logs.
- Lineage file size remained stable after initial bootstrap.
- Compressed restart/trace behavior is GREEN in canonical CI.

## Exact next steps

1. Observe three normal refresh cycles at the configured 1800-second cadence.
   - Current accepted cycles: 0 / 3 after recovery deployment.
   - For each cycle confirm no `DURABLE_WRITE_FAILED`.
   - Confirm no `LINEAGE_JOURNAL_CORRUPT`.
   - Confirm research Home publication succeeds and `asOf` advances.
   - Record lineage file size / disk usage after each cycle.

2. Complete a representative live Lineage Trace API round-trip when the tool/network path allows it.
   - Choose a current `out_<64hex>` lineageRef from Home.
   - GET `/v12/api/lineage/output/{ref}`.
   - Verify output/source/observation trace and research-only flags.
   - Current connector cannot fetch the Railway public URL; this is a verification-access limitation, not a detected service error.

3. After cycle 3, update `FOXYYA_STATE.json` and this file.
   - If all acceptance gates pass, set P0 to CLOSED.
   - If journal growth is unexpectedly high, implement bounded rotation/high-water protection before closure.

## After P0 closes

Resume `docs/superpowers/specs/2026-09-12-foxyya-v12-market-data-coverage-gate-design.md`.

Implementation order:

1. Market Data Coverage Gate backend truth.
2. Provider coverage / missing-input reasons per market.
3. Home coverage panel.
4. Direction eligibility gates.
5. Continue JP/KR/CN-HK source activation when credentials/licensing allow.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file. Do not generate a long conversational handoff unless the user specifically asks for one.
