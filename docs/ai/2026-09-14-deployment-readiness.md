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

## Configuration precedence incident

The root `railway.toml` selects the Production Python Dockerfile. Live builds confirmed it can override the Staging dashboard Dockerfile setting. Root configuration is untouched. Select `/v12/staging/railway.toml` as the Staging service config file, and `/v12/staging/lineage-backup.railway.toml` for its backup helper. CI now derives image paths from those TOML files before building and booting each default CMD. Verify actual Railway build logs use `node:22-alpine`; dashboard fields alone are insufficient.

Railway `redeploy` reuses a previous deployment commit. To release new code, explicitly deploy the tested commit through the connected repository and verify deployment metadata plus `/ready.buildRevision` match. Do not equate branch HEAD with deployed SHA.

## Railway API limitation observed during rollout

The connected API rejected custom `railwayConfigFile` selection with `INVALID_ARGUMENT` because Config as Code is deprecated. The two TOML files are currently CI configuration contracts, not proof of applied Railway settings. The documented Staging variable `RAILWAY_DOCKERFILE_PATH=v12/staging/Dockerfile` was set, but the subsequent source deployment still built the root Python Dockerfile. The variable alone is not a verified fix for legacy configuration precedence. It remains explicitly set to the intended Staging path.

For durable configuration migration, use an authenticated Railway CLI with `railway config migrate --service foxyya-v12-staging` to preview ONLY this service, then `--apply` only after a non-destructive scoped review. Never run an unscoped project migration against Production and never use `--delete-files` for root config. This workspace has no Railway CLI authentication.

## Verified rollout checkpoint

- Product commit: `c547909ad9baea7cbdd13416b82976b86b5b685a`.
- GitHub Actions `34872550419`: all steps passed, including both real Docker builds/default commands/persistent restart checks.
- Successful Staging deployment: `4798edd3-7ef6-4dbb-93ce-adb6331aa036`. A redeploy after source selection applied the Node service; runtime logs confirm the Node entry and RESEARCH_ONLY=true / EXECUTION_WRITE=false.
- Railway `/ready` log: initial 503 responses during bootstrap, followed by healthcheck success at `2026-09-14T17:11:48Z`.
- Public `/ready`: HTTP 200, READY, exact buildRevision above, startupValidated=true, successfulCycles=1, failedCycles=0, consecutiveSuccesses=1, lastPublishedAt=1789405887497. This is initial startup acceptance, not three-cycle acceptance.
- Service metrics at this checkpoint: memory 0.03344 GB; disk 0.05726 GB. These service metrics do not constitute a historical backup/volume integrity audit.
- Read-only three scheduled refresh acceptance arranged for `2026-09-14T18:52:59Z`; preserve original 1800-second cadence. Require at least four total successes (bootstrap plus three scheduled runs), no failures and increasing publication timestamps on one deployment.
- Prior source deployments `1c8dc417...` and `8ff241eb...` selected the root image and were not accepted by `/ready`. Check superseded/failed state before any future release.
- Permanent legacy Config-as-Code migration is still OPEN; do not claim the TOML selection or documented variable fixed that platform-level issue. No root Railway config, Production Dockerfile, Production service, trading strategy or lineage data was changed/deleted by this task.
