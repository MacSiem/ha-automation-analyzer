"""Authorization regression for the existing Automation Analyzer WS summary path.

Synthetic traces only. Import the real target source under HA API stubs,
not a duplicate implementation of the handler.
"""
from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path
import sys
import types
import unittest

ROOT = Path(__file__).resolve().parents[1]
COMP = ROOT / "custom_components" / "ha_automation_analyzer"


def _stub(name):
    module = types.ModuleType(name)
    module.__path__ = []
    sys.modules[name] = module
    return module


for package in ("homeassistant", "homeassistant.components", "homeassistant.components.trace"):
    _stub(package)
ws_api = _stub("homeassistant.components.websocket_api")
ws_api.ActiveConnection = type("ActiveConnection", (), {})
ws_api.websocket_command = lambda schema: lambda func: func
ws_api.require_admin = lambda func: func
ws_api.async_response = lambda func: func
trace_util = _stub("homeassistant.components.trace.util")
trace_util.async_list_traces = None
core = _stub("homeassistant.core")
core.HomeAssistant = type("HomeAssistant", (), {})
core.callback = lambda func: func
vol = _stub("voluptuous")
vol.Required = lambda value: value

package = _stub("ha_automation_analyzer")
package.__path__ = [str(COMP)]
const = _stub("ha_automation_analyzer.const")
const.DOMAIN = "ha_automation_analyzer"
for short in ("summary", "websocket_api"):
    spec = importlib.util.spec_from_file_location(
        f"ha_automation_analyzer.{short}", COMP / f"{short}.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)

target = sys.modules["ha_automation_analyzer.websocket_api"]


class User:
    def __init__(self, user_id="admin-1", is_admin=True, is_active=True, system_generated=False):
        self.id = user_id
        self.is_admin = is_admin
        self.is_active = is_active
        self.system_generated = system_generated


class Connection:
    def __init__(self, user):
        self.user = user
        self.context_user_id = user.id
        self.results = []
        self.errors = []

    def context(self, msg):
        return types.SimpleNamespace(user_id=self.context_user_id)

    def send_result(self, request_id, result):
        self.results.append((request_id, result))

    def send_error(self, request_id, code, message):
        self.errors.append((request_id, code, message))


class SummaryAuthTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.user = User()
        self.connection = Connection(self.user)
        self.hass = types.SimpleNamespace(config=types.SimpleNamespace(time_zone="Europe/Warsaw"))
        self.message = {"id": 27, "type": "ha_automation_analyzer/summary"}
        self.ready = asyncio.Event()
        self.release = asyncio.Event()

        async def delayed(_hass, domain, item_id):
            assert domain == "automation" and item_id is None
            self.ready.set()
            await self.release.wait()
            return [{
                "domain": "automation", "item_id": "safe-id",
                "run_id": "PRIVATE-RUN-NOT-IN-OUTPUT",
                "timestamp": {"start": "2026-10-29T09:00:00+01:00",
                              "finish": "2026-10-29T09:00:01+01:00"},
                "script_execution": "finished",
            }]
        target.async_list_traces = delayed

    async def execute(self, mutate=None):
        job = asyncio.create_task(target.ws_summary(self.hass, self.connection, self.message))
        await asyncio.wait_for(self.ready.wait(), timeout=1)
        if mutate:
            mutate()
        self.release.set()
        await asyncio.wait_for(job, timeout=1)

    async def execute_immediate(self):
        job = asyncio.create_task(target.ws_summary(self.hass, self.connection, self.message))
        await asyncio.sleep(0.01)
        self.release.set()
        await asyncio.wait_for(job, timeout=1)

    def assert_denied(self):
        self.assertFalse(self.connection.results, "private summary was sent")
        self.assertEqual(len(self.connection.errors), 1)
        self.assertEqual(self.connection.errors[0][1], "unauthorized")

    async def test_stable_admin_receives_only_minimized_summary(self):
        await self.execute()
        self.assertEqual(self.connection.errors, [])
        self.assertEqual(len(self.connection.results), 1)
        self.assertEqual(self.connection.results[0][1]["schema"], "aa-trace-summary-v1")
        self.assertNotIn("PRIVATE-RUN", repr(self.connection.results))

    async def test_admin_role_revoked_while_source_is_awaited(self):
        await self.execute(lambda: setattr(self.user, "is_admin", False))
        self.assert_denied()

    async def test_admin_account_deactivated_while_source_is_awaited(self):
        await self.execute(lambda: setattr(self.user, "is_active", False))
        self.assert_denied()

    async def test_connection_user_replaced_same_id_while_source_is_awaited(self):
        await self.execute(lambda: setattr(self.connection, "user", User()))
        self.assert_denied()

    async def test_connection_user_id_mutated_while_source_is_awaited(self):
        await self.execute(lambda: setattr(self.user, "id", "other-user"))
        self.assert_denied()

    async def test_request_context_user_changed_while_source_is_awaited(self):
        await self.execute(lambda: setattr(self.connection, "context_user_id", "other-user"))
        self.assert_denied()

    async def test_deactivated_admin_denied_before_fetch(self):
        self.user.is_active = False
        await self.execute_immediate()
        self.assert_denied()
        self.assertFalse(self.ready.is_set(), "unauthorized source read started")

    async def test_system_generated_admin_denied_before_fetch(self):
        self.user.system_generated = True
        await self.execute_immediate()
        self.assert_denied()
        self.assertFalse(self.ready.is_set())

    async def test_mismatched_request_context_denied_before_fetch(self):
        self.connection.context_user_id = "different"
        await self.execute_immediate()
        self.assert_denied()
        self.assertFalse(self.ready.is_set())

    async def test_non_admin_denied_before_fetch(self):
        self.user.is_admin = False
        await self.execute_immediate()
        self.assert_denied()
        self.assertFalse(self.ready.is_set())

    async def test_unexpected_source_exception_is_safe_and_never_echoes_private_message(self):
        async def fail(*_args):
            raise RuntimeError("SECRET TRACE FROM PRIVATE HOME")
        target.async_list_traces = fail
        await target.ws_summary(self.hass, self.connection, self.message)
        self.assertEqual(self.connection.results, [])
        self.assertEqual(len(self.connection.errors), 1)
        self.assertEqual(self.connection.errors[0][1], "summary_unavailable")
        self.assertNotIn("SECRET", repr(self.connection.errors))


if __name__ == "__main__":
    unittest.main()
