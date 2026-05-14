import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const PROVIDER_HOST_PERMISSIONS = [
  'http://localhost:11434/*',
  'http://localhost:1234/*',
  'https://api.anthropic.com/*',
  'https://api.deepseek.com/*',
  'https://api.minimax.io/*',
  'https://api.openai.com/*',
  'https://generativelanguage.googleapis.com/*',
  'https://openrouter.ai/*',
];
const OPTIONAL_OPENAI_COMPATIBLE_HOST_PERMISSIONS = [
  'https://*/*',
  'http://localhost/*',
  'http://127.0.0.1/*',
  'http://[::1]/*',
];

async function readManifest() {
  return JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
}

async function readLocaleMessages() {
  return JSON.parse(
    await readFile(new URL('../_locales/en/messages.json', import.meta.url), 'utf8')
  );
}

describe('manifest security metadata', () => {
  it('keeps provider host permissions exact', async () => {
    const manifest = await readManifest();

    expect(manifest.host_permissions).toEqual(PROVIDER_HOST_PERMISSIONS);
    expect(manifest.host_permissions).not.toContain('<all_urls>');
    expect(manifest.host_permissions).not.toContain('*://*/*');

    for (const permission of manifest.host_permissions) {
      expect(permission).not.toMatch(/^\*:/);
      expect(permission).not.toMatch(/:\/\/\*\./);
    }
  });

  it('keeps custom endpoint hosts optional and user-granted', async () => {
    const manifest = await readManifest();

    expect(manifest.optional_host_permissions).toEqual(OPTIONAL_OPENAI_COMPATIBLE_HOST_PERMISSIONS);
    expect(manifest.optional_host_permissions).not.toContain('<all_urls>');
    expect(manifest.optional_host_permissions).not.toContain('*://*/*');
  });

  it('declares provider credential and draft transfer categories', async () => {
    const manifest = await readManifest();

    expect(manifest.browser_specific_settings.gecko.data_collection_permissions.required).toEqual([
      'authenticationInfo',
      'personalCommunications',
    ]);
  });

  it('uses only the Thunderbird extension permissions needed for v1', async () => {
    const manifest = await readManifest();

    expect(manifest.permissions).toEqual(['compose', 'scripting', 'storage']);
  });

  it('uses the English locale for manifest text', async () => {
    const manifest = await readManifest();
    const messages = await readLocaleMessages();

    expect(manifest.default_locale).toBe('en');
    expect(manifest.name).toBe('__MSG_extensionName__');
    expect(manifest.description).toBe('__MSG_extensionDescription__');
    expect(messages.extensionName.message).toBe('ThunderClaude');
    expect(messages.extensionDescription.message).toContain('preserving inline media');
  });
});
