"""Serve the bundled card and register it with Lovelace and the sidebar."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import (
    CARD_ELEMENT,
    CARD_FILENAME,
    CARD_URL,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
    STATIC_URL_BASE,
    VERSION,
)

_LOGGER = logging.getLogger(__name__)

DATA_STATIC = "ha_automation_analyzer_static_registered"


def versioned_card_url() -> str:
    """Return the cache-busting URL of the bundled card."""
    return f"{CARD_URL}?v={VERSION}"


async def async_register_static(hass: HomeAssistant) -> None:
    """Serve custom_components/ha_automation_analyzer/www once per HA run."""
    if hass.data.get(DATA_STATIC):
        return
    www = Path(__file__).parent / "www"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL_BASE, str(www), cache_headers=False)]
    )
    hass.data[DATA_STATIC] = True


def _resources(hass: HomeAssistant) -> Any | None:
    lovelace = hass.data.get("lovelace")
    if lovelace is None:
        return None
    return getattr(lovelace, "resources", None) or (
        lovelace.get("resources") if isinstance(lovelace, dict) else None
    )


def _lovelace_mode(hass: HomeAssistant) -> str | None:
    lovelace = hass.data.get("lovelace")
    if lovelace is None:
        return None
    for attr in ("resource_mode", "mode"):
        if (mode := getattr(lovelace, attr, None)) is not None:
            return mode
    return lovelace.get("mode") if isinstance(lovelace, dict) else None


def _is_ours(url: str) -> bool:
    return url.split("?", 1)[0] == CARD_URL


def _is_foreign_copy(url: str) -> bool:
    path = url.split("?", 1)[0]
    return path.rsplit("/", 1)[-1] == CARD_FILENAME and not _is_ours(url)


async def async_register_card(hass: HomeAssistant) -> str:
    """Make the card available to dashboards.

    Storage-mode dashboards get a Lovelace resource (loaded like any HACS card,
    no page-load race). If the card is already loaded from another resource
    (for example the HACS Dashboard install of this repository), nothing is
    added so the element is not loaded twice. YAML-mode dashboards fall back to
    ``add_extra_js_url``. Returns how the card was registered.
    """
    url = versioned_card_url()
    resources = _resources(hass)
    if resources is not None and hasattr(resources, "async_create_item") and _lovelace_mode(hass) != "yaml":
        if not getattr(resources, "loaded", True):
            await resources.async_load()
            resources.loaded = True
        items = list(resources.async_items())
        ours = [item for item in items if _is_ours(item.get("url", ""))]
        foreign = [item for item in items if _is_foreign_copy(item.get("url", ""))]
        if foreign:
            for item in ours:
                await resources.async_delete_item(item["id"])
            _LOGGER.info("Automation Analyzer card already loaded from %s", foreign[0].get("url"))
            return "existing_resource"
        if ours:
            first, *rest = ours
            if first.get("url") != url:
                await resources.async_update_item(first["id"], {"res_type": "module", "url": url})
            for item in rest:
                await resources.async_delete_item(item["id"])
            return "resource"
        await resources.async_create_item({"res_type": "module", "url": url})
        return "resource"
    frontend.add_extra_js_url(hass, url)
    return "extra_js_url"


async def async_unregister_card(hass: HomeAssistant) -> None:
    """Remove the Lovelace resource this integration created."""
    resources = _resources(hass)
    if resources is None or not hasattr(resources, "async_delete_item"):
        return
    if not getattr(resources, "loaded", True):
        await resources.async_load()
        resources.loaded = True
    for item in list(resources.async_items()):
        if _is_ours(item.get("url", "")):
            await resources.async_delete_item(item["id"])


async def async_register_panel(hass: HomeAssistant) -> bool:
    """Add the admin-only sidebar panel unless the URL path is already taken."""
    panels = hass.data.get(frontend.DATA_PANELS, {})
    if PANEL_URL_PATH in panels:
        _LOGGER.info("Sidebar path /%s is already in use; not adding the Automation Analyzer panel", PANEL_URL_PATH)
        return False
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=CARD_ELEMENT,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=versioned_card_url(),
        embed_iframe=False,
        require_admin=True,
        config={},
    )
    return True


def async_unregister_panel(hass: HomeAssistant) -> None:
    """Remove the sidebar panel this integration added (callers track ownership)."""
    if PANEL_URL_PATH in hass.data.get(frontend.DATA_PANELS, {}):
        frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
