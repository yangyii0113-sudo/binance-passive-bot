# Evidence Integration Implementation Plan

> Execute inline with superpowers:executing-plans; Owen authorized integration of the previously presented design.

**Goal:** Show traceable sources, scoped historical changes and disagreements within existing research cards.
**Architecture:** One read-only model and bounded conclusion store shared by horizon and short-term views; original gates remain authoritative.
**Tech Stack:** Native JavaScript, node:test, existing static build.
**Spec:** docs/superpowers/specs/2026-10-31-evidence-integration-design.md

## Global Constraints
- PAPER_ONLY, REAL_ORDER_LOCK, No Backfill; no execution, deployment configuration or strategy changes.
- Social opinions remain explicitly unavailable. No consensus-as-probability claims.
- Histories contain no levels/fills and never restore actionable records.

## Review Focus
- Symbol/scope identity mismatch must suppress current evidence.
- Expired, historical, future or malformed timestamps must suppress current conclusions.
- Missing directions/WAIT must not become bearish or neutral votes.
- Corrupted/quota-limited storage must not stop analysis or overwrite corrupted data.
- Long content and source URLs must fit 360/390/430 px and iPad layouts.

### Task 1: Read-only evidence model and history
- Create src/research_evidence.js and tests/research-evidence.mjs.
- Interfaces: evidenceSnapshot(record, now), evidenceModel(record, {history, now}), loadEvidenceHistory(storage), saveEvidenceSnapshot(record, {storage, now}).
- [x] Write failing tests for provenance, direction conflict, chronological scoped comparison, staleness, deduplication, bounded storage and corruption.
- [x] Run node --test tests/research-evidence.mjs; observe missing feature.
- [x] Implement the model/store and prove tests pass.

### Task 2: Existing screen integration
- Create src/research_evidence_view.js; modify horizon_view.js, agent_decision_view.js, agent_trade_plan_view.js, main.js, state.js, styles.css and package.json.
- Interfaces: researchEvidenceView(record, {history, now}); history comes from state.agents.evidenceHistory; persistence runs when actual analysis completes.
- [x] Add failing rendering/integration tests for both surfaces, escaped reasons and unavailable/stale evidence.
- [x] Implement compact summary with expandable sources, changes, disagreements and missing-data labels.
- [x] Run npm test, npm run build, syntax/diff checks and 360/390/430 px + iPad visual checks if browser available.
- [x] Commit and independently review the full diff.
- [ ] Publish isolated branch and draft PR: Owen has now explicitly authorized this payload and public destination; awaiting push and PR verification.
