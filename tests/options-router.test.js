import { beforeEach, describe, expect, it } from 'vitest';

import {
  completeOnboarding,
  getOptionsSnapshot,
  saveProviderOptions,
  testProviderOptions,
  unlockOptionsSession,
} from '../src/background/options-router.js';
import { getSettingsKey } from '../src/background/settings.js';
import { getPlainValue, getStorageKeys } from '../src/background/secure-storage.js';
import { lockSession } from '../src/background/session-key.js';

function createStorageArea() {
  const values = {};

  return {
    values,
    async get(key) {
      return {
        [key]: values[key],
      };
    },
    async remove(keys) {
      for (const key of keys) {
        delete values[key];
      }
    },
    async set(items) {
      Object.assign(values, items);
    },
  };
}

function successfulOllamaResponse(text = 'OK') {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        message: {
          content: text,
          role: 'assistant',
        },
      };
    },
  };
}

describe('options router', () => {
  let storageArea;

  beforeEach(() => {
    lockSession();
    storageArea = createStorageArea();
  });

  it('returns providers, session state, and default settings', async () => {
    const snapshot = await getOptionsSnapshot({ storageArea });

    expect(snapshot.providers.map((provider) => provider.id)).toContain('anthropic');
    expect(snapshot.providers.map((provider) => provider.id)).toContain('openai-compatible');
    expect(snapshot.settings.defaultProviderId).toBe('anthropic');
    expect(snapshot.settings.enabledLocalProviderIds).toEqual({});
    expect(snapshot.settings.onboardingComplete).toBe(false);
    expect(snapshot.session.locked).toBe(true);
    expect(snapshot.providerConfigs.anthropic).toMatchObject({
      defaultModel: 'claude-opus-4-7',
      hasKey: false,
      keyMode: 'encrypted',
    });
    expect(snapshot.providerConfigs.ollama).toMatchObject({
      hasKey: false,
      keyMode: 'none',
      localAccessEnabled: false,
      verified: false,
    });
  });

  it('unlocks encrypted storage and persists the key salt', async () => {
    const snapshot = await unlockOptionsSession(
      { storagePhrase: 'storage phrase' },
      { storageArea }
    );

    expect(snapshot.session.locked).toBe(false);
    expect(storageArea.values[getSettingsKey()].keySalt).toEqual(snapshot.session.salt);
  });

  it('saves plaintext provider keys as obfuscated opt-out values', async () => {
    const snapshot = await saveProviderOptions(
      {
        apiKey: 'sk-test-fake-key-do-not-use',
        defaultModel: 'gpt-5.4',
        keyMode: 'plain',
        providerId: 'openai',
      },
      { storageArea }
    );

    const keys = getStorageKeys('openai');
    expect(storageArea.values[keys.plain]).toMatch(/^plain-v1:/);
    expect(storageArea.values[keys.plain]).not.toContain('sk-test-fake-key-do-not-use');
    await expect(getPlainValue('openai', { storageArea })).resolves.toBe(
      'sk-test-fake-key-do-not-use'
    );
    expect(snapshot.settings.defaultProviderId).toBe('openai');
    expect(snapshot.providerConfigs.openai).toMatchObject({
      defaultModel: 'gpt-5.4',
      hasKey: true,
      keyMode: 'plain',
      verified: false,
    });
  });

  it('keeps the existing key mode when no replacement key is entered', async () => {
    await saveProviderOptions(
      {
        apiKey: 'sk-test-fake-key-do-not-use',
        defaultModel: 'gpt-5.4',
        keyMode: 'plain',
        providerId: 'openai',
      },
      { storageArea }
    );

    const snapshot = await saveProviderOptions(
      {
        defaultModel: 'gpt-5.4',
        keyMode: 'encrypted',
        providerId: 'openai',
      },
      { storageArea }
    );

    expect(snapshot.providerConfigs.openai).toMatchObject({
      hasKey: true,
      keyMode: 'plain',
    });
  });

  it('saves encrypted provider keys only after unlock', async () => {
    await unlockOptionsSession({ storagePhrase: 'storage phrase' }, { storageArea });

    const snapshot = await saveProviderOptions(
      {
        apiKey: 'sk-test-fake-key-do-not-use',
        customBaseUrl: 'https://custom.example/v1',
        defaultModel: 'custom-model',
        keyMode: 'encrypted',
        providerId: 'openai-compatible',
      },
      { storageArea }
    );

    const keys = getStorageKeys('openai-compatible');
    expect(JSON.stringify(storageArea.values[keys.encrypted])).not.toContain(
      'sk-test-fake-key-do-not-use'
    );
    expect(snapshot.settings.customBaseUrlByProvider['openai-compatible']).toBe(
      'https://custom.example/v1'
    );
    expect(snapshot.providerConfigs['openai-compatible']).toMatchObject({
      defaultModel: 'custom-model',
      hasKey: true,
      keyMode: 'encrypted',
    });
  });

  it('rejects encrypted key saves while locked', async () => {
    await expect(
      saveProviderOptions(
        {
          apiKey: 'sk-test-fake-key-do-not-use',
          defaultModel: 'gpt-5.4',
          keyMode: 'encrypted',
          providerId: 'openai',
        },
        { storageArea }
      )
    ).rejects.toThrow('Session key is locked.');
  });

  it('reports missing keys for plaintext connection tests without a stored key', async () => {
    await expect(
      testProviderOptions(
        {
          defaultModel: 'gpt-5.4',
          keyMode: 'plain',
          providerId: 'openai',
        },
        { storageArea }
      )
    ).rejects.toMatchObject({
      code: 'missing_provider_key',
    });
  });

  it('requires explicit local access before testing Ollama', async () => {
    await expect(
      testProviderOptions(
        {
          defaultModel: 'llama3.2',
          providerId: 'ollama',
        },
        { storageArea }
      )
    ).rejects.toMatchObject({
      code: 'local_provider_not_enabled',
    });
  });

  it('saves explicit local access for Ollama', async () => {
    const snapshot = await saveProviderOptions(
      {
        defaultModel: 'llama3.2',
        keyMode: 'none',
        localAccessEnabled: true,
        providerId: 'ollama',
      },
      { storageArea }
    );

    expect(snapshot.settings.enabledLocalProviderIds).toMatchObject({
      ollama: true,
    });
    expect(snapshot.providerConfigs.ollama).toMatchObject({
      keyMode: 'none',
      localAccessEnabled: true,
      verified: false,
    });
  });

  it('requires provider verification before onboarding completes', async () => {
    await saveProviderOptions(
      {
        defaultModel: 'llama3.2',
        keyMode: 'none',
        localAccessEnabled: true,
        providerId: 'ollama',
      },
      { storageArea }
    );

    await expect(
      completeOnboarding({ providerId: 'ollama' }, { storageArea })
    ).rejects.toMatchObject({
      code: 'provider_not_verified',
    });
  });

  it('marks onboarding complete for a configured and verified provider', async () => {
    await saveProviderOptions(
      {
        defaultModel: 'llama3.2',
        keyMode: 'none',
        localAccessEnabled: true,
        providerId: 'ollama',
      },
      { storageArea }
    );
    await expect(
      testProviderOptions(
        {
          defaultModel: 'llama3.2',
          localAccessEnabled: true,
          providerId: 'ollama',
        },
        {
          fetchImpl: async () => successfulOllamaResponse(),
          storageArea,
        }
      )
    ).resolves.toEqual({
      connected: true,
    });

    const settings = await completeOnboarding({ providerId: 'ollama' }, { storageArea });

    expect(settings).toMatchObject({
      defaultProviderId: 'ollama',
      enabledLocalProviderIds: {
        ollama: true,
      },
      onboardingComplete: true,
      verifiedProviderIds: {
        ollama: true,
      },
    });
  });
});
