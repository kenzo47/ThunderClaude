# ThunderClaude

ThunderClaude is a planned Thunderbird MailExtension for rewriting the current
compose-window email with LLM presets or a custom instruction while preserving
inline `cid:` media.

The implementation plan lives in `docs/PLAN.md`. Contributors and coding agents
must read `AGENTS.md` before changing files.

## Current Status

This repository is under active scaffold work and is not yet a usable extension.

## Development

Install dependencies:

```bash
npm install
```

Run the required gates before committing:

```bash
npm test
npm run lint
```

The first publishable build will be tagged `v0.1.0`.

## License

License selection is deferred. Until a `LICENSE` file is added, this repository
is all rights reserved.
