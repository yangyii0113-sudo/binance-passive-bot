#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
READ_ONLY_API_PATHS = {
    "/api/strategy",
    "/api/paper",
    "/api/results",
    "/api/backtest",
    "/api/runtime/snapshot",
    "/api/backtest/latest",
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/healthz":
            self._json(
                {
                    "status": "LIVE",
                    "service": "foxyya-lite-staging",
                    "paper_only": True,
                    "real_order_lock": True,
                    "runtime_upstream": "UNCONFIGURED",
                }
            )
            return

        if path in READ_ONLY_API_PATHS:
            self._json(
                {
                    "status": "EMPTY",
                    "reason": "READ_ONLY_UPSTREAM_NOT_CONFIGURED",
                    "paper_only": True,
                    "real_order_lock": True,
                },
                status=404,
            )
            return

        super().do_GET()

    def log_message(self, format: str, *args) -> None:
        return


def main() -> None:
    port = int(os.getenv("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(
        json.dumps(
            {
                "event": "foxyya_lite_staging_started",
                "port": port,
                "paper_only": True,
                "real_order_lock": True,
            }
        ),
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
