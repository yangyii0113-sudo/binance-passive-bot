# FOXYYA v12 Data Source Matrix

**Status:** P1.8 US Quote Provider Decision CLOSED; activation remains credential / entitlement gated  
**Date:** 2026-09-12  
**Branch:** `v12-p1-data-gate`  
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
| US real-time equity prices | **Alpaca Market Data SIP** (`feed=sip`) | Licensed API key + subscription entitlement; server-side only | consolidated quotes, intraday chart inputs, full-market volume / relative-volume inputs | **Selected for v12; runtime activation blocked until key + entitlement are present** |
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

## 3. US SIP provider decision

P1.8 selects **Alpaca Market Data SIP** as the v12 US consolidated real-time equity market-data provider for internal research use.

Provider facts verified at the decision date:

- Alpaca exposes separate stock feeds for `sip`, `iex` and `delayed_sip`.
- `sip` represents consolidated US exchange data; `iex` is a single exchange and is not equivalent to consolidated market coverage.
- recent / live SIP access requires an authenticated account with the appropriate market-data subscription entitlement.
- the Trading API reference identifies Algo Trader Plus as the plan providing all-US-exchange real-time stock coverage at the time of this decision.

FOXYYA therefore encodes `us-equity-realtime` with:

- provider: `Alpaca Market Data SIP`
- `feed: 'sip'`
- authority: `LICENSED`
- access class: `API_KEY`
- `secretRequired: true`
- `entitlementRequired: true`
- `serverOnly: true`
- `liveEligible: true`
- latency class: `REALTIME`
- redistribution status: `NOT_REVIEWED`

**Important boundary:** provider selection is not the same as runtime activation. No Alpaca key, paid plan, adapter transport or Production deployment is added by P1.8.

### No fallback rule

For the capability `us-equity-realtime`:

- IEX may not be silently substituted for SIP and still be labeled consolidated / full-market / LIVE.
- `delayed_sip` may not be silently substituted for real-time SIP and still be labeled LIVE.
- if the key or entitlement is missing or unknown, the capability remains blocked / unavailable.
- SEC EDGAR facts remain filing data and must never be presented as market-price observations.

## 4. Source latency semantics

Provider metadata must state the capability's natural latency and publication cadence.

Examples:

- SEC company submissions/XBRL: filing-driven, near-real-time publication after dissemination; not market price data.
- FINRA OTC transparency: delayed publication; never labeled LIVE Smart Money.
- CFTC COT: weekly positioning confirmation; never an intraday lead signal.
- JPX J-Quants standard historical/daily data: not assumed real-time; higher-frequency add-ons retain their documented delivery semantics.
- Alpaca SIP: may be labeled LIVE only when key, subscription entitlement, provider timestamp and freshness policy validate the observation.
- Alpaca IEX: single-exchange coverage; never a silent replacement for consolidated SIP market breadth.
- Alpaca delayed SIP: explicit delayed research data only; never a silent replacement for live SIP.

## 5. Smart Money evidence classification

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

## 6. Providers intentionally NOT selected yet

The following still require an explicit cost/licensing decision before implementation:

1. US earnings consensus / analyst estimate revision provider.
2. US options flow / IV / unusual options provider.
3. Europe real-time equity provider.
4. HKEX datasets that require product subscription.
5. Japan J-Quants plan/add-ons beyond baseline capability.
6. Any redistributable real-time Taiwan data product beyond official public datasets.
7. External redistribution rights for Alpaca SIP if FOXYYA evolves from internal research into a multi-user or commercial data product.

No v12 module should silently substitute delayed web-scraped values for these capabilities.

## 7. Provider implementation order

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

13. **Alpaca SIP US real-time quote adapter — provider selected; implementation pending key / entitlement**
14. US consensus / revisions
15. Options analytics
16. Europe real-time equities

## 8. Release gate

A provider cannot be promoted from `UNAVAILABLE` / `BLOCKED` to a live v12 capability until:

- source terms and entitlement are documented;
- required credentials are server-side only;
- timestamps map correctly into canonical observations;
- Quality Gate downgrade behavior is tested;
- retry/rate-limit behavior is tested;
- provider failure does not affect Crypto Execution V2;
- no API key/secret reaches the frontend;
- UI displays the provider's real freshness status;
- for `us-equity-realtime`, the selected feed is explicitly `sip` and no implicit IEX / delayed-SIP fallback occurs;
- redistribution remains disabled until redistribution rights are separately reviewed.

P1.8 satisfies **provider selection + activation-policy definition only**. It does not authorize purchasing a plan, adding credentials, external redistribution, enabling US equity execution, or releasing to Production.
