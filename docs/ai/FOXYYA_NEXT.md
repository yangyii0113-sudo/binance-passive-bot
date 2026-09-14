# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-14

## Current priority: P0 Storage Recovery — final live-trace gate

Do not resume Market Data Coverage Gate or UI feature work until this P0 is formally closed.

### Recovery and three-cycle monitoring verified

- Native recovery deployment `2ec68098-082e-41ba-b462-68ff981caf0b` is SUCCESS.
- Correct Node/v12 runtime remains live with `RESEARCH_ONLY=true EXECUTION_WRITE=false`.
- Initial research bootstrap published successfully at `2026-09-14T07:01:29Z`: Crypto 354 / TW 1 / US 1 / Events 40 / TW Forward Samples 4.
- `/data/foxyya-v12.lineage.jsonl` recovered from 444,055,552 bytes to 6,096,213 bytes.
- After three normal 1800-second refresh cadences, lineage is 6,329,972 bytes with mtime `2026-09-14T08:31:36Z`.
- Three-cycle lineage growth is only 233,759 bytes total, approximately 77,920 bytes per cycle and approximately 3.83% relative to the recovered file size.
- Current Railway disk usage is approximately 0.055386 GB versus the previous peak approximately 0.495378 GB.
- Post-recovery log searches show zero `DURABLE_WRITE_FAILED`, zero `LINEAGE_JOURNAL_CORRUPT`, and zero `FOXYYA v12 research refresh failed` entries.
- Home publication advancement is accepted from runtime-path evidence: every successful scheduled `refreshResearch()` calls the source pipeline, which publishes Home with `publishAsOf >= nowMs`; the journal advanced through the third cadence with no refresh-failure log.
- Independent persistent backup remains intact at `/backup/foxyya-v12-444055552-1789365503749.lineage.jsonl.gz` (3,972,235 bytes) plus its 350-byte metadata file.
- Persistent journal remains compressed `foxyyya-lineage-frame/1` / `deflate-raw-base64` with canonical restart/trace tests GREEN.
- Production Execution V2 was not modified.

## Exact remaining P0 gate

1. Complete one representative live Lineage Trace API round-trip.
   - Choose a current `out_<64hex>` lineageRef from `/v12/api/home`.
   - GET `/v12/api/lineage/output/{ref}`.
   - Verify the response resolves the output plus its source/observation trace.
   - Verify `researchOnly=true` and `executionWrite=false`.
   - Current connector/network policy cannot directly fetch the Railway public endpoint; this is the only remaining verification-access blocker, not a detected runtime/storage error.

2. Once the live trace round-trip passes:
   - Update `FOXYYA_STATE.json` to `P0_CLOSED`.
   - Update this file to move the active priority to `docs/superpowers/specs/2026-09-12-foxyya-v12-market-data-coverage-gate-design.md`.
   - Preserve all safety invariants: Production `PAPER_ONLY=true`, `REAL_ORDER_LOCK=true`; Research Staging `RESEARCH_ONLY=true`, `EXECUTION_WRITE=false`.

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
