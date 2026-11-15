"""UTC instants as ISO 8601 strings with a Z suffix."""

from datetime import UTC, datetime, timedelta


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def iso_z(value: datetime) -> str:
    instant = as_utc(value)
    scale = "microseconds" if instant.microsecond else "seconds"
    return instant.isoformat(timespec=scale).replace("+00:00", "Z")


def round_second(value: datetime) -> datetime:
    instant = as_utc(value).replace(microsecond=0)
    if value.microsecond >= 500_000:
        return instant + timedelta(seconds=1)
    return instant
