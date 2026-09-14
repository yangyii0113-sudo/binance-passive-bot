# FOXYYA AI Continuity Context

> Purpose: prevent long ChatGPT conversations from becoming the only source of project memory.
> New conversations should read `FOXYYA_STATE.json` first, then `FOXYYA_NEXT.md`, and this file only for stable architecture/safety context.

## One-line resume instruction

`接續 FOXYYA，先讀 docs/ai/FOXYYA_STATE.json、docs/ai/FOXYYA_NEXT.md、docs/ai/FOXYYA_CONTEXT.md，重新驗證 GitHub/Railway 後直接執行。`

## Source-of-truth hierarchy

1. GitHub code + CI on the active branch.
2. Railway live config / deployment status / logs.
3. `docs/ai/FOXYYA_STATE.json` and `FOXYYA_NEXT.md`.
4. Chat history and hand-written summaries.

If any lower layer conflicts with a higher layer, use the higher layer and update the continuity files.

## Repository

- Repo: `yangyii0113-sudo/binance-passive-bot`
- Active v12 branch: `v12-platform-completion-20260910`
- v12 Research Plane must remain isolated from Production Execution.

## Safety invariants

- Production remains paper-only unless explicitly authorized otherwise.
- Preserve `PAPER_ONLY=true` and `REAL_ORDER_LOCK=true` in Production.
- v12 Research Staging must remain `RESEARCH_ONLY=true` and `EXECUTION_WRITE=false`.
- Never connect v12 research directly to real order execution.
- Never fabricate unavailable market/provider data.
- Never delete lineage history as a disk-space shortcut.
- Research Forward Validation must remain distinct from trading win-rate/performance.

## Railway deployment quirk

Railway source-triggered deployments on the v12 services can sometimes capture the correct Git commit but build/run the wrong root Production Python image. Treat such deployments as invalid even if the commit hash is correct.

A valid v12 Research Staging deployment must be verified by:

- Node/v12 runtime logs, not `foxyya_runtime_backend/service.py`.
- `/health` passing.
- `RESEARCH_ONLY=true` and `EXECUTION_WRITE=false` visible in runtime state/logs.
- No Production `foxyya_v2_paper.sqlite` runtime in v12 deployment logs.

When the source-trigger bug appears, use a native Railway redeploy after the target snapshot/commit has been captured, then re-verify runtime logs.

## Storage architecture

- Primary lineage volume: `/data` on `foxyya-v12-staging`.
- Backup helper service: `foxyya-v12-lineage-backup-helper`.
- Backup helper persistent volume: `/backup`.
- Large legacy lineage migration is not allowed without a verified durable backup.
- Backup verification requires raw byte count + SHA-256 and persistent storage confirmation.
- Compaction must preserve sequence, checksum, source/output refs, traceability, and restart replay.

## Continuity protocol

Do not wait until a chat is nearly full to write a handoff.

After every material checkpoint (code GREEN, deployment, new blocker, migration, provider change), update:

1. `FOXYYA_STATE.json` — machine-readable current truth.
2. `FOXYYA_NEXT.md` — the exact next engineering actions and acceptance gates.

When the conversation becomes materially long, proactively checkpoint the current GitHub/Railway truth before context exhaustion. Prepare a compact fresh-chat continuation instruction containing at least:

- repository and active branch,
- latest fully GREEN code commit and CI run,
- accepted Railway deployment and any invalid deployment that must not be reused,
- current safety invariants,
- completed checkpoint,
- current blocker if any,
- exact next engineering action.

If a fresh conversation is needed, tell the user to open a new chat and paste the prepared continuation instruction. The workflow cannot programmatically create a new ChatGPT conversation, so project continuity must never depend on the current chat remaining available.

Only update this Context file when a stable invariant, architecture rule, Railway quirk, or operating rule changes.

A new chat should not require pasting a long handoff. The user should normally need only the one-line resume instruction above because the repository continuity files contain the project state.
