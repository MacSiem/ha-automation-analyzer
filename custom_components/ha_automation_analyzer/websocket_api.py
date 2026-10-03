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


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/summary"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_summary(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Summarize retained traces only when an admin requests them."""
    try:
        traces = await async_list_traces(hass, "automation", None)
        summary = summarize_traces(traces, datetime.now(timezone.utc), hass.config.time_zone)
    except (KeyError, ValueError, TypeError) as error:
        connection.send_error(msg["id"], "summary_unavailable", type(error).__name__)
        return
    connection.send_result(msg["id"], summary)
