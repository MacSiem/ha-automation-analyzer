"""Serve the bundled card and register it with Lovelace and the sidebar."""

from __future__ import annotations

import asyncio
import logging
from copy import deepcopy
from pathlib import Path
from typing import Any

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import CoreState, HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    PANEL_ELEMENT,
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
DATA_OWNERSHIP = "ha_automation_analyzer_frontend_ownership"
OWNERSHIP_KEY = "ha_automation_analyzer.frontend"
DATA_EXTRA_URL = "ha_automation_analyzer_extra_js_url"


class _ResourceOwnership:
    """Serialize resource changes and retain durable creation receipts."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.lock = asyncio.Lock()

    def store(self) -> Store:
        return Store(self.hass, 1, OWNERSHIP_KEY, private=True, atomic_writes=True)

    async def load(self) -> list[dict[str, str]]:
        data = await self.store().async_load()
        return deepcopy((data or {}).get("owned_resources", []))

    async def save(self, owned: list[dict[str, str]]) -> None:
        # Store logs some disk errors without raising and defers shutdown writes.
        # Read through a fresh instance so pending memory is never a receipt.
        if self.hass.state is CoreState.stopping:
            raise ValueError("Cannot save frontend ownership while HA is stopping")
        data = {"owned_resources": deepcopy(owned)}
        await self.store().async_save(data)
        if await self.store().async_load() != data:
            raise ValueError("Frontend ownership save could not be confirmed")


def _ownership(hass: HomeAssistant) -> _ResourceOwnership:
    if DATA_OWNERSHIP not in hass.data:
        hass.data[DATA_OWNERSHIP] = _ResourceOwnership(hass)
    return hass.data[DATA_OWNERSHIP]


def _receipt(item: dict[str, Any]) -> dict[str, str]:
    return {key: item[key] for key in ("id", "url", "type")}


async def _reconcile_owned(
    state: _ResourceOwnership, resources: Any,
) -> list[dict[str, str]]:
    """Keep only creation receipts whose resource the user has not edited."""
    saved = await state.load()
    # Store I/O yields: read current resources after it, not a stale snapshot.
    current = {item["id"]: item for item in resources.async_items()}
    owned = [record for record in saved if record.get("id") in current
             and all(current[record["id"]].get(key) == record.get(key)
                     for key in ("url", "type"))]
    if owned != saved:
        await state.save(owned)
    return owned


async def _delete_owned(
    state: _ResourceOwnership, resources: Any, owned: list[dict[str, str]],
    record: dict[str, str],
) -> None:
    """Keep the receipt until deletion succeeds, then persist the reduction."""
    remaining = [item for item in owned if item["id"] != record["id"]]
    current = next((item for item in resources.async_items() if item["id"] == record["id"]), None)
    if current is not None and _receipt(current) == record:
        await resources.async_delete_item(record["id"])
    await state.save(remaining)
    owned[:] = remaining


def versioned_card_url() -> str:
    """Return the cache-busting URL of the bundled card."""
    return f"{CARD_URL}?v={VERSION}"


async def async_register_static(hass: HomeAssistant) -> None:
    """Serve custom_components/ha_automation_analyzer/www once per HA run."""
    if hass.data.get(DATA_STATIC):
        return
    www = Path(__file__).parent / "www"
    if not await hass.async_add_executor_job((www / CARD_FILENAME).is_file):
        raise FileNotFoundError(f"Bundled Automation Analyzer card missing: {CARD_FILENAME}")
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
    filename = path.rsplit("/", 1)[-1]
    return filename == CARD_FILENAME and not _is_ours(url)


async def async_register_card(hass: HomeAssistant) -> str:
    """Register a card without adopting any resource by its URL."""
    state = _ownership(hass)
    async with state.lock:
        url = versioned_card_url()
        resources = _resources(hass)
        if resources is None or not hasattr(resources, "async_create_item") or _lovelace_mode(hass) == "yaml":
            # Extra modules are a set: an existing URL belongs to its user.
            previous = hass.data.get(DATA_EXTRA_URL)
            if previous and previous != url:
                _remove_extra_module(hass)
            extra_modules = hass.data.get(frontend.DATA_EXTRA_MODULE_URL)
            # HA exposes a UrlManager with a public .urls frozenset.
            # It has add/remove methods but is not itself iterable.
            extra_urls = getattr(extra_modules, "urls", extra_modules or ())
            if url not in extra_urls:
                frontend.add_extra_js_url(hass, url)
                hass.data[DATA_EXTRA_URL] = url
            return "extra_js_url"
        _remove_extra_module(hass)
        if not getattr(resources, "loaded", True):
            await resources.async_load()
            resources.loaded = True
        owned = await _reconcile_owned(state, resources)
        items = list(resources.async_items())
        owned_ids = {record["id"] for record in owned}
        foreign = [item for item in items if item["id"] not in owned_ids
                   and (_is_ours(item.get("url", "")) or _is_foreign_copy(item.get("url", "")))]
        if foreign:
            for record in list(owned):
                await _delete_owned(state, resources, owned, record)
            _LOGGER.info("Automation Analyzer card already loaded from %s", foreign[0].get("url"))
            return "existing_resource"
        if owned:
            first, *rest = owned
            if first["url"] != url:
                updated = await resources.async_update_item(first["id"], {"res_type": "module", "url": url})
                next_owned = [_receipt(updated), *rest]
                await state.save(next_owned)
                owned[:] = next_owned
            for record in rest:
                await _delete_owned(state, resources, owned, record)
            return "resource"
        created = await resources.async_create_item({"res_type": "module", "url": url})
        if not isinstance(created.get("id"), str) or not created["id"]:
            raise ValueError("Lovelace did not return a created resource ID")
        record = _receipt(created)
        try:
            await state.save([record])
        except Exception:
            # Store I/O yields; a user may have edited this same ID meanwhile.
            current = next((item for item in resources.async_items() if item["id"] == record["id"]), None)
            if current is not None and _receipt(current) == record:
                await resources.async_delete_item(record["id"])
            raise
        return "resource"


def _remove_extra_module(hass: HomeAssistant) -> None:
    """Remove the YAML module only when this HA run actually added it."""
    if url := hass.data.pop(DATA_EXTRA_URL, None):
        try:
            frontend.remove_extra_js_url(hass, url)
        except KeyError:
            pass


async def async_unregister_card(hass: HomeAssistant) -> None:
    """Delete only resources with still-valid durable creation receipts."""
    state = _ownership(hass)
    async with state.lock:
        _remove_extra_module(hass)
        resources = _resources(hass)
        if resources is None or not hasattr(resources, "async_delete_item"):
            # A missing collection does not prove the resources were removed.
            if await state.load():
                raise ValueError("Lovelace resources unavailable for ownership cleanup")
            return
        if not getattr(resources, "loaded", True):
            await resources.async_load()
            resources.loaded = True
        owned = await _reconcile_owned(state, resources)
        for record in list(owned):
            await _delete_owned(state, resources, owned, record)


async def async_register_panel(hass: HomeAssistant) -> bool:
    """Add the admin-only sidebar panel unless the URL path is already taken."""
    panels = hass.data.get(frontend.DATA_PANELS, {})
    if PANEL_URL_PATH in panels:
        _LOGGER.info("Sidebar path /%s is already in use; not adding the Automation Analyzer panel", PANEL_URL_PATH)
        return False
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_ELEMENT,
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
