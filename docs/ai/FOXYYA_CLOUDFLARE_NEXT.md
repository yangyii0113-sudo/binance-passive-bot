# Cloudflare continuation — 2026-09-16

User selected Cloudflare serverless first; Mac mini arrives September 22 and may later run original v12 over a private connection. No automatic future switch was requested.

Independent branch: v12-cloudflare-low-usage-20260916, based on 7630e79. No changes to the existing release branch, Production Execution V2, root deploy configuration or existing ledgers. Research Staging refresh configuration was separately saved as 7200 seconds with deployment skipped in the preceding turn.

Cloudflare candidate implements an authenticated Worker, static mobile UI, two-hour regional summary refresh, bounded GET transport, D1 snapshot/lineage archive and no-delete 25 MiB payload high-water protection. This is a reduced research profile, not feature parity: no Production bridge, new trading results, company scans or forward validation. UI displays these limitations.

Verification: original baseline 774/774; new Cloudflare focused tests 7/7 including real SQLite transactions, failed-write preservation, auth, stale readiness, deduplication, transport limits and canonical trace roundtrip. Wrangler dry-run bundles successfully (~377 KiB uncompressed). Local workerd D1 schema creation succeeded. Wrangler dev initially failed with environment error `uv_interface_addresses` and therefore browser/runtime acceptance is not yet established. Free-plan 10 ms CPU viability and official-provider live access are unverified.

User reports Cloudflare plugin cannot connect. No Cloudflare tools/account deployment authority confirmed. Suggested plugin description is platform/documentation guidance, which does NOT guarantee deployment capability. Do not say reconnecting it is required to deploy. Ask for exact connection error screenshot; supported alternative is user-authenticated Wrangler OAuth/Cloudflare dashboard, without sharing tokens in chat. No cloud resources, paid plan or deployment have been created.

Next: confirm account connection capability; validate independent Worker/D1 only; measure free-plan CPU and provider availability, at least two successful scheduled cycles, mobile UI and authenticated asset protection. Do not silently upgrade or declare platform live on local unit tests. See v12/cloudflare/README.md for deployment and optional Mac mini archive migration.

## 2026-09-17 execution checkpoint

User authorized proceeding toward an accessible independent Cloudflare deployment and cancelled KR. Active Home/API/probe scope is CRYPTO / US / TW; KR adapters and historical contracts remain archived alongside JP / CN_HK / EU. Default bootstrap already has no KR requests. No Production changes.

Wrangler whoami explicitly returned not authenticated. Plugin search returned no available Cloudflare plugin. No account credentials or real D1 ID have been confirmed; bundle-only config deliberately omits D1 instead of retaining a placeholder ID. Deployment and HTTPS delivery remain blocked on account authorization. Do not use a temporary anonymous account as a substitute.

Validation for this checkpoint: 782/782 v12 tests passed; Wrangler bundle dry-run succeeded (377.28 KiB); git diff whitespace check passed. Live deployment remains unperformed.
