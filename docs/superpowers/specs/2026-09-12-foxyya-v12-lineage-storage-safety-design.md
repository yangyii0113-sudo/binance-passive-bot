# FOXYYA v12 Lineage Storage Safety Design

**Date:** 2026-09-12
**Scope:** v12 Research Staging only
**Status:** Approved by operator directive in the continuation request

## Goal

Stop unbounded `/data/foxyya-v12.lineage.jsonl` growth from exhausting the Railway Research Staging volume while preserving fail-closed lineage integrity, recent full output→source→observation traceability, and a durable cryptographic checkpoint for retired history.

## Frozen constraints

- Production Execution V2 is out of scope and must not be modified.
- Research Staging remains `RESEARCH_ONLY=true` and `EXECUTION_WRITE=false`.
- The existing public lineage store surface (`recordSource`, `recordOutput`, `source`, `output`, `traceOutput`) remains compatible.
- Never silently truncate or directly delete the lineage journal as a recovery shortcut.
- A history range may be retired only after a durable checkpoint records the retired range and digest.
- Corrupt complete events remain fail-closed; torn trailing append recovery remains supported.
- P0 must pass before Market Data Coverage Gate implementation starts.

## Root cause

The current durable lineage store is append-only. Each successful source/output record is serialized as a full JSON event and `fsync`ed. Source identity includes `receivedAt`; output identity includes `asOf`; therefore normal 30-minute refreshes intentionally create new lineage even when market values are unchanged. No compaction, checkpoint, rotation/retention, or disk high-water policy exists. Once the mounted volume runs out of writable blocks, append/fsync is normalized to `DURABLE_WRITE_FAILED` and every subsequent refresh fails.

## Storage model

Keep the canonical active path unchanged:

- Active journal: `/data/foxyya-v12.lineage.jsonl`
- Compacted checkpoint journal: sibling `foxyya-v12.lineage.checkpoint.jsonl`
- Checkpoint audit ledger: sibling `foxyya-v12.lineage.checkpoints.jsonl`

The checkpoint journal stores a dependency-closed recent set of canonical SOURCE and OUTPUT events, re-sequenced with valid event checksums. The active journal stores events appended after the latest checkpoint. Replay scans the checkpoint first and then the active journal, so recent retained lineage remains fully traceable after restart.

The audit ledger is append-only and small. Each compaction records the pre-compaction byte count/event count/SHA-256, retained byte count/event count, retired event count, retained oldest/newest timestamps, and post-compaction SHA-256. This is the durable proof required before old full payloads can be retired.

## Bounded compaction

Compaction is dependency-aware, not blind tail truncation.

1. Stream-validate checkpoint + active events using bounded reads.
2. Build lightweight event metadata plus SOURCE record lookup needed to close OUTPUT dependencies.
3. Walk OUTPUT events newest-first and retain complete OUTPUT closures (the output plus every referenced source). Stop before the configured retained-byte target, but always keep at least the newest complete output closure when one exists.
4. Keep any newer source-only events that fit the target; incomplete older source-only tails are not required for an already-published trace.
5. Write the new checkpoint journal to a temporary sibling, fsync it, and verify it can be replayed.
6. Append and fsync the checkpoint audit record containing both old and new digests.
7. Atomically replace the checkpoint journal, then reset the active journal only after checkpoint durability is established.

If the temporary checkpoint cannot fit, compaction fails with `LINEAGE_COMPACTION_SPACE_REQUIRED`; it never destroys the old journal to make room. The operational response is to enlarge the Research Staging volume first.

## Rotation and retention

The active journal has a bounded rotation threshold. After a successful refresh, maintenance compacts checkpoint + active back to the retained-byte target when either:

- active journal bytes exceed the rotation threshold, or
- total lineage bytes exceed the compaction threshold, or
- filesystem usage reaches the soft high-water mark.

This makes the checkpoint journal the retained recent generation and resets the active generation. The checkpoint audit ledger retains compact historical proofs without retaining unbounded canonical payloads. Audit-ledger retention is itself bounded by a high maximum entry count; when it rolls, the new first entry contains a chain digest over the removed checkpoint records so history cannot be silently rewritten.

## High-water protection

Before each append, calculate filesystem capacity/available bytes with `statfsSync` when supported.

- **Soft high-water:** trigger maintenance before accepting more lineage growth.
- **Critical high-water:** if maintenance cannot restore reserve space, reject the append with `LINEAGE_DISK_HIGH_WATER` before attempting a partial durable write.
- Maintain an absolute reserve byte floor in addition to percentage thresholds.

`DURABLE_WRITE_FAILED` remains reserved for genuine write/fsync failures, not predictable capacity exhaustion.

## Growth audit

Expose a non-mutating audit helper (not a new enumerable store command) that reports at minimum:

- active/checkpoint/total bytes;
- event/source/output counts;
- oldest/newest recorded times;
- bytes by event type;
- largest event bytes;
- filesystem total/available/used ratio when available;
- configured thresholds and whether maintenance is recommended/required.

Startup and post-refresh maintenance log one concise audit summary in Research Staging, without secrets or canonical observation payloads.

## Runtime integration

`runtime_entry.js` performs maintenance before opening the live store when storage is already above policy, then creates the durable store. `refreshResearch()` runs bootstrap normally and calls lineage maintenance only after a successful published refresh. Maintenance failure is routed to the research error handler and must never enable execution writes.

The 30-minute production-like staging cadence remains the default. A shorter staging-only refresh interval may be used temporarily for validation and restored afterward.

## Default policy

Defaults are deliberately conservative and overrideable through `FOXYYA_V12_LINEAGE_*` Research Staging environment variables:

- retained target: 64 MiB
- compaction trigger: 128 MiB total lineage bytes
- active rotation trigger: 32 MiB
- soft filesystem high-water: 80%
- critical filesystem high-water: 90%
- absolute reserve: 32 MiB
- checkpoint audit records retained: 256

For an already nearly-full 500 MB volume, safe first compaction may require enlarging the Staging volume because the temporary compacted checkpoint is written before any historical payload is retired.

## TDD acceptance criteria

Tests must prove RED then GREEN for: growth audit metrics; dependency-closed compaction; checkpoint durability before retirement; replay across checkpoint + active journal; rotation threshold; checkpoint-ledger retention chain; soft/critical high-water behavior; ENOSPC never mutating live indexes; torn tail/corruption semantics; and the unchanged enumerable public store API.

Full verification requires the existing v12 Node suite, existing runtime JavaScript regressions, Python runtime regression, and production safety string checks from `.github/workflows/v12-integration.yml`.

## Staging acceptance gate

Before Market Data Coverage Gate work starts:

1. Full CI is green on the exact commit to be deployed.
2. Research Staging is deployed with `RESEARCH_ONLY=true` / `EXECUTION_WRITE=false` unchanged.
3. Storage audit shows bounded lineage growth and adequate reserve.
4. At least three Research Staging refresh cycles complete without `DURABLE_WRITE_FAILED` or `LINEAGE_DISK_HIGH_WATER`.
5. A restart/redeploy can replay retained lineage and serve a retained output trace.
