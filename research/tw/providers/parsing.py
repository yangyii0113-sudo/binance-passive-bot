from __future__ import annotations

from decimal import Decimal, InvalidOperation


EMPTY_TOKENS = {
    "",
    "-",
    "--",
    "---",
    "－",
    "—",
    "N/A",
    "NA",
    "null",
    "None",
}


def clean_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).replace("\u3000", " ").strip()


def parse_roc_date(value: object) -> str | None:
    text = clean_text(value).replace("/", "").replace("-", "")
    if not text or text in EMPTY_TOKENS:
        return None
    if not text.isdigit() or len(text) not in {7, 8}:
        return None

    if len(text) == 8 and int(text[:4]) >= 1911:
        year = int(text[:4])
        month = int(text[4:6])
        day = int(text[6:8])
    else:
        year = int(text[:-4]) + 1911
        month = int(text[-4:-2])
        day = int(text[-2:])

    if not (1 <= month <= 12 and 1 <= day <= 31):
        return None
    return f"{year:04d}-{month:02d}-{day:02d}"


def parse_decimal(value: object) -> float | None:
    text = clean_text(value)
    if text in EMPTY_TOKENS:
        return None
    text = text.replace(",", "").replace("%", "")
    try:
        return float(Decimal(text))
    except (InvalidOperation, ValueError):
        return None


def parse_int(value: object) -> int | None:
    number = parse_decimal(value)
    if number is None:
        return None
    if not float(number).is_integer():
        return None
    return int(number)
