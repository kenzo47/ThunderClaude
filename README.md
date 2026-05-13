# ThunderClaude

ThunderClaude is a Thunderbird MailExtension for rewriting the current
compose-window email with LLM presets or a custom instruction while preserving
inline `cid:` media.

The implementation plan lives in `docs/PLAN.md`. Contributors and coding agents
must read `AGENTS.md` before changing files.

## Current Status

This repository is under active pre-release work. Development loading works, but
signed release packaging is still pending.

## Requirements

- Thunderbird 128 or newer.
- Node.js 22 or newer.
- At least one configured provider:
  - Anthropic, OpenAI, Gemini, MiniMax, DeepSeek, OpenRouter, or an
    OpenAI-compatible endpoint with an API key.
  - Ollama for local rewriting without a provider key.

## Development

Install dependencies:

```bash
npm install
```

Load the extension in a temporary Thunderbird profile:

```bash
npm run dev
```

By default this launches `thunderbird`. Set `THUNDERBIRD_BINARY` when the binary
has a different name or path:

```bash
THUNDERBIRD_BINARY=/path/to/thunderbird npm run dev
```

Run the required gates before committing:

```bash
npm test
npm run lint
```

Prepare the unpacked extension files:

```bash
npm run build
```

This writes `dist/`, which is useful for inspection and packaging work. The XPI
packaging script is planned in `docs/PLAN.md` step 21.

## Install

### Development Install

Use `npm run dev` for active development. It starts `web-ext` with Thunderbird
and loads the repository as a temporary extension.

On first run:

1. Open a Thunderbird compose window.
2. Click the ThunderClaude compose-action button.
3. Complete onboarding by choosing a provider, testing it, and saving the
   default model.
4. Reopen the compose-action popup and choose a rewrite preset.

### Packaged Install

Packaged `.xpi` installation is not available yet. After step 21 adds the
packaging script, the expected flow is:

1. Build the XPI.
2. Open Thunderbird Add-ons Manager.
3. Use the gear menu to choose "Install Add-on From File".
4. Select the generated `.xpi`.

Thunderbird's official add-on install guide documents the Add-ons Manager file
install flow:
https://support.mozilla.org/kb/installing-addon-thunderbird

## Screenshots

Screenshots will be added before the first publishable release.

Planned captures:

- `docs/screenshots/onboarding.png`: provider setup and storage mode.
- `docs/screenshots/popup.png`: compose-action rewrite controls.
- `docs/screenshots/options.png`: provider and key settings.

The first publishable build will be tagged `v0.1.0`.

## License

License selection is deferred. Until a `LICENSE` file is added, this repository
is all rights reserved.
