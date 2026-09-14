# Research Staging deployment readiness

Scope: v12 Research Staging only. Production Execution V2 and its Dockerfile/configuration are unchanged.

- `/health` remains process liveness for compatibility.
- `/ready` returns 503 until a published bootstrap and both startup probes pass; it returns 503 again after refresh failure or publication age exceeding twice the configured refresh interval.
- A successful cycle means the existing durable bootstrap/publish path returned successfully. It does not certify every provider is available, data licensing is complete, or historical repair/backup retention is fully verified.
- Readiness includes build revision, last start/success/publication/failure timestamps, successful/failed/consecutive-success counts and safe error codes. Counters reset on process restart; public responses omit raw errors and credentials.
- Each refresh emits a structured success/failure event. Set the Railway Staging service healthcheck path to `/ready` after this revision is deployed. Railway deployment healthchecks alone are not ongoing monitoring; an external monitor must poll `/ready` for runtime alerting.
- CI builds both dedicated images and runs their default CMD with no external network. A CI-only preload supplies deterministic official-source fixtures for the Staging image. It is mounted only by CI, never enabled in Railway.
- CI verifies startup probes, service identity, read-only flags, persisted lineage trace after container replacement, and backup upload/decompression/checksum after helper replacement. This synthetic restore is not a restore audit of the historical production backup.

Live acceptance: verify the exact deployed SHA and `/ready`; then observe at least three successful cycles on the same deployment with increasing publication timestamps, zero failures, and healthy storage. Do not infer this acceptance from CI alone or increase provider polling solely to manufacture samples.
