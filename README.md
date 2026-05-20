# Pip — Obsidian Plugin

Capture notes via Telegram. Delivered to your Obsidian vault, formatted and tagged by AI.

## How it works

1. Send anything to [@pipforobsidian_bot](https://t.me/pipforobsidian_bot) on Telegram — text, links, tasks, questions
2. Pip formats it into clean Obsidian Markdown, adds specific `#tags`, and routes it to the right file in your vault
3. Next time you open Obsidian, the note is already there

## Installation

### From Obsidian Community Plugins (coming soon)
Search for "Pip" in Settings → Community Plugins.

### Manual (BRAT)
1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Add `pip-obsidian/pip_obsidian` as a beta plugin

### Manual
1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/pip-obsidian/pip_obsidian/releases)
2. Copy both files to `<your vault>/.obsidian/plugins/pip-obsidian/`
3. Enable the plugin in Settings → Community Plugins

## Setup

1. Open [@pipforobsidian_bot](https://t.me/pipforobsidian_bot) and send `/start`
2. Copy your activation PIN
3. In Obsidian → Settings → Pip → paste the PIN
4. Send a note — it'll appear in your vault within 60 seconds

## Privacy

Pip routes notes through an external AI service for formatting and tagging. See [pipforobsidian.app/privacy](https://pipforobsidian.app/privacy) for details.

## License

MIT
