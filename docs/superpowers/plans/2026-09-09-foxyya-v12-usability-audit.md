# FOXYYA v12 emergency usability repair

**Goal:** Restore usable read-only Staging, audit real desktop/mobile controls and fail closed on misleading data.
**Architecture:** Retain ae8d247 product data implementation; repair browser interaction layer and canonical boundary checks independently. Publish only a new isolated research branch to the existing independent Staging service.
**Spec:** Current user request, 2026-09-09, emergency UI/runtime audit.
**Constraints:** RESEARCH_ONLY=true, EXECUTION_WRITE=false; do not touch Execution V2 or accept its opaque patch. Source: ae8d247; deployed baseline ada847b. Audit artifacts in outputs/evidence.

- [x] Capture and click 32 desktop Home controls, 5 market filters, 3 position filters. Record raw snapshots in before-controls.jsonl; API 10/10 GET responses 200.
- [ ] UI repair (primary): add failing tests in tests/v12_usability.test.cjs for delegated generated buttons, actual market filtering, URL/back state, disabled placeholders, loading/retry. Modify v12/ui/app.js, index.html, styles.css, home_renderer.js and home_dom.js. Preserve existing data rendering and research boundary.
- [ ] Runtime repair (independent agent): TDD same-day institutional ratio, canonical-empty diagnostics, ECB live SDMX response parsing. No execution code or UI changes. Save RED/GREEN evidence.
- [ ] Review both changes; full v12 and existing runtime JS/Python regressions; branch scope and research guards.
- [ ] Local browser repeat desktop/mobile, Lineage dialog/details/JSON, actual filter changes, history navigation, and failed reload recovery.
- [ ] Publish final tree to new v12-research-usability-20260909 branch, enable equivalent CI for this branch. Keep original v12 branch unchanged.
- [ ] Review isolated Railway staged config and change only staging source to new branch; deploy tested SHA and read deployed health/home/lineage/source checksums.
- [ ] Repeat live browser checklist, produce status categories and measured before/after counts; document data/license/implementation feasibility separately.

Ruling: use fresh local clone and remote repair branch because another task owns the original checkout and a service in original Execution project still points at original v12 branch. User authorized necessary reversible repairs and Staging deployment; no additional release confirmation required.
