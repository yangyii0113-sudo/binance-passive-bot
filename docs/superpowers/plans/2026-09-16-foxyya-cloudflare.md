# FOXYYA Cloudflare Research Backend

Goal: isolated Workers + D1 research backend serving existing mobile UI, without Production mutations or Railway deployments. User selected Cloudflare first and may move to a Mac mini after September 22; no automatic future switch.

Architecture: Worker serves authenticated static assets/read APIs. A two-hour scheduled event runs the existing research pipeline against bounded official-source requests and atomically stores the home snapshot and canonical lineage in D1. No filesystem, Production bridge, real orders, extra paid data, or automatic upgrades. A low-volume profile fetches regional public data only; expensive company-wide datasets are deferred in this profile and reported as unavailable. Full v12 remains unchanged for Mac mini. Free CPU viability and provider access must be measured live before acceptance.

- [x] Test and implement canonical in-memory lineage per cycle and atomic D1 archive with 25 MiB application high-water mark (halt, never delete history).
- [x] Test and implement bounded public-source fetch, two-hour deduplication, lease, explicit partial coverage, stale readiness, and authenticated read-only API.
- [x] Package unchanged UI with visible Cloudflare scope notice and prepare validated deployment config; no automatic deployment or account provisioning.
- [ ] Run Node/SQLite integration, Workers bundle/local runtime checks, existing v12 regression and changed-path safety review.
- [ ] Commit independent branch and publish reviewable code, recording deployment blockers and Mac mini migration procedure.

Acceptance: no publication without successful transaction; replay identical results after new process; stale data never reported ready; HTTP reads never trigger fetches; no secrets exposed; all history retained; no Production endpoint contact; no automatic paid resources. Cloudflare account, D1 identity and viewer secret are external inputs. Remote free-plan CPU and successful real-source cycles are separate live gates, never inferred from local tests.
