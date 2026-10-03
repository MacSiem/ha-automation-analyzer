"""Bounded, privacy-minimized summaries of retained Home Assistant traces."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

MAX_RUNS = 5000
MAX_DURATION_MS = 300_000


def _timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("invalid_trace_timestamp") from error
    else:
        raise ValueError("invalid_trace_timestamp")
    if parsed.tzinfo is None:
        raise ValueError("invalid_trace_timestamp")
    return parsed


def summarize_traces(rows: list[dict[str, Any]], now: datetime, time_zone: str) -> dict[str, Any]:
    """Return only counts/durations needed by the card, never raw trace fields."""
    if not isinstance(rows, list) or len(rows) > MAX_RUNS or now.tzinfo is None:
        raise ValueError("trace_summary_limit_or_time")
    zone = ZoneInfo(time_zone)
    today = now.astimezone(zone).date()
    days = [(today - timedelta(days=13 - index)).isoformat() for index in range(14)]
    daily = dict.fromkeys(days, 0)
    totals: dict[str, dict[str, Any]] = {}
    durations: list[int] = []
    execution_count = 0

    for row in rows:
        if not isinstance(row, dict) or row.get("domain") != "automation":
            raise ValueError("invalid_trace_identity")
        item_id = row.get("item_id")
        if not isinstance(item_id, str) or not item_id or len(item_id) > 255:
            raise ValueError("invalid_trace_identity")
        timestamp = row.get("timestamp")
        if not isinstance(timestamp, dict):
            raise ValueError("invalid_trace_timestamp")
        start = _timestamp(timestamp.get("start"))
        finish = _timestamp(timestamp["finish"]) if timestamp.get("finish") is not None else None
        if finish is not None and finish < start:
            raise ValueError("invalid_trace_duration")
        if row.get("not_triggered") is True:
            continue
        execution_count += 1
        stats = totals.setdefault(item_id, {"trace_count": 0, "today_count": 0, "error_count": 0, "avg_execution_ms": None, "_durations": []})
        stats["trace_count"] += 1
        local_day = start.astimezone(zone).date().isoformat()
        if local_day == today.isoformat():
            stats["today_count"] += 1
        if local_day in daily:
            daily[local_day] += 1
        if row.get("script_execution") == "error":
            stats["error_count"] += 1
        if finish is not None:
            duration = round((finish - start).total_seconds() * 1000)
            if 0 <= duration < MAX_DURATION_MS:
                stats["_durations"].append(duration)
                durations.append(duration)

    for stats in totals.values():
        values = stats.pop("_durations")
        if values:
            stats["avg_execution_ms"] = round(sum(values) / len(values))

    return {
        "schema": "aa-trace-summary-v1",
        "run_count": len(rows),
        "execution_count": execution_count,
        "by_automation": totals,
        "daily_counts": [{"date": day, "count": count} for day, count in daily.items()],
        "durations_ms": durations,
    }
