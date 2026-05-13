import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const PROVIDER_HOST_PERMISSIONS = [
  'http://localhost:11434/*',
  'https://api.anthropic.com/*',
  'https://api.deepseek.com/*',
  'https://api.minimax.io/*',
  'https://api.openai.com/*',
  'https://generativelanguage.googleapis.com/*',
  'https://openrouter.ai/*',
];

async function readManifest() {
  return JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
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
});
