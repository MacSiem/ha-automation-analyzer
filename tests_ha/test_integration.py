"""Automation Analyzer integration inside Home Assistant Core."""

from __future__ import annotations

from homeassistant.components import frontend
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.ha_automation_analyzer.const import CARD_URL, DOMAIN, PANEL_URL_PATH, VERSION


async def _setup(hass: HomeAssistant) -> MockConfigEntry:
    assert await async_setup_component(hass, "http", {})
    assert await async_setup_component(hass, "lovelace", {})
    entry = MockConfigEntry(domain=DOMAIN, data={}, unique_id=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_setup_registers_card_resource_and_admin_panel(hass: HomeAssistant) -> None:
    await _setup(hass)
    urls = [item["url"] for item in hass.data["lovelace"].resources.async_items()]
    assert urls == [f"{CARD_URL}?v={VERSION}"]
    panel = hass.data[frontend.DATA_PANELS][PANEL_URL_PATH]
    assert panel.require_admin is True
    assert panel.config["_panel_custom"]["name"] == "ha-automation-analyzer-panel"


async def test_existing_hacs_card_resource_is_not_duplicated(hass: HomeAssistant) -> None:
    assert await async_setup_component(hass, "lovelace", {})
    resources = hass.data["lovelace"].resources
    await resources.async_load()
    await resources.async_create_item({"res_type": "module", "url": "/hacsfiles/ha-automation-analyzer/ha-automation-analyzer.js"})
    await _setup(hass)
    assert len(list(resources.async_items())) == 1


async def test_summary_is_admin_only(hass: HomeAssistant, hass_ws_client, hass_read_only_access_token) -> None:
    await _setup(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json({"id": 1, "type": f"{DOMAIN}/summary"})
    response = await client.receive_json()
    assert response["success"] is False
    assert response["error"]["code"] == "unauthorized"


async def test_summary_returns_only_measured_aggregates(hass: HomeAssistant, hass_ws_client, monkeypatch) -> None:
    await _setup(hass)

    async def trace_list(_hass, domain, item_id):
        assert domain == "automation" and item_id is None
        return [{"domain": "automation", "item_id": "test", "run_id": "PRIVATE-RUN", "trigger": "PRIVATE-TRIGGER", "script_execution": "error", "timestamp": {"start": "2026-09-27T08:00:00+02:00", "finish": "2026-09-27T08:00:01+02:00"}}]

    monkeypatch.setattr("custom_components.ha_automation_analyzer.websocket_api.async_list_traces", trace_list)
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": f"{DOMAIN}/summary"})
    response = await client.receive_json()
    assert response["success"] is True
    result = response["result"]
    assert result["schema"] == "aa-trace-summary-v1"
    assert result["by_automation"]["test"]["error_count"] == 1
    assert result["durations_ms"] == [1000]
    assert "PRIVATE" not in repr(result)
