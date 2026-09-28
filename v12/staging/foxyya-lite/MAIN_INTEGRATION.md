# Lite main integration — 2026-09-27

## Scope and provenance

- PR base: main `94dde5babd22061aba1ada0947bb1749f1e8b3fc`.
- Frontend baseline: `foxyya-lite-railway-deploy@f92c1275c1bbd0b23ee6729d7a433e73970442a6`.
- Unknown-data logic ported from PR #13 `3b21d795942d0e4b6584435fbaea671ed9857dab`.
- No parent commit from PR #12 or the v12 development chain is merged.
- Existing frontend, assets, local paper storage keys, entry-readiness alerts and backtests remain. The independent research-service process, Docker definitions and its tests/workflows are not imported.
- The original main runtime, ledger, engine, archives, Railway configuration and workflows other than Lite publishing remain byte-for-byte unchanged.

## Behavior

Missing upstream account/performance data remains null. Invalid data fails into ERROR. Counts, PnL, R and risk are not synthesized from missing values. Non-LIVE account views conceal old balances, trades and equity curves. Real reported zero remains zero. Receiving a snapshot never claims that the canonical ledger passed an audit.

The existing browser-local simulation is preserved and explicitly labeled; its initialized balance and real locally recorded values are separate from unavailable upstream data. No local storage keys, ledger history, strategy parameters or execution rules change.

PAPER_ONLY / REAL_ORDER_LOCK / No Backfill remain in force. Canonical hash chain, lifecycle, NAV and open-risk evidence is still pending on PR #12. No canonical paper fills are enabled by this PR.

## Delivery and cutover

1. The new draft PR builds only this directory through Netlify deploy-preview. Existing non-production access controls remain.
2. Lite Main CI runs the full Lite suite, static build and scope check. Review at 360 / 390 / 430 px against the new commit; previous #13 acceptance is not transferred automatically.
3. This PR does not publish to the daily GitHub Pages URL before merge. The unchanged main workflow continues serving the active Lite branch meanwhile.
4. **Merging this PR changes publishing:** the Pages workflow tests and builds the exact main event SHA from this directory, uses the existing Pages environment/site URL, and stops listening to the old branch's workflow_run events. UI changes on main then trigger publication. Versioned release directories preserve CSS/module/asset consistency. No new hosting service is created.
5. Before merge, re-read the active Lite branch. If it advanced beyond the source SHA above, reconcile those changes first; also confirm the repository's production auto-deploy settings so a main merge does not restart Execution V2.
6. After an authorized cutover, verify the daily build.json full SHA and repeat mobile navigation. The same URL/origin preserves browser-local records; a Netlify preview has a different origin and will not contain a user's existing Pages records.

Rollback is a reviewed revert of the Lite integration, restoring the old publishing workflow, followed by its manual Pages publish. Runtime/ledger files are not involved. PRs #12 and #13 remain available as evidence until the replacement is accepted.

## Validation

The existing baseline suite passed (142 node:test cases plus smoke scripts). Nine added account-data tests failed against that baseline and then passed with the port. The static artifact test first failed on unversioned module paths, then passed with 66 modules / 188 relative imports before the subsequent frontend sync confined to the same release. The imported history-equity fixture was corrected to mark its live local snapshot LIVE, matching the actual adapter; stale snapshots remain concealed.

Browser, remote checks and preview results are recorded in the PR after verification. Chromium viewport acceptance does not claim iPhone Safari or Android hardware validation.

## Final code review

Independent review identified three Important truthfulness gaps in inherited strategy views: stale-account leakage, null-to-zero interpretation, and missing details reported as zero activity. Four additional renderer regressions reproduced these failures; all are fixed. The final suite passes after synchronizing frontend f92c127. Static artifact verification covers 67 modules and 189 relative imports. No Critical or deferred Minor findings.
