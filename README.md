# 📊 Automation Analyzer

Analyze your Home Assistant automations — failures, hot spots, traces.

[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.1+-blue.svg?logo=homeassistant)](https://www.home-assistant.io/) [![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE) [![Version](https://img.shields.io/badge/Version-4.0.0-success.svg)](#changelog)

> Part of the [HA Tools](https://github.com/MacSiem) ecosystem — split into individual HACS-installable plugins.

## Installation (HACS)

1. Open HACS → Frontend → ⋮ → **Custom repositories**
2. Repository URL: `https://github.com/MacSiem/ha-automation-analyzer` — Category: **Lovelace**
3. Install **Automation Analyzer** from HACS
4. Restart Home Assistant

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
- HA `frontend/set_user_data` cross-device persistence (with `localStorage` cache fallback)

## Privacy

- No external network calls, no telemetry, no CDN-hosted assets
- All data stays on your Home Assistant instance

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Support

If this tool makes your Home Assistant life easier, consider supporting development:

- [☕ Buy Me a Coffee](https://buymeacoffee.com/macsiem)
- [💳 PayPal](https://www.paypal.com/donate/?hosted_button_id=Y967H4PLRBN8W)

## License

MIT — see [LICENSE](LICENSE).
