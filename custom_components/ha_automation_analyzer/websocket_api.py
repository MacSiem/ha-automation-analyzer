"""Administrator-only WebSocket command for a minimized trace summary."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.trace.util import async_list_traces
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .summary import summarize_traces


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_summary)


def _summary_session_current(connection: websocket_api.ActiveConnection, msg: dict[str, Any],
                             initial_user: Any, initial_id: str) -> bool:
    """Fail closed if a summary read outlived its requesting admin context."""
    try:
        user = connection.user
        return bool(
            user is initial_user
            and isinstance(initial_id, str) and bool(initial_id)
            and user.id == initial_id
            and user.is_admin is True
            and user.is_active is True
            and not getattr(user, "system_generated", False)
            and connection.context(msg).user_id == initial_id
        )
    except (AttributeError, TypeError, ValueError):
        return False


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/summary"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_summary(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return a minimized trace summary only to the original current admin."""
    initial_user = getattr(connection, "user", None)
    initial_id = getattr(initial_user, "id", None)
    if not _summary_session_current(connection, msg, initial_user, initial_id):
        connection.send_error(msg["id"], "unauthorized", "Administrator required")
        return
    try:
        traces = await async_list_traces(hass, "automation", None)
        summary = summarize_traces(traces, datetime.now(timezone.utc), hass.config.time_zone)
    except Exception:
        # Never relay trace content or backend exception details to the browser.
        if not _summary_session_current(connection, msg, initial_user, initial_id):
            connection.send_error(msg["id"], "unauthorized", "Administrator required")
        else:
            connection.send_error(msg["id"], "summary_unavailable", "Trace summary unavailable")
        return
    if not _summary_session_current(connection, msg, initial_user, initial_id):
        connection.send_error(msg["id"], "unauthorized", "Administrator required")
        return
    connection.send_result(msg["id"], summary)
