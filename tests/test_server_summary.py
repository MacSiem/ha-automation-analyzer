"""The server summary must preserve measured counts without leaking raw traces."""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import importlib.util
from pathlib import Path
import unittest


MODULE = Path(__file__).resolve().parents[1] / "custom_components/ha_automation_analyzer/summary.py"
SPEC = importlib.util.spec_from_file_location("ha_automation_analyzer_summary", MODULE)
assert SPEC and SPEC.loader
summary = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(summary)


class SummaryTests(unittest.TestCase):
    def test_live_core_datetime_timestamps_are_summarized(self) -> None:
        rows = [{
            "domain": "automation", "item_id": "test", "state": "stopped",
            "timestamp": {
                "start": datetime.fromisoformat("2026-09-27T10:00:00+02:00"),
                "finish": datetime.fromisoformat("2026-09-27T10:00:01+02:00"),
            },
        }]
        result = summary.summarize_traces(rows, datetime.fromisoformat("2026-09-27T11:00:00+02:00"), "Europe/Warsaw")
        self.assertEqual(result["execution_count"], 1)
        self.assertEqual(result["durations_ms"], [1000])

    def test_dst_fallback_counts_two_distinct_hours_in_one_local_day_and_redacts(self) -> None:
        rows = [
            {"domain": "automation", "item_id": "test", "run_id": "PRIVATE-RUN-ID", "trigger": "PRIVATE-TRIGGER", "state": "stopped", "script_execution": "finished", "timestamp": {"start": "2026-10-25T02:30:00+02:00", "finish": "2026-10-25T02:30:01+02:00"}},
            {"domain": "automation", "item_id": "test", "run_id": "PRIVATE-RUN-ID-2", "state": "stopped", "script_execution": "error", "timestamp": {"start": "2026-10-25T02:30:00+01:00", "finish": "2026-10-25T02:30:03+01:00"}},
            {"domain": "automation", "item_id": "test", "not_triggered": True, "state": "stopped", "script_execution": "finished", "timestamp": {"start": "2026-10-25T01:00:00+02:00", "finish": None}},
        ]
        result = summary.summarize_traces(rows, datetime.fromisoformat("2026-10-25T12:00:00+01:00"), "Europe/Warsaw")
        self.assertEqual(result["run_count"], 3)
        self.assertEqual(result["execution_count"], 2)
        self.assertEqual(result["by_automation"]["test"], {"trace_count": 2, "today_count": 2, "error_count": 1, "avg_execution_ms": 2000})
        self.assertEqual(result["daily_counts"][-1], {"date": "2026-10-25", "count": 2})
        self.assertEqual(result["durations_ms"], [1000, 3000])
        self.assertNotIn("PRIVATE", repr(result))

    def test_invalid_or_over_limit_input_fails_closed(self) -> None:
        now = datetime.fromisoformat("2026-09-27T08:00:00+02:00")
        with self.assertRaises(ValueError):
            summary.summarize_traces([{"domain": "automation", "item_id": "x", "timestamp": {"start": "bad"}}], now, "Europe/Warsaw")
        with self.assertRaises(ValueError):
            summary.summarize_traces([{}] * (summary.MAX_RUNS + 1), now, "Europe/Warsaw")


    def test_fall_back_fold_records_three_seconds_not_negative_wall_time(self) -> None:
        zone = ZoneInfo("Europe/Warsaw")
        start = datetime(2026, 10, 25, 2, 59, 58, tzinfo=zone, fold=0)
        finish = datetime(2026, 10, 25, 2, 0, 1, tzinfo=zone, fold=1)
        # Independent oracle: 00:59:58 UTC -> 01:00:01 UTC = 3000 ms.
        self.assertEqual((finish.astimezone(timezone.utc) -
                          start.astimezone(timezone.utc)).total_seconds(), 3)
        result = summary.summarize_traces([
            {"domain": "automation", "item_id": "dst", "script_execution": "finished",
             "timestamp": {"start": start, "finish": finish}}],
            datetime(2026, 10, 25, 12, tzinfo=zone), "Europe/Warsaw")
        self.assertEqual(result["execution_count"], 1)
        self.assertEqual(result["durations_ms"], [3000])
        self.assertEqual(result["by_automation"]["dst"]["avg_execution_ms"], 3000)
        self.assertEqual(result["daily_counts"][-1]["count"], 1)

    def test_spring_forward_fold_gives_real_three_second_duration(self) -> None:
        zone = ZoneInfo("Europe/Warsaw")
        start = datetime(2026, 3, 29, 1, 59, 59, tzinfo=zone)
        finish = datetime(2026, 3, 29, 3, 0, 2, tzinfo=zone)
        self.assertEqual((finish.astimezone(timezone.utc) -
                          start.astimezone(timezone.utc)).total_seconds(), 3)
        result = summary.summarize_traces([
            {"domain": "automation", "item_id": "spring",
             "timestamp": {"start": start, "finish": finish}}],
            datetime(2026, 3, 29, 12, tzinfo=zone), "Europe/Warsaw")
        self.assertEqual(result["durations_ms"], [3000])

    def test_fall_back_wall_forward_but_utc_backward_is_invalid(self) -> None:
        zone = ZoneInfo("Europe/Warsaw")
        start = datetime(2026, 10, 25, 2, 0, 1, tzinfo=zone, fold=1)
        finish = datetime(2026, 10, 25, 2, 59, 58, tzinfo=zone, fold=0)
        self.assertLess((finish.astimezone(timezone.utc) -
                         start.astimezone(timezone.utc)).total_seconds(), 0)
        with self.assertRaisesRegex(ValueError, "invalid_trace_duration"):
            summary.summarize_traces([
                {"domain": "automation", "item_id": "reverse",
                 "timestamp": {"start": start, "finish": finish}}],
                datetime(2026, 10, 25, 12, tzinfo=zone), "Europe/Warsaw")


    def test_running_trace_does_not_invent_zero_duration(self) -> None:
        zone = ZoneInfo("Europe/Warsaw")
        result = summary.summarize_traces([
            {"domain": "automation", "item_id": "running", "script_execution": "running",
             "timestamp": {"start": datetime(2026, 10, 29, 10, 0, tzinfo=zone),
                           "finish": None}}],
            datetime(2026, 10, 29, 11, tzinfo=zone), "Europe/Warsaw")
        self.assertEqual(result["execution_count"], 1)
        self.assertEqual(result["durations_ms"], [])
        self.assertIsNone(result["by_automation"]["running"]["avg_execution_ms"])

if __name__ == "__main__":
    unittest.main()
