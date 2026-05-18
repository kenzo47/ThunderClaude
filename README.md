<p align="center">
  <img src="docs/branding/banner.webp" alt="ThunderClaude — AI-powered email rewriting for Thunderbird" width="100%" />
</p>

# ThunderClaude

ThunderClaude is a Thunderbird MailExtension for rewriting the current
compose-window email with LLM presets or a custom instruction while preserving
inline `cid:` media.

The implementation plan lives in `docs/PLAN.md`. Contributors and coding agents
must read `AGENTS.md` before changing files.

## Current Status

This repository is under active pre-release work. Development loading works, but
public release signing is still pending.

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

This writes `dist/unpacked/` for inspection and `dist/thunderclaude-0.0.0.xpi`
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
3. Select `dist/thunderclaude-0.0.0.xpi`.

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

## Screenshots

Screenshots will be added before tagging `v0.1.0`.

Planned captures:

- `docs/screenshots/onboarding.png`: provider setup and at-rest encryption note.
- `docs/screenshots/popup.png`: compose-action rewrite controls.
- `docs/screenshots/options.png`: provider and key settings.

## License

License selection is deferred. Until a `LICENSE` file is added, this repository
is all rights reserved.
