# FOXYYA Cloudflare research candidate

Status: isolated implementation candidate, NOT deployed or free-plan CPU accepted.
Base: 7630e79. Production Execution V2, Railway config and ledgers unchanged.

## Scope and constraints
- Workers serves password-protected existing UI and read API; D1 persists snapshots and canonical lineage atomically.
- Regional public summaries only (TW market summaries, US BLS/CFTC); no company scans, no Production bridge, no crypto execution/performance, no forward-validation ledger. Three market cards (CRYPTO / US / TW) retain truthful coverage; KR is deferred with JP / CN_HK / EU. These omissions are displayed in the UI.
- Cron at minute 17 every two hours UTC; each read does not fetch upstream data. 8 unique GET requests max per cycle, 512 KiB per response, 8-second timeout. Failed cycle attempts also wait two hours before retrying to bound spending.
- 25 MiB payload high-water guard halts new writes, preserves all history, and marks readiness degraded. This is an application budget, not exact D1 on-disk usage. Export before capacity changes; no automatic history deletion or paid upgrades.
- Readiness describes publication health, not market decision eligibility. Provider coverage remains authoritative. All unavailable feeds can result in a valid but empty/partial snapshot.
- Source and output hashes use unchanged v12 lineage validation. Current UI lineage endpoint reads latest-cycle traces; all previous cycle records remain in D1 exports.
- Workers Free CPU (10 ms per invocation) is an UNVERIFIED live gate. Node unit tests and local workerd do not establish paid/free compatibility. Do not declare live or silently upgrade if CPU is exceeded.

## Local checks
From repository root: `node --test tests/v12_cloudflare.test.cjs` (Node 22.13+).
From this directory:
1. `npm ci`
2. `node prepare.cjs`
3. `npm run check` (no account writes; config without DB is bundle-only).

## Account-bound deployment (not performed)
Requires a confirmed Cloudflare account with Workers/D1 access. Plugin connection alone may expose only documentation tools; Wrangler OAuth is a separate supported deployment path if needed. Never paste API tokens into chat.

1. Authenticate locally with `npx wrangler login`.
2. Verify Free plan and existing resources before creating anything.
3. `npx wrangler d1 create foxyya-v12-research` and capture actual database ID.
4. `node prepare.cjs <actual-database-id>`.
5. `npx wrangler d1 execute foxyya-v12-research --remote --file schema.sql --config wrangler.jsonc`.
6. Set a unique long password through `npx wrangler secret put VIEWER_PASSWORD --config wrangler.jsonc`. User name is `owen`. The deployment must fail closed without a secret.
7. Deploy exactly this independent Worker with `npx wrangler deploy --config wrangler.jsonc`. Never deploy root Railway files.
8. Inspect real request/cron CPU, failures, provider status, D1 persistence and phone layout. Wait at least two successful two-hour cycles. Initial empty DB returns unavailable until first successful scheduled publication. Cron service registration can take time.
9. Verify unauthorized paths including static assets return 401; opening the homepage does not trigger refresh. Test restart/read consistency and trace lookup.

No deployment automatically enables paid features. If free CPU fails, keep last snapshot and report the limit; revisit a narrower fetch profile or Mac mini, not an unapproved upgrade.

## Mac mini after 2026-09-22 (optional, not scheduled)
Run the original v12 Node runtime privately on the Mac with refresh interval 7200 and a new local data directory. Use Tailscale Serve (private, not Funnel) for phone access. Preserve Cloudflare history with `npx wrangler d1 export foxyya-v12-research --remote --output foxyya-cloudflare-history.sql --config wrangler.jsonc` and verify its checksum/restore. The export preserves snapshot/lineage JSON, but is NOT directly a `.lineage.jsonl` journal; an explicit validated importer is required before merging archives. Existing Railway history stays separate and must not be deleted. Compare both systems before disabling Cloudflare cron. No automatic September 22 action was requested.
