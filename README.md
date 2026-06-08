# Pip — Obsidian Plugin

Capture notes via Telegram. Delivered to your Obsidian vault, formatted and tagged by AI.

![Pip](imgs/pip.jpg)

## How it works

1. Send anything to [@pipforobsidian_bot](https://t.me/pipforobsidian_bot) on Telegram — text, links, voice notes, images, YouTube links
2. Pip formats it into clean Obsidian Markdown, adds specific `#tags`, and routes it to the right file in your vault
3. Next time you open Obsidian, the note is already there

## Install (via BRAT)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) in Obsidian (Community Plugins → Browse → "BRAT")
2. In BRAT → **Add Beta Plugin** → enter `pip-obsidian/pip_obsidian`
3. Enable **Pip** in Settings → Community Plugins

## Setup

1. Open [@pipforobsidian_bot](https://t.me/pipforobsidian_bot) and send `/start`
2. Copy your activation PIN
3. In Obsidian → Settings → Pip → paste the PIN
4. Send a note — it'll appear in your vault within 60 seconds

## Plans

- **Free** — raw capture (text + links), no AI
- **Pro** — full AI (titles, smart tags, all capture types): $5.99/mo or $60/yr
- **BYOK** — bring your own Google AI Studio (Gemini) key: $30/yr (annual)

Upgrade with `/upgrade` in the bot.

## Privacy

Pip routes notes through an external AI service for formatting and tagging — or, on **BYOK**, through your own key. See [pipforobsidian.app/privacy](https://pipforobsidian.app/privacy) for details.

## License

MIT
