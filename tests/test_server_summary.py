"""The server summary must preserve measured counts without leaking raw traces."""

from __future__ import annotations

from datetime import datetime
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


if __name__ == "__main__":
    unittest.main()
