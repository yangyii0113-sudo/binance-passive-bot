# FOXYYA v12 product data implementation plan

**Goal:** Productize the deployed research read plane: provider diagnostics, seven-region context, TW/US research cards, and clickable durable evidence.
**Architecture:** Add normalized presentation fields to the existing Home read model. Publish diagnostics with the same completed source cycle. Retain Source → Output → Home order. Reuse the existing fixed-origin read API for evidence. No execution bridge is connected.
**Spec:** ../specs/2026-09-09-foxyya-v12-architecture-design.md and the user's explicit continuation scope.
**Tech stack:** Dependency-free Node/CommonJS, browser UMD, node:test, existing Python regressions.

## Constraints
- RESEARCH_ONLY=true, EXECUTION_WRITE=false. Preserve PAPER_ONLY and REAL_ORDER_LOCK.
- Only v12 branch changes; main can be merged into v12 to maintain scope parity.
- Only deploy Railway project 573d6f88-4b27-44a2-9b41-8ba9b85ed47c, environment 1d57bf50-2365-4d6e-86e1-89a773a30bbc, service 01d2c000-5a1d-4443-a80e-4d110a9d84a4.
- No changes or staged patch acceptance in Execution V2 project.
- Macro facts do not imply directional bias. Missing quotes, consensus, options, regions stay UNAVAILABLE. Snapshot timestamps remain original; fetch freshness is distinct from observation age.

## Tasks
- [x] RED: contracts exercise live bootstrap to Home, diagnostics degradation, facts and gaps through rendering, fixed-path lineage reads, automatic staging load, error/race handling.
- [x] GREEN: connect runtime governance; publish compact per-binding diagnostics and source health; add canonical facts to cards and regions; render state, time, confidence, gaps and evidence links.
- [x] GREEN: evidence drawer loads only validated output references; shows source/dataset/time/observation values; handles loading, missing, failed and stale responses; opens on actual clicks.
- [x] Verify full v12 suite, JS and Python regressions, branch scope and safety gates. Review changed behavior.
- [ ] Publish tested v12 commit; require GitHub v12 Integration success before independent staging deploy. Black-box health/home/lineage and desktop/mobile interaction. Recheck Execution V2 deployment and staged patch unchanged.

## Baseline evidence
513 v12 tests pass. Source commit ada847b. Production fff3804c-2124-4697-a4ff-16f96fa0f97e. Independent staging 46ebb6bf-b65e-4327-ac46-a6b85887b24c. Original project patch 4a8a6d03-a3ce-48e5-85f8-2da60ac8fe3c remains STAGED (13 changes).

## Verification and coordination
- 2026-09-09: 529/529 v12 tests, 16/16 existing JS regressions (including current main runtime_backtest), Python runtime regression, branch scope and production safety pass.
- New tests observed RED before implementation; review fixes reproduced before repair: canonical exception diagnostics, failed Home refresh state, request ordering, macro period ordering.
- Actual local browser: Home automatically loads public research; System shows ECB_PAYLOAD_REQUIRED despite HTTP 200; TW card click opens durable evidence (3 source datasets, 20 observations). Desktop visually inspected. Attempted 390px override remained 1280px; mobile viewport not claimed verified.
- Runtime observations: configured SEC revenue concept currently ends at 2022-01-30 and is explicitly period-labelled; TWSE quote date can lag T86 flow date (2026-09-08 vs 2026-09-09). These are source/model limitations for the separate full audit task to assess.
- Concurrent user-created audit task 01a086ce-ecf9-73e2-b2d0-f3c53437f3bf requested a fixed commit and single ownership of final UI/deploy. This task will cease UI mutations after handoff and verify final status read-only.
- No remote push or deployment performed as of this commit. Original project contains another v12-linked failed service; automatic trigger inspection must be resolved before pushing to avoid unintended deployment. No opaque patch accepted.
