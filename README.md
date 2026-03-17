# 📊 Automation Analyzer

Analyze automation performance, issues and optimization opportunities

Part of the [HA Tools](https://github.com/MacSiem/ha-tools-panel) collection for Home Assistant.

## Installation

### HACS (recommended)
1. Open HACS in Home Assistant
2. Go to Frontend > Explore & Download Repositories
3. Search for "Automation Analyzer"
4. Install and restart Home Assistant

### Manual
1. Download `ha-automation-analyzer.js` from this repository
2. Copy to `/config/www/community/ha-automation-analyzer/`
3. Add as a Lovelace resource

## Screenshot

![Screenshot](screenshot.png)

## Changelog

### v2.3 (2026-03-17)
- Bento Light Mode UI redesign (Inter font, blue accent #3B82F6)
- Throttled hass updates (5s) to prevent UI lag
- Stable pagination and data persistence
- Fixed dual-script loading (customElements.define guard)
- CSS custom properties for theming (--bento-primary, --bento-bg, etc.)
- Improved readability and layout consistency

## License

MIT