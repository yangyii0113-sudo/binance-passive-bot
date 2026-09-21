# Taiwan live source readiness implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Explain the existing official integration blocker before downstream research calculation, preserving the failure gate.
**Architecture:** One pure canonical date/evidence guard inside the existing smoke tool. Acquisition adapters and research truth stay unchanged.
**Tech Stack:** Python 3.12 stdlib, pytest.
**Spec:** docs/tw/P3_4_SOURCE_READINESS.md

## Global Constraints

- P3.4 ACTIVE; P3.5/P3.6 LOCKED until both required GitHub gates pass.
- No source/timestamp => never label as live.
- No missing date replacement, source substitution, or relaxed acceptance.
- No Production Execution V2 changes or executable orders.

## Review Focus

1. One absent feed must not be ignored because seven dates match.
2. Mixed dates within a single feed must not collapse to latest/majority.
3. Malformed dates and missing evidence must produce a readable rejection.
4. Source and record ordering must not change the result.
5. The real smoke must reject before sector ranking and still exit unsuccessfully.

### Task 1: Source readiness guard and smoke integration

**Files:** tools/tw_public_data_smoke.py; tests/test_tw_smoke_readiness.py; tests/fixtures/tw/readiness_misaligned.json; .github/workflows/tw-research-ci.yml; docs/tw/P3_4_SOURCE_READINESS.md.
**Interfaces:** Consumes mapping of eight dataset names to canonical Observation sequences. Produces require_aligned_sources(sources) -> dict; rejection OfficialSourceReadinessError(RuntimeError) with `.report`.

- [x] Step 1: Add reduced real official response fixture; it must preserve 9/18 and 9/21 source dates. Test the actual smoke using only the HTTP transport replacement. Expect readiness rejection, not the former ranking error.
- [x] Step 2: Add direct guard tests for all Review Focus cases. A callable assertion for the missing guard must fail before implementation.
- [x] Step 3: Implement the pure guard and invoke it on the eight canonical source tuples before sector/market aggregation. On failure print `OFFICIAL_SOURCE_READINESS` + JSON, re-raise; on success continue every existing check.
- [x] Step 4: Run `PYTHONDONTWRITEBYTECODE=1 ../venv/bin/python -m pytest tests/test_tw_*.py -q`; expected all pass. Run full regression with `PYTHONPATH=src:.` and record counts.
- [ ] Step 5: Independent final review; fix any demonstrated blocking issue with a failing test first. Re-run the live diagnostic and publish reviewed change to the existing authorized research branch.
- [ ] Step 6: Verify GitHub architecture and independent live step results. If sources remain misaligned, retain phase locks and deliver exact source-date report and handoff.
