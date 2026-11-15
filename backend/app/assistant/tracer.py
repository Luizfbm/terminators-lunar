"""The number tracer: every number written in an answer must be one the answer was given.

The pool is everything the tools returned for this answer, the Query and the user's own
messages. Each number in the answer is traced when some number in the pool rounds to it
at the precision the answer shows. The rules, in the order the text is read:

- A date is one number. ISO dates (2026-11-20, with or without a time), a day and a month
  name in English or Portuguese ("20 November 2026", "November 20", "20 de novembro de
  2026", "20 nov") and numeric dates (20/11/2026, 20/11; day first or month first, either
  reading may match) are traced when an instant in the pool falls on that UTC day; the
  year is checked only when it is written.
- A time of day is one number: 16:21, 16:21:04, or the Portuguese 16h21. It is traced when
  an instant in the pool shows that time, cut or rounded to the minute (or exact, when the
  seconds are written). An ISO date with a time must match both on the same instant; a
  date and a time written apart count as two numbers.
- A percentage (29%, 29 %, 29 percent, 29 por cento) is traced by a pool number equal to it
  or by a fraction equal to it once multiplied by 100: 29% matches a Sun fraction of 0.2918.
- Decimal and thousands separators follow either language: 13.6 and 13,6 are both 13.6;
  3,208.97 and 3.208,97 are both 3208.97; a no-break or thin space may group thousands.
  A form that reads two ways (1,234 or 1.234) is traced when either reading is.
- A number may be written to fewer decimals than the pool holds: "310 h" is traced by
  310.4 and "13.6" by 13.64. Never the other way, and nothing is converted: hours are not
  traced by days, nor kilometres by metres; the tools give both where people use both.
- The sign is ignored, so "89.5°S" is traced by a latitude of -89.5.
- Digits glued to letters are part of a name, not a number: CR01, IM-2, DSS-14, P90.
- Numbers spelled out in words are not read.
"""

from __future__ import annotations

import math
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

MONTHS = {
    "en": [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ],
    "pt": [
        "janeiro",
        "fevereiro",
        "março",
        "abril",
        "maio",
        "junho",
        "julho",
        "agosto",
        "setembro",
        "outubro",
        "novembro",
        "dezembro",
    ],
}
_ABBREVIATIONS = [
    ("jan",),
    ("feb", "fev"),
    ("mar",),
    ("apr", "abr"),
    ("may", "mai"),
    ("jun",),
    ("jul",),
    ("aug", "ago"),
    ("sep", "sept", "set"),
    ("oct", "out"),
    ("nov",),
    ("dec", "dez"),
]
_MONTH_INDEX: dict[str, int] = {}
for _number, _short in enumerate(_ABBREVIATIONS, start=1):
    for _name in (MONTHS["en"][_number - 1], MONTHS["pt"][_number - 1], *_short):
        _MONTH_INDEX[_name.casefold()] = _number
# Short forms that are also everyday words ("11 out of 12", "it may set") count as a
# month only with a full stop or a year after them. English months are capitalised, so
# "may" is a verb and "May" a month.
_WORDLIKE = {"out", "set", "mar", "mai", "may"}


def _alternation(names: Iterable[str]) -> str:
    return "|".join(sorted({re.escape(name) for name in names}, key=len, reverse=True))


_SAFE = _alternation(
    [form for name in _MONTH_INDEX if name not in _WORDLIKE for form in (name, name.title())]
    + ["May"]
)
_DOTTED = _alternation(form for name in _WORDLIKE for form in (name, name.title()))
_YEAR = r"(?:,?\s+(?:de\s+)?(\d{4})(?!\d))"
# Two groups: the month as an ordinary name, or as a word-like short form.
_MONTH = rf"(?:({_SAFE})\b\.?|({_DOTTED})(?:\.|(?=,?\s+(?:de\s+)?\d{{4}})))"
_ORDINAL = r"(?:st|nd|rd|th|º)?"

# Highest priority first; a match never overlaps one taken before it.
_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "iso",
        re.compile(
            r"(?<![\w.])(\d{4})-(\d{2})-(\d{2})"
            r"(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?Z?)?(?!\d)"
        ),
    ),
    # Groups: day, month, short month, year.
    ("day_month", re.compile(rf"(?<![\w.,])(\d{{1,2}}){_ORDINAL}\s+(?:de\s+)?{_MONTH}{_YEAR}?")),
    # Groups: month, day, year. Only English puts the month first, and English has no
    # word-like short forms, so "the Sun set. 5 hours later" is not 5 September.
    ("month_day", re.compile(rf"\b({_SAFE})\b\.?\s+(\d{{1,2}}){_ORDINAL}(?![\d:]){_YEAR}?")),
    ("numeric_date", re.compile(r"(?<![\w.,/])(\d{1,2})/(\d{1,2})(?:/(\d{4}|\d{2}))?(?![\d/])")),
    ("time", re.compile(r"(?<![\w:.,])(\d{1,2})(?::|h)(\d{2})(?::(\d{2}))?(?![\d:])")),
    ("name", re.compile(r"[^\W\d_]+[-‑]?\d+\w*")),
    (
        "number",
        re.compile(
            r"(?<![\w.,])([-−]?)(\d[\d.,  ]*\d|\d)"
            r"(\s?%|\s(?:percent|per cent|por cento)\b)?",
            re.IGNORECASE,
        ),
    ),
]


@dataclass
class Pool:
    """What an answer may quote: numbers, UTC days and instants."""

    numbers: list[float] = field(default_factory=list)
    days: set[tuple[int, int, int]] = field(default_factory=set)
    instants: list[datetime] = field(default_factory=list)

    def add_value(self, value: Any) -> None:
        """Walk a tool result (or any JSON value) and keep everything quotable in it."""
        if isinstance(value, bool) or value is None:
            return
        if isinstance(value, int | float):
            if math.isfinite(value):
                self.numbers.append(float(value))
        elif isinstance(value, str):
            self.add_text(value)
        elif isinstance(value, dict):
            for item in value.values():
                self.add_value(item)
        elif isinstance(value, list | tuple):
            for item in value:
                self.add_value(item)

    def add_instant(self, instant: datetime) -> None:
        self.instants.append(instant)
        self.days.add((instant.year, instant.month, instant.day))
        self.numbers.append(float(instant.year))

    def add_text(self, text: str) -> None:
        instant = _iso_instant(text)
        if instant is not None:
            self.add_instant(instant)
            return
        for token in extract(text):
            if token.kind == "number":
                self.numbers.extend(value for value, _ in token.values)
            for day in token.days:
                year, month, number = day
                if year is not None:
                    self.days.add((year, month, number))
                    self.numbers.append(float(year))


@dataclass
class Token:
    text: str
    kind: str  # number, percent, date, time, datetime
    values: list[tuple[float, int]] = field(default_factory=list)  # (value, decimals shown)
    days: list[tuple[int | None, int, int]] = field(default_factory=list)  # (year, month, day)
    clock: tuple[int, int, int | None] | None = None  # (hour, minute, second)


@dataclass
class Trace:
    total: int
    traced: int
    untraced: list[str]

    def as_dict(self) -> dict[str, Any]:
        return {"total": self.total, "traced": self.traced, "untraced": self.untraced}


def _iso_instant(text: str) -> datetime | None:
    if len(text) < 16 or text[4] != "-" or "T" not in text:
        return None
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _numeric(raw: str) -> list[tuple[float, int]]:
    """Every reading of a written number as (value, decimals shown)."""
    text = raw.replace(" ", "").replace(" ", "")
    dot, comma = "." in text, "," in text
    if dot and comma:
        decimal = "." if text.rfind(".") > text.rfind(",") else ","
        group = "," if decimal == "." else "."
        whole, _, fraction = text.rpartition(decimal)
        if not re.fullmatch(rf"\d{{1,3}}(?:{re.escape(group)}\d{{3}})*", whole):
            return []
        return [(float(whole.replace(group, "") + "." + fraction), len(fraction))]
    if dot or comma:
        separator = "." if dot else ","
        parts = text.split(separator)
        if len(parts) > 2:
            if 1 <= len(parts[0]) <= 3 and all(len(part) == 3 for part in parts[1:]):
                return [(float("".join(parts)), 0)]
            return []
        whole, fraction = parts
        readings = [(float(f"{whole}.{fraction}"), len(fraction))]
        if len(fraction) == 3 and len(whole) <= 3 and whole != "0":
            readings.append((float(whole + fraction), 0))
        return readings
    return [(float(text), 0)]


def _year(raw: str | None) -> int | None:
    if raw is None:
        return None
    year = int(raw)
    return year + 2000 if len(raw) == 2 else year


def _token(kind: str, match: re.Match[str]) -> Token | None:
    text = match.group(0).strip()
    if kind == "name":
        return None
    if kind == "number":
        values = _numeric(match.group(2))
        return Token(text, "percent" if match.group(3) else "number", values=values)
    if kind == "iso":
        year, month, day = (int(match.group(i)) for i in (1, 2, 3))
        if match.group(4) is None:
            return Token(text, "date", days=[(year, month, day)])
        second = int(match.group(6)) if match.group(6) else None
        clock = (int(match.group(4)), int(match.group(5)), second)
        return Token(text, "datetime", days=[(year, month, day)], clock=clock)
    if kind == "day_month":
        month = _MONTH_INDEX[(match.group(2) or match.group(3)).casefold()]
        return Token(text, "date", days=[(_year(match.group(4)), month, int(match.group(1)))])
    if kind == "month_day":
        month = _MONTH_INDEX[match.group(1).casefold()]
        return Token(text, "date", days=[(_year(match.group(3)), month, int(match.group(2)))])
    if kind == "numeric_date":
        first, second, written = int(match.group(1)), int(match.group(2)), _year(match.group(3))
        readings = [(written, month, day) for day, month in ((first, second), (second, first))]
        return Token(text, "date", days=[r for r in readings if 1 <= r[1] <= 12])
    if kind == "time":
        hour, minute = int(match.group(1)), int(match.group(2))
        if hour > 23 or minute > 59:
            return Token(text, "number", values=_numeric(match.group(1)))
        second = int(match.group(3)) if match.group(3) else None
        return Token(text, "time", clock=(hour, minute, second))
    raise ValueError(kind)


def extract(text: str) -> list[Token]:
    """The numbers written in `text`, in reading order."""
    found: list[tuple[int, int, str, re.Match[str]]] = []
    taken: list[tuple[int, int]] = []
    for kind, pattern in _PATTERNS:
        for match in pattern.finditer(text):
            start, end = match.span()
            if any(start < b and a < end for a, b in taken):
                continue
            taken.append((start, end))
            found.append((start, end, kind, match))
    tokens: list[Token] = []
    for _, _, kind, match in sorted(found, key=lambda item: item[0]):
        token = _token(kind, match)
        if token is not None:
            tokens.append(token)
    return tokens


def _close(written: float, decimals: int, value: float) -> bool:
    half = 0.5 * 10.0**-decimals
    return abs(abs(value) - abs(written)) <= half + 1e-9 * max(1.0, abs(written))


def _clock_matches(clock: tuple[int, int, int | None], instant: datetime) -> bool:
    hour, minute, second = clock
    if second is not None:
        return (instant.hour, instant.minute, instant.second) == (hour, minute, second)
    cut = (instant.hour, instant.minute)
    rounded = instant.replace(second=0, microsecond=0)
    if instant.second >= 30:
        rounded = datetime.fromtimestamp(rounded.timestamp() + 60, tz=instant.tzinfo)
    return (hour, minute) in (cut, (rounded.hour, rounded.minute))


def _day_matches(day: tuple[int | None, int, int], days: Iterable[tuple[int, int, int]]) -> bool:
    year, month, number = day
    return any(m == month and d == number and (year is None or y == year) for y, m, d in days)


def traced(token: Token, pool: Pool) -> bool:
    if token.kind == "number":
        return any(_close(x, d, v) for x, d in token.values for v in pool.numbers)
    if token.kind == "percent":
        return any(
            _close(x, d, v) or _close(x, d, v * 100.0)
            for x, d in token.values
            for v in pool.numbers
        )
    if token.kind == "date":
        return any(_day_matches(day, pool.days) for day in token.days)
    if token.kind == "time":
        assert token.clock is not None
        return any(_clock_matches(token.clock, instant) for instant in pool.instants)
    if token.kind == "datetime":
        assert token.clock is not None
        clock = token.clock
        return any(
            _day_matches(day, [(i.year, i.month, i.day)]) and _clock_matches(clock, i)
            for day in token.days
            for i in pool.instants
        )
    raise ValueError(token.kind)


def trace(answer: str, pool: Pool) -> Trace:
    tokens = extract(answer)
    missing = [token.text for token in tokens if not traced(token, pool)]
    return Trace(total=len(tokens), traced=len(tokens) - len(missing), untraced=missing)
