# FOXYYA Lite V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight, mobile-first FOXYYA web platform that remains usable even when strategy, paper-trading, or backtest services are unavailable.

**Architecture:** Create a new isolated web app under `foxyya-lite/` instead of extending the legacy monolithic UI. The frontend reads stable snapshot contracts for market, strategy, paper, performance, and backtest data; each module exposes independent LIVE/STALE/ERROR/LOADING/EMPTY states. Production Execution V2 remains untouched.

**Tech Stack:** Next.js + TypeScript + React + CSS modules/Tailwind-equivalent utility styling, route handlers for lightweight APIs, Vitest/React Testing Library, Playwright for mobile smoke tests, Vercel-compatible deployment.

**Spec:** Approved in ChatGPT conversation on 2026-09-17; this plan captures the implementation baseline.

## Global Constraints

- Production Execution V2 must not be modified.
- PAPER_ONLY and REAL_ORDER_LOCK semantics must remain intact.
- Frontend must render even if backend modules fail.
- Phase 1 must work entirely with mock data.
- Crypto only for V1; no US/TW/KR market expansion.
- Mobile-first; all five core pages must be usable on phone widths.
- Forward Paper and Historical Backtest metrics must never be merged.
- Initial live-market scope: BTCUSDT, ETHUSDT, SOLUSDT.

---

## File Structure

Create the new app in `foxyya-lite/` with focused modules:

- `foxyya-lite/app/page.tsx` — Home page.
- `foxyya-lite/app/strategies/page.tsx` — Strategy list/detail entry page.
- `foxyya-lite/app/orders/page.tsx` — Paper positions and pending orders.
- `foxyya-lite/app/results/page.tsx` — Forward paper performance.
- `foxyya-lite/app/backtest/page.tsx` — Backtest input and results.
- `foxyya-lite/app/api/market/route.ts` — Market snapshot endpoint.
- `foxyya-lite/app/api/strategy/route.ts` — Strategy snapshot endpoint.
- `foxyya-lite/app/api/paper/route.ts` — Paper snapshot endpoint.
- `foxyya-lite/app/api/results/route.ts` — Performance snapshot endpoint.
- `foxyya-lite/app/api/backtest/route.ts` — Backtest snapshot endpoint.
- `foxyya-lite/components/` — Shared UI components only.
- `foxyya-lite/lib/contracts.ts` — Shared TypeScript contracts.
- `foxyya-lite/lib/mock-data.ts` — V1 mock fixtures.
- `foxyya-lite/lib/status.ts` — Snapshot freshness/status helpers.
- `foxyya-lite/tests/` — Unit/component tests.
- `foxyya-lite/e2e/` — Playwright mobile smoke tests.

## Task 1: Isolated FOXYYA Lite Shell

**Produces:** a standalone app that does not depend on legacy `live_ui.html` or Production Execution V2.

- [ ] Scaffold `foxyya-lite/` as a separate Next.js TypeScript app.
- [ ] Add global dark theme tokens matching the approved FOXYYA UI direction.
- [ ] Create shared `Header`, `SearchBar`, `BottomNav`, `SectionCard`, `StatusPill` components.
- [ ] Add five routes: `/`, `/strategies`, `/orders`, `/results`, `/backtest`.
- [ ] Add a mobile viewport smoke test for 390x844 and desktop smoke test for 1440x900.
- [ ] Verify every route renders without API access.
- [ ] Commit: `feat(lite): scaffold isolated FOXYYA mobile shell`.

## Task 2: Snapshot Contracts and Mock Data

**Produces:** stable frontend/backend contracts for all V1 data modules.

- [ ] Define `SnapshotStatus = 'LIVE' | 'STALE' | 'ERROR' | 'LOADING' | 'EMPTY'`.
- [ ] Define `MarketSnapshot`, `StrategySnapshot`, `PaperSnapshot`, `PerformanceSnapshot`, `BacktestSnapshot` interfaces in `lib/contracts.ts`.
- [ ] Add mock fixtures for BTCUSDT, ETHUSDT, SOLUSDT and at least one strategy card.
- [ ] Add unit tests validating required fields and ensuring paper/backtest result types remain distinct.
- [ ] Commit: `feat(lite): add snapshot contracts and fixtures`.

## Task 3: Home Page UI

**Produces:** the approved reference UI as a functional responsive page.

- [ ] Build header with FOXYYA logo, simulation-mode badge, settings button, avatar.
- [ ] Build search field for symbol/event text filtering.
- [ ] Build Market Pulse card with direction, risk sentiment, tabs, symbol rows, price, 24h change.
- [ ] Build International Focus card with News/Economic Calendar tabs and three mock events.
- [ ] Build Strategy Opportunity card with symbol, strategy, direction, and status.
- [ ] Ensure bottom navigation remains stable and thumb-friendly on mobile.
- [ ] Add loading, empty, stale, and error visual states for each card independently.
- [ ] Commit: `feat(lite): implement mobile-first home dashboard`.

## Task 4: Strategy Page

**Produces:** watch/pending/invalid strategy browsing without execution actions.

- [ ] Add Watch, Pending, Invalid filters.
- [ ] Render strategy cards with symbol, strategy, direction, status, entry, stop, TP1, TP2, R:R, confidence, updated time.
- [ ] Add detail expansion for setup reason, regime, invalidation, risk note.
- [ ] Explicitly omit live-order buttons.
- [ ] Add tests proving status filters only expose matching items.
- [ ] Commit: `feat(lite): add strategy monitoring page`.

## Task 5: Paper Orders Page

**Produces:** read-only paper risk and order monitoring.

- [ ] Add summary metrics: Paper NAV, Cash, Open Positions, Pending Orders, Unrealized PnL, Portfolio Risk.
- [ ] Add Positions table/cards and Pending Orders table/cards.
- [ ] Permanently show `PAPER ONLY` and `REAL ORDER LOCKED` labels.
- [ ] Add empty-state UI when no positions or orders exist.
- [ ] Add test asserting no execution action is rendered.
- [ ] Commit: `feat(lite): add read-only paper orders page`.

## Task 6: Results Page

**Produces:** Forward Paper performance only.

- [ ] Add KPI cards for Trades, Win Rate, Expectancy, Profit Factor, Net PnL, Max Drawdown.
- [ ] Add NAV curve component with 7D/30D/90D/ALL controls.
- [ ] Add recent-trades list.
- [ ] Label data source explicitly as `Forward Paper`.
- [ ] Add tests proving no backtest metrics are merged into Forward Paper aggregates.
- [ ] Commit: `feat(lite): add forward paper results`.

## Task 7: Backtest Page

**Produces:** a separate historical-testing surface.

- [ ] Add Symbol, Time Range, Strategy, Timeframe controls.
- [ ] Add Start Test action wired to mock response first.
- [ ] Render Trades, Win Rate, Profit Factor, Net Return, Max Drawdown, Equity Curve.
- [ ] Label data source explicitly as `Historical Backtest`.
- [ ] Add tests proving results are isolated from Forward Paper state.
- [ ] Commit: `feat(lite): add isolated backtest page`.

## Task 8: Lightweight Snapshot APIs

**Produces:** five independent APIs that can fail without taking down the app.

- [ ] Implement `GET /api/market` returning the mock market snapshot.
- [ ] Implement `GET /api/strategy` returning the mock strategy snapshot.
- [ ] Implement `GET /api/paper` returning the mock paper snapshot.
- [ ] Implement `GET /api/results` returning the mock performance snapshot.
- [ ] Implement `GET /api/backtest` returning the mock backtest snapshot.
- [ ] Add contract tests for HTTP 200 schema and independent 500/error rendering.
- [ ] Commit: `feat(lite): expose independent snapshot APIs`.

## Task 9: Live Crypto Market Data

**Produces:** live BTC/ETH/SOL market rows without coupling to the trading engine.

- [ ] Replace only `/api/market` mock source with a public crypto market-data adapter.
- [ ] Normalize external payloads into `MarketSnapshot`.
- [ ] Add freshness calculation and downgrade to `STALE` when data exceeds the configured age threshold.
- [ ] Cache last-known-good market snapshot so transient upstream errors do not blank the home page.
- [ ] Add adapter tests using recorded fixtures, not live network calls.
- [ ] Commit: `feat(lite): connect live crypto market snapshot`.

## Task 10: Strategy Snapshot Adapter

**Produces:** a read-only bridge from existing strategy output to the new contract.

- [ ] Identify the smallest stable existing strategy-output source without modifying Production Execution V2.
- [ ] Write an adapter that maps it into `StrategySnapshot`.
- [ ] Preserve WAITING/WATCH/INVALID distinctions.
- [ ] Fall back to last-known-good snapshot on source failure.
- [ ] Add contract tests against representative existing output.
- [ ] Commit: `feat(lite): bridge strategy snapshots`.

## Task 11: Paper and Performance Snapshot Adapters

**Produces:** read-only paper state and Forward Paper performance data.

- [ ] Identify read-only paper ledger/result sources.
- [ ] Map them into `PaperSnapshot` and `PerformanceSnapshot` without altering execution code.
- [ ] Keep portfolio risk <=1.5% semantics visible as a display/validation constraint, not an execution control.
- [ ] Add stale/error fallback handling.
- [ ] Add tests for zero positions, positive/negative PnL, and stale source data.
- [ ] Commit: `feat(lite): bridge paper and performance snapshots`.

## Task 12: Real Backtest Adapter

**Produces:** real historical test results through the isolated backtest surface.

- [ ] Bridge the existing backtest engine behind `/api/backtest`.
- [ ] Enforce allowed V1 symbols/timeframes at the API boundary.
- [ ] Return `BacktestSnapshot` only; never write to paper or execution state.
- [ ] Add regression tests proving a backtest request does not mutate paper ledger files/state.
- [ ] Commit: `feat(lite): connect isolated backtest engine`.

## Task 13: Mobile/PWA Hardening

**Produces:** installable, reliable phone experience.

- [ ] Add PWA manifest and FOXYYA app metadata.
- [ ] Add safe-area padding for iPhone bottom navigation.
- [ ] Verify 390x844, 393x852, 430x932 viewport layouts.
- [ ] Ensure tap targets are at least 44px high.
- [ ] Run Lighthouse/mobile performance checks and remove blocking frontend work.
- [ ] Commit: `feat(lite): harden mobile PWA experience`.

## Task 14: Deployment and Acceptance Gates

**Produces:** a public staging URL that can be validated from a phone.

- [ ] Deploy `foxyya-lite/` independently of the legacy runtime.
- [ ] Configure only the environment variables required by snapshot adapters.
- [ ] Verify a backend error in strategy/paper/backtest does not prevent Home from rendering.
- [ ] Verify BTC/ETH/SOL market data updates on refresh.
- [ ] Verify all five bottom-nav routes work on a physical phone.
- [ ] Verify `PAPER ONLY` and `REAL ORDER LOCKED` are visible wherever order state appears.
- [ ] Verify Forward Paper and Backtest results remain visually and structurally separated.
- [ ] Tag the passing build as the FOXYYA Lite V1 MVP candidate.
- [ ] Commit: `chore(lite): complete V1 acceptance gate`.

## Acceptance Gates

### Gate 01 — Usable Shell
- Five routes open on phone and desktop.
- Home matches the approved visual hierarchy.
- Mock data only; no backend dependency.

### Gate 02 — Live Market
- BTC/ETH/SOL prices and 24h changes are real.
- LIVE/STALE/ERROR states behave independently.

### Gate 03 — Strategy + Paper
- Strategy opportunity, positions, pending orders, and risk summary are readable.
- No real-order controls exist.

### Gate 04 — Results + Backtest
- Forward Paper metrics and NAV curve are visible.
- Historical backtest runs separately and cannot mutate paper state.

### Gate 05 — Mobile Release Candidate
- Public staging URL works on a physical phone.
- PWA install flow works.
- A single module failure never causes whole-app failure.
