# FOXYYA v12 Unified UI Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate, non-production responsive v12 UI preview that implements the approved decision-oriented IA without changing the current live platform.

**Architecture:** UI consumes v12 read models only. A route/action map drives navigation. Home view-model assembles seven regional contexts, three primary market pulses, Early Trend opportunities and global events; missing data is explicit. Static preview files live under `v12/ui/` and are not wired to Railway.

**Tech Stack:** HTML/CSS/JavaScript, Node `node:test` for route/view-model/structure tests.

**Spec:** `docs/superpowers/specs/2026-09-09-foxyya-v12-architecture-design.md`

## Constraints

- Do not modify `live_ui.html` or `runtime_ui.js`.
- Main navigation: Home, Markets, Research, Positions, Results, Lab.
- Intelligence is an auxiliary destination, not another crowded primary card cluster.
- Home ordering: Global Market Status → Today Focus → Early Trend → Three-Market Pulse → Opportunities → Global Risk & Events.
- Seven regions visible: US, TW, CN/HK, JP, KR, EU, Crypto.
- Three primary markets visible together: Crypto, US, TW.
- No fabricated numbers; empty preview defaults to UNAVAILABLE.
- Mobile primary nav is compact and uses overflow/More for secondary destinations.
- Each card has at most one primary action and two secondary actions.

### Task 1: Route and Action Map
Create `v12/ui/routes.js`, tests for primary/aux routes and allowed action classes.

### Task 2: Home view model
Create `v12/ui/home_model.js`, tests for seven-region coverage, three-market pulse and explicit unavailable states.

### Task 3: Static responsive shell
Create `v12/ui/index.html`, `styles.css`, `app.js`. Tests inspect semantic structure, screen IDs, mobile nav, no BUY/SELL copy and explicit data-status slots.

### Task 4: Preview validation
Serve `v12/ui/` locally, inspect desktop/mobile render if browser tooling is available, run all v12 tests, and verify GitHub diff remains isolated from Production UI/runtime.
