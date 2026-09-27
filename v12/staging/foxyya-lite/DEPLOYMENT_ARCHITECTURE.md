# FOXYYA Lite Deployment Architecture

## Goal

Keep the browser simple and public while keeping the existing FOXYYA runtime private/read-only. The browser must never know a Railway, Mac mini, tunnel, or private runtime hostname.

## Required shape

```text
Mobile / Browser
      |
      | HTTPS same origin
      v
FOXYYA Lite Edge Host
      |
      +-- static files
      |
      +-- /api/runtime/snapshot ----+
      |                              |
      +-- /api/backtest/latest -----+--> Edge Gateway / Reverse Proxy
                                             |
                                             | GET only
                                             v
                                      FOXYYA Runtime
                                      (existing service.py)

Market Data:
Browser -> Binance USD-M public API
```

## Why same-origin

- No CORS dependency between the mobile browser and the runtime service.
- Runtime origin is not exposed in the browser bundle.
- Authentication can be enforced at the gateway later without changing the UI contracts.
- Mac mini, Railway, Cloudflare Tunnel, or another runtime host can be swapped without changing page code.
- The gateway can reject all write methods before requests ever reach the runtime.

## Gateway contract

The edge/gateway may forward only these V1 paths:

```text
GET /api/runtime/snapshot
GET /api/backtest/latest
```

Optional future read-only routes:

```text
GET /api/runtime/events
GET /api/backtest/report?run_id=...
GET /api/intel/news
GET /api/intel/calendar
```

V1 must reject or not define:

```text
POST
PUT
PATCH
DELETE
/api/order/*
/api/execution/*
/api/trade/*
```

## Runtime origin configuration

The upstream runtime URL belongs only in host/server configuration, for example:

```text
FOXYYA_RUNTIME_ORIGIN=https://private-runtime.example
```

It must never be placed in:

- `index.html`
- browser JavaScript
- localStorage
- query strings
- page-visible config
- committed credentials

## Hosting portability

The same browser application can run on:

### Cloudflare

```text
Pages / Worker static assets
Worker routes /api/* -> runtime origin
```

### Vercel

```text
Static app
Serverless / Edge rewrite /api/* -> runtime origin
```

### Mac mini only

```text
Local static server
Reverse proxy /api/* -> localhost runtime
Private network / tunnel for remote mobile access
```

The browser contract remains the same in all three cases.

## Failure policy

```text
Gateway/runtime available -> LIVE
Gateway returns 404 -> EMPTY
Gateway/runtime timeout or 5xx -> affected slice ERROR
Market service remains independent
Other pages continue rendering
```

## Security invariants

- Gateway is GET-only for FOXYYA Lite V1.
- No exchange private API keys in the Lite browser or gateway responses.
- `PAPER ONLY` remains true.
- `REAL ORDER LOCKED` remains true.
- Production Execution V2 is not changed to support Lite.
- Backtest stays separate from Forward Paper.

## Architecture freeze criterion

Architecture can move to UI refinement after all of the following are true:

1. Module/route/state tests remain green.
2. Runtime Bridge canonicalization tests remain green.
3. Same-origin architecture guard remains green.
4. One Preview deployment proves the static shell and same-origin gateway can coexist.
5. A gateway/runtime outage affects only dependent slices and does not blank the application.
