from __future__ import annotations

import json
import time
from typing import Any, Protocol
from urllib.parse import urlparse
from urllib.request import Request, urlopen


class ProviderError(RuntimeError):
    pass


class BytesTransport(Protocol):
    def get_bytes(self, url: str) -> bytes:
        ...


class JsonTransport(Protocol):
    def get_json(self, url: str) -> Any:
        ...


class UrllibJsonTransport:
    def __init__(
        self,
        *,
        timeout_seconds: float = 20.0,
        attempts: int = 2,
        retry_backoff_seconds: float = 1.0,
    ) -> None:
        if attempts < 1:
            raise ValueError("attempts must be >= 1")
        self.timeout_seconds = timeout_seconds
        self.attempts = attempts
        self.retry_backoff_seconds = retry_backoff_seconds

    @staticmethod
    def _headers(url: str) -> dict[str, str]:
        host = urlparse(url).hostname or ""
        referer = (
            "https://www.tpex.org.tw/"
            if host.endswith("tpex.org.tw")
            else "https://www.twse.com.tw/"
        )
        return {
            "Accept": "application/json,text/plain,*/*",
            "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "Chrome/128.0 Safari/537.36 FOXYYA-TW-Research/1.0"
            ),
            "Referer": referer,
            "Connection": "close",
        }

    def get_bytes(self, url: str) -> bytes:
        last_error: Exception | None = None
        for attempt in range(1, self.attempts + 1):
            request = Request(url, headers=self._headers(url))
            try:
                with urlopen(request, timeout=self.timeout_seconds) as response:
                    return response.read()
            except Exception as exc:  # network boundary
                last_error = exc
                if attempt < self.attempts:
                    time.sleep(self.retry_backoff_seconds * attempt)

        raise ProviderError(
            f"provider request failed after {self.attempts} attempt(s): {url}"
        ) from last_error

    def get_json(self, url: str) -> Any:
        last_error: Exception | None = None
        for attempt in range(1, self.attempts + 1):
            payload = self.get_bytes(url)
            try:
                return json.loads(payload.decode("utf-8-sig"))
            except Exception as exc:
                last_error = exc
                if attempt < self.attempts:
                    time.sleep(self.retry_backoff_seconds * attempt)

        raise ProviderError(
            f"provider returned invalid JSON after "
            f"{self.attempts} attempt(s): {url}"
        ) from last_error
