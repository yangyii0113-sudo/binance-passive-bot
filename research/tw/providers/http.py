from __future__ import annotations

import json
from typing import Any, Protocol
from urllib.request import Request, urlopen


class ProviderError(RuntimeError):
    pass


class JsonTransport(Protocol):
    def get_json(self, url: str) -> Any:
        ...


class UrllibJsonTransport:
    def __init__(self, *, timeout_seconds: float = 20.0) -> None:
        self.timeout_seconds = timeout_seconds

    def get_json(self, url: str) -> Any:
        request = Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "FOXYYA-TW-Research/1.0",
            },
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                payload = response.read()
        except Exception as exc:  # network boundary
            raise ProviderError(f"provider request failed: {url}") from exc

        try:
            return json.loads(payload.decode("utf-8-sig"))
        except Exception as exc:
            raise ProviderError(f"provider returned invalid JSON: {url}") from exc
