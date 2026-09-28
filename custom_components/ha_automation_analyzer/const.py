"""Automation Analyzer integration constants."""

DOMAIN = "ha_automation_analyzer"
NAME = "Automation Analyzer"
VERSION = "5.0.1"

CARD_FILENAME = "ha-automation-analyzer.js"
CARD_ELEMENT = "ha-automation-analyzer"
STATIC_URL_BASE = f"/{DOMAIN}"
CARD_URL = f"{STATIC_URL_BASE}/{CARD_FILENAME}"

PANEL_URL_PATH = "automation-analyzer"
PANEL_TITLE = "Automation Analyzer"
PANEL_ICON = "mdi:robot-outline"

CONF_SHOW_PANEL = "show_panel"
DEFAULT_SHOW_PANEL = True
