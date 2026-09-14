# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-14

## Current priority: P0 Storage Recovery — acceptance monitoring

Do not resume Market Data Coverage Gate or UI feature work until this P0 is formally closed.

### Current facts

- Legacy lineage journal was 444,055,552 bytes on a 500 MB Railway volume.
- Independent persistent backup remains on backup-helper `/backup` as a 3,972,235-byte gzip plus metadata.
- Conservative salvage + compressed compaction passed complete CI.
- Native staging deployment `2ec68098-082e-41ba-b462-68ff981caf0b` is SUCCESS on the correct Node/v12 runtime.
- Runtime reports `RESEARCH_ONLY=true EXECUTION_WRITE=false`.
- Persistent `/data/foxyya-v12.lineage.jsonl` is now 6,096,213 bytes.
- First persisted record is `foxyya-lineage-frame/1` using `deflate-raw-base64` with checksum.
- This is approximately a 98.6% reduction from the 444 MB legacy file.
- Original full backup remains independent and was not deleted.

## Exact next steps

1. Verify service-level recovery.
   - `/health` returns success.
   - Initial research bootstrap publishes Home successfully.
   - TW/US/Crypto research remains present according to currently available providers.
   - No `LINEAGE_JOURNAL_CORRUPT` after recovery.
   - No `DURABLE_WRITE_FAILED` after recovery.

2. Verify lineage behavior, not only file format.
   - Select a current Home output carrying a `lineageRef`.
   - Call `/v12/api/lineage/output/{lineageRef}`.
   - Verify output/source/observation trace resolves after restart on compressed journal.

3. Verify storage headroom.
   - Confirm Railway disk usage is materially below previous ~99% high-water.
   - Primary lineage file should remain bounded near the recovered low-MB scale, not return to tens/hundreds of MB per refresh.
   - Backup helper artifact must remain intact.

4. Observe at least three successful refresh cycles before closing P0.
   - Normal cadence remains 1800 seconds / 30 minutes.
   - Each cycle must complete without `DURABLE_WRITE_FAILED` or `LINEAGE_JOURNAL_CORRUPT`.
   - Confirm Home `asOf` advances and lineage remains writable/readable.
   - Track lineage file/disk growth over all three cycles.

5. After cycle 3, update `FOXYYA_STATE.json` and this file.
   - If all acceptance gates pass, set P0 to CLOSED.
   - If growth remains excessive, implement bounded rotation/high-water protection before closing P0.

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
