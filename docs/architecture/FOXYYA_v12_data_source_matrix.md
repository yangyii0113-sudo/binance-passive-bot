# FOXYYA v12 Data Source Matrix

**Status:** Phase 11 Source Selection Gate  
**Date:** 2026-09-09  
**Branch:** `v12-multimarket-architecture`  
**Production impact:** None.

## 1. Source policy

FOXYYA uses an **official-first, license-aware** source policy.

Priority:

1. Official public API / official feed.
2. Official authenticated or paid API where the capability materially improves research.
3. Licensed market-data redistributor for real-time exchange data when direct exchange licensing is impractical.
4. Commercial aggregator only after its licensing, freshness, redistribution rights and historical coverage are reviewed.

Never use an unofficial scraped website as canonical data when an official or licensed source is required.

Every adapter must map provider payloads into `foxyya-observation/1` and then pass the v12 Data Quality Gate.

## 2. Capability matrix

| Domain | Preferred source | Access class | v12 role | Decision |
|---|---|---|---|---|
| Crypto market / derivatives | Binance USD-M Public API | Public read-only | Crypto quotes, klines, Funding, OI context | Existing core; retain |
| US company filings / financial facts | SEC EDGAR `data.sec.gov` submissions + XBRL APIs | Official public, server-side | filings, 10-K/10-Q/8-K, company facts, Form 4/13D/13G discovery | Adopt |
| US real-time equity prices | Nasdaq / NYSE licensed feeds or licensed redistributor | Licensed / entitlement | Quotes, intraday chart, relative volume | Provider decision required |
| US OTC / short-sale evidence | FINRA Developer APIs / OTC Transparency | Official API; dataset-specific terms | Reg SHO daily volume, short-interest/OTC research evidence | Adopt where terms permit |
| US macro labor/inflation | BLS Public Data API | Official public API | CPI, employment and related macro series | Adopt |
| Federal Reserve policy/news | Federal Reserve official RSS / releases | Official public feeds | Fed policy, speeches, releases, selected rates context | Adopt |
| Futures positioning | CFTC COT Public Reporting API | Official public API | macro positioning / managed money context | Adopt as slower confirmation evidence |
| Taiwan listed market | TWSE OpenAPI | Official public API | listed-market reference, public corporate/open data | Adopt |
| Taiwan OTC market | TPEx OpenAPI | Official public API | OTC quotes, margin, short-sale and institutional datasets | Adopt |
| Taiwan filings / corporate data | TWSE/MOPS-open datasets where exposed through official interfaces | Official | financial/corporate disclosure research | Adopt per endpoint validation |
| Korea | KRX Data Marketplace Open API | Official API key | indexes/equities/statistics for regional intelligence | Adopt after key provision |
| Japan | JPX J-Quants API V2 | Official API key / plan dependent | historical prices, financials, earnings schedule; optional higher-frequency data | Adopt after plan decision |
| Hong Kong | HKEX Data Marketplace | Official marketplace / product dependent | regional/market data, historical and holdings datasets | Dataset/licensing review required |
| Europe macro | ECB Data Portal API | Official public API | rates, FX, European macro context | Adopt |
| Europe equity real-time | Exchange/redistributor licensed feed | Licensed | equity quotes/market breadth | Provider decision required |
| Global news | Official issuer/regulator/central-bank RSS first; licensed news provider later | Mixed | facts/catalysts with source/time | Official-first |
| Economic calendar | Official BLS/Fed/issuer schedules + normalized calendar layer | Official sources | high-impact events | Adopt |

## 3. Source latency semantics

Provider metadata must state the capability's natural latency and publication cadence.

Examples:

- SEC company submissions/XBRL: filing-driven, near-real-time publication after dissemination; not market price data.
- FINRA OTC transparency: delayed publication; never labeled LIVE Smart Money.
- CFTC COT: weekly positioning confirmation; never an intraday lead signal.
- JPX J-Quants standard historical/daily data: not assumed real-time; higher-frequency add-ons retain their documented delivery semantics.
- Exchange real-time quote data: may be labeled LIVE only when entitlement, timestamp and freshness policy validate it.

## 4. Smart Money evidence classification

`SMART_MONEY` is not a provider field and never means certainty. It is a FOXYYA evidence family assembled from traceable sub-evidence.

### US

- SEC Form 4 / beneficial ownership filings
- FINRA OTC / short-sale datasets where publication cadence is suitable
- licensed options/flow data only after provider review
- estimate revisions from a licensed fundamentals/consensus provider

### Taiwan

- foreign investor activity
- investment trust activity
- dealer activity
- margin / short / securities-lending evidence when available
- monthly revenue / disclosure changes

### Macro

- CFTC COT positioning
- rate / FX / volatility and breadth context

Each evidence item preserves source, as-of, release cadence, confidence and known limitations.

## 5. Providers intentionally NOT selected yet

The following require an explicit cost/licensing decision before implementation:

1. Consolidated / real-time US equity quote provider.
2. US earnings consensus / analyst estimate revision provider.
3. US options flow / IV / unusual options provider.
4. Europe real-time equity provider.
5. HKEX datasets that require product subscription.
6. Japan J-Quants plan/add-ons beyond baseline capability.
7. Any redistributable real-time Taiwan data product beyond official public datasets.

No v12 module should silently substitute delayed web-scraped values for these capabilities.

## 6. Provider implementation order

### Wave A — official/no-secret or existing public sources

1. Binance public read adapter (reuse existing runtime data; no duplicated execution logic)
2. TWSE OpenAPI adapter
3. TPEx OpenAPI adapter
4. SEC EDGAR server-side adapter
5. BLS macro adapter
6. Federal Reserve feed adapter
7. CFTC COT adapter
8. FINRA research-data adapter
9. ECB macro adapter

### Wave B — authenticated official sources

10. KRX Open API
11. JPX J-Quants
12. HKEX selected products

### Wave C — licensed market-data / consensus providers

13. US real-time quotes
14. US consensus / revisions
15. Options analytics
16. Europe real-time equities

## 7. Release gate

A provider cannot be promoted from `UNAVAILABLE` to a live v12 capability until:

- source terms and entitlement are documented;
- timestamps map correctly into canonical observations;
- Quality Gate downgrade behavior is tested;
- retry/rate-limit behavior is tested;
- provider failure does not affect Crypto Execution V2;
- no API key/secret reaches the frontend;
- UI displays the provider's real freshness status.
