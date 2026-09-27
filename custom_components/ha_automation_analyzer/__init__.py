"""Automation Analyzer: an on-demand, redacted trace summary for HA."""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType
import homeassistant.helpers.config_validation as cv

from . import frontend, websocket_api
from .const import CONF_SHOW_PANEL, DEFAULT_SHOW_PANEL, DOMAIN

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
DATA_WS = f"{DOMAIN}_ws_registered"


@dataclass(slots=True)
class RuntimeData:
    panel_registered: bool = False
    card_registration: str | None = None


type AutomationAnalyzerConfigEntry = ConfigEntry[RuntimeData]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    return True


async def async_setup_entry(hass: HomeAssistant, entry: AutomationAnalyzerConfigEntry) -> bool:
    runtime = RuntimeData()
    entry.runtime_data = runtime
    if not hass.data.get(DATA_WS):
        websocket_api.async_register(hass)
        hass.data[DATA_WS] = True
    await frontend.async_register_static(hass)
    runtime.card_registration = await frontend.async_register_card(hass)
    if entry.options.get(CONF_SHOW_PANEL, DEFAULT_SHOW_PANEL):
        runtime.panel_registered = await frontend.async_register_panel(hass)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


async def _async_options_updated(hass: HomeAssistant, entry: AutomationAnalyzerConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: AutomationAnalyzerConfigEntry) -> bool:
    if entry.runtime_data.panel_registered:
        frontend.async_unregister_panel(hass)
        entry.runtime_data.panel_registered = False
    return True


async def async_remove_entry(hass: HomeAssistant, entry: AutomationAnalyzerConfigEntry) -> None:
    await frontend.async_unregister_card(hass)
