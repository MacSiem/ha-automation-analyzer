"""Single-instance setup and optional sidebar panel setting."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback

from .const import CONF_SHOW_PANEL, DEFAULT_SHOW_PANEL, DOMAIN, NAME


class AutomationAnalyzerConfigFlow(ConfigFlow, domain=DOMAIN):
    """Zero-input setup."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title=NAME, data={})

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return AutomationAnalyzerOptionsFlow()


class AutomationAnalyzerOptionsFlow(OptionsFlow):
    """Allow the sidebar panel to be hidden without removing the card."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Required(CONF_SHOW_PANEL, default=self.config_entry.options.get(CONF_SHOW_PANEL, DEFAULT_SHOW_PANEL)): bool,
            }),
        )
