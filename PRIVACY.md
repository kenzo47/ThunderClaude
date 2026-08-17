# ThunderClaude Privacy Policy

_Last updated: 2026-05-25_

ThunderClaude is a Thunderbird MailExtension that rewrites the email you are
composing using a Large Language Model (LLM) provider that **you** choose and
configure. This document explains exactly what data the add-on handles, where
it goes, and what stays on your device.

ThunderClaude has **no servers of its own**. It collects no analytics, no
telemetry, and no crash reports. Nothing is sent anywhere except to the single
LLM provider endpoint you configure, and only when you ask for a rewrite.

## What is sent off your device, and to whom

When — and only when — you trigger a rewrite, ThunderClaude sends the following
to the API endpoint of the provider you configured (for example Anthropic,
OpenAI, Google, xAI, Z.ai, DeepSeek, MiniMax, OpenRouter, or a
custom/OpenAI-compatible endpoint):

- The text of the email draft you are composing, or the portion you selected.
- Your chosen instruction (a preset such as "Make formal", a target language,
  or your own custom instruction).

This request is sent directly from your computer to the provider over HTTPS.
ThunderClaude verifies the request hostname matches the selected provider before
every call, sends the request with `credentials: 'omit'` and
`referrer-policy: no-referrer`, and never routes it through any intermediary.

Once the draft reaches the provider, **the provider's own privacy policy and
terms govern that data.** Different providers have different retention and
training practices; review the policy of the provider you choose. ThunderClaude
cannot control what a third-party provider does with the text you send it.

### Inline images

Inline images in your draft (whether embedded `cid:` attachments, remote images,
or `data:` images) are **not** sent to the provider. They are replaced with
placeholder tokens before the request and restored locally afterwards, so their
contents and URLs never leave your device through ThunderClaude.

### Local providers

If you configure a local provider (Ollama or LM Studio on `localhost`), your
draft is sent only to that local service on your own machine and does not leave
your device at all.

## What is stored on your device

ThunderClaude stores the following in Thunderbird's local extension storage
(`storage.local`) on your computer:

- Your settings: selected provider, model, theme, and onboarding state.
- Your provider API key, **encrypted at rest** with a profile-local AES-GCM key.

The API key is only ever decrypted in memory to be sent as the authorization
header to the matching provider's host. It is never transmitted to any other
destination, and never written to logs (logs redact key-like strings and
truncate prompt/response bodies).

This at-rest encryption protects the key from casual inspection of the profile
on disk. It is **not** end-to-end encryption and does not defend against malware
running as your user account or someone with full access to your unlocked
profile while Thunderbird can read it.

## What ThunderClaude does not do

- No analytics, telemetry, usage tracking, or crash reporting.
- No advertising, and no selling or sharing of your data.
- No network connections other than to the provider endpoint you configure.
- No remote code loading.

## Your control over your data

- Your draft and instruction are sent only when you explicitly start a rewrite.
- You can change or remove your stored provider key at any time from the
  extension's options page.
- Removing the ThunderClaude add-on deletes its locally stored settings and the
  encrypted key from your Thunderbird profile.

## Changes to this policy

If this policy changes, the updated version will be published in the
ThunderClaude source repository with a new "Last updated" date.

## Contact

Questions or privacy concerns: please open an issue on the ThunderClaude GitHub
repository (https://github.com/kenzo47/ThunderClaude).
