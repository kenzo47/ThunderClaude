<p align="center">
  <img src="docs/branding/banner.webp" alt="ThunderClaude — AI-powered email rewriting for Thunderbird" width="100%" />
</p>

# ThunderClaude

ThunderClaude is a Thunderbird MailExtension for rewriting the current
compose-window email with LLM presets or a custom instruction. It rewrites only
the text you select — or, after a confirmation step, the whole draft — and
leaves every inline image untouched by default.

The implementation plan lives in `docs/PLAN.md`. Contributors and coding agents
must read `AGENTS.md` before changing files.

## Current Status

The latest release is `v0.1.1`. Development loading and local packaging
work; the add-on is not yet listed on addons.thunderbird.net.

## Features

- **Presets and custom instructions** — make formal or casual, shorten, expand,
  fix grammar, translate, or draft a reply, plus your own free-text instruction.
- **Selection-aware scope** — by default ThunderClaude rewrites only the text you
  have selected, so quoted replies and forwarded threads keep their original
  styling. With nothing selected it asks for confirmation before rewriting the
  whole draft.
- **Inline images preserved by default** — every inline image (`cid:` attachment,
  remote, or `data:` image) stays exactly in place. An optional toggle lets the
  model move images when you want it to; it can never silently drop one.
- **Bring your own provider** — Anthropic, OpenAI, Gemini, MiniMax, DeepSeek,
  OpenRouter, any OpenAI-compatible endpoint, or local models via Ollama or LM
  Studio.
- **Local-first key storage** — your API key is stored encrypted at rest and is
  sent only to the provider you configured. No telemetry.

## Requirements

- Thunderbird 128 or newer.
- Node.js 22 or newer.
- At least one configured provider:
  - Anthropic, OpenAI, Gemini, MiniMax, DeepSeek, OpenRouter, or an
    OpenAI-compatible endpoint with an API key.
  - Local LLMs through Ollama or LM Studio without a provider key.

## Development

Install dependencies:

```bash
pnpm install
```

Load the extension in a temporary Thunderbird profile:

```bash
pnpm dev
```

By default this launches `thunderbird`. Set `THUNDERBIRD_BINARY` when the binary
has a different name or path:

```bash
THUNDERBIRD_BINARY=/path/to/thunderbird pnpm dev
```

Run the required gates before committing:

```bash
pnpm test
pnpm lint
```

Prepare the unpacked extension files:

```bash
pnpm build
```

This writes `dist/unpacked/` for inspection and `dist/thunderclaude-0.1.1.xpi`
for local installation testing.

## Install

### Development Install

Use `pnpm dev` for active development. It starts `web-ext` with Thunderbird
and loads the repository as a temporary extension.

On first run:

1. Open a Thunderbird compose window.
2. Click the ThunderClaude compose-action button.
3. Complete onboarding by choosing a provider, testing it, and saving the
   default model.
4. Reopen the compose-action popup and choose a rewrite preset.

### Packaged Install

Build the XPI:

```bash
pnpm build
```

Then install it:

1. Open Thunderbird Add-ons Manager.
2. Use the gear menu to choose "Install Add-on From File".
3. Select `dist/thunderclaude-0.1.1.xpi`.

Thunderbird's official add-on install guide documents the Add-ons Manager file
install flow:
https://support.mozilla.org/kb/installing-addon-thunderbird

Release signing notes live in `docs/RELEASE.md`.
Manual Thunderbird verification steps live in `docs/MANUAL-VERIFY.md`.

## Branding

- `docs/branding/logo.webp` and `logo.png` — 1254×1254 master icon. The
  shipped `icons/icon-{16,32,48,96}.png` files are downscaled from this
  master.
- `docs/branding/banner.webp` and `banner.png` — 2172×724 listing banner
  used at the top of this README and on the ATN listing.

## Privacy

ThunderClaude has no servers and collects no analytics or telemetry. Your draft
and instruction are sent only to the LLM provider you configure, only when you
trigger a rewrite; your API key is stored locally and encrypted at rest. See
[`PRIVACY.md`](PRIVACY.md) for the full policy.

## License

Copyright (C) 2026 Kenzo Wijnants

ThunderClaude is free software: you can redistribute it and/or modify it under
the terms of the **GNU General Public License v3.0** as published by the Free
Software Foundation. See [`LICENSE`](LICENSE) for the full text.

This means you are free to use, study, fork, and modify ThunderClaude. If you
distribute a modified version, you must release your changes under the same
GPL-3.0 license with source — so nobody can take this code, close it up, and
resell it as a proprietary product.

ThunderClaude is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details.
