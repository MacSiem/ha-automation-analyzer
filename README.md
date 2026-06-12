# 📊 Automation Analyzer

![Preview](banner.png)

Analyze your Home Assistant automations — failures, hot spots, traces.

[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.1+-blue.svg?logo=homeassistant)](https://www.home-assistant.io/) [![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE) [![Version](https://img.shields.io/badge/Version-4.1.5-success.svg)](#changelog)

> Part of the [HA Tools](https://github.com/MacSiem) ecosystem — split into individual HACS-installable plugins.

## Installation (HACS)

**Automation Analyzer is in the HACS default store** — no custom repository needed:

1. Open **HACS** in Home Assistant
2. Search for **Automation Analyzer**
3. Install and refresh your browser

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=MacSiem&repository=ha-automation-analyzer&category=plugin)

## Usage

### Lovelace card

```yaml
type: custom:ha-automation-analyzer
```

### Optional sidebar panel (`configuration.yaml`)

```yaml
panel_custom:
  - name: ha-automation-analyzer
    sidebar_title: Automation Analyzer
    sidebar_icon: mdi:home-assistant
    url_path: ha-automation-analyzer
    js_url: /local/community/ha-automation-analyzer/ha-automation-analyzer.js
    embed_iframe: false
    config: {}
```

After restart, **Automation Analyzer** appears in the HA sidebar.

## Features

- Analyze your Home Assistant automations — failures, hot spots, traces.
- Bundled Bento Design System (light + dark mode, mobile-friendly)
- Self-contained — no shared HA Tools dependency
- Tool settings and dismissed-banner state are cached in browser `localStorage`
## Privacy

- No telemetry, no analytics, no tracking
- No external network calls, no CDN-hosted assets (system fonts only)
- No data leaves your device (no external network calls)
## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Support

If this tool makes your Home Assistant life easier, consider supporting development:

- [☕ Buy Me a Coffee](https://buymeacoffee.com/macsiem)
- [💳 PayPal](https://www.paypal.com/donate/?hosted_button_id=Y967H4PLRBN8W)

## License

MIT — see [LICENSE](LICENSE).
