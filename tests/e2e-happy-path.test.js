import { beforeEach, describe, expect, it } from 'vitest';

import { ProviderError, registerProvider } from '../src/background/providers/index.js';
import { createMessageRouter } from '../src/background/rewrite.js';

let providerCalls = [];
let testConnectionCalls = [];

registerProvider({
  defaultModel: 'mock-model',
  defaultBaseUrl: 'https://mock.e2e.local/v1',
  endpointHost: 'mock.e2e.local',
  id: 'mock-e2e',
  keyHelpUrl: 'https://mock.e2e.local/keys',
  label: 'Mock E2E',
  modelList: ['mock-model', 'mock-fast'],
  async rewrite(input) {
    providerCalls.push(input);
    if (input.key !== 'sk-test-fake-key-do-not-use') {
      throw new ProviderError('invalid api key', {
        code: 'authentication_error',
        status: 401,
      });
    }
    if (input.system.includes('one text segment')) {
      return '<p>Formal ';
    }
    if (input.user.includes('[[TC_IMG_2]]')) {
      return '<p>Formal [[TC_IMG_1]] then [[TC_IMG_2]]</p>';
    }
    return '<p>Formal [[TC_IMG_1]]</p>';
  },
  async testConnection(key, options) {
    testConnectionCalls.push({ key, options });
    return key === 'sk-test-fake-key-do-not-use';
  },
});

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

function createThunderbird(body) {
  const setCalls = [];

  return {
    compose: {
      async getComposeDetails(tabId) {
        return {
          body,
          isPlainText: false,
          tabId,
        };
      },
      async setComposeDetails(tabId, details) {
        setCalls.push({ details, tabId });
      },
    },
    setCalls,
  };
}

describe('end-to-end happy path', () => {
  let storageArea;
  let thunderbird;
  let router;

  beforeEach(() => {
    providerCalls = [];
    testConnectionCalls = [];
    storageArea = createStorageArea();
    thunderbird = createThunderbird('<p>Hello<img src="cid:first"></p>');
    router = createMessageRouter({ storageArea, thunderbird });
  });

  async function configureProvider(apiKey = 'sk-test-fake-key-do-not-use') {
    await router({
      action: 'options:saveProvider',
      apiKey,
      defaultModel: 'mock-model',
      keyMode: 'encrypted',
      providerId: 'mock-e2e',
    });
    await router({
      action: 'options:testProvider',
      defaultModel: 'mock-model',
      keyMode: 'encrypted',
      providerId: 'mock-e2e',
    });
    await router({
      action: 'options:completeOnboarding',
      providerId: 'mock-e2e',
    });
  }

  it('stores an encrypted key, completes onboarding, and rewrites a draft', async () => {
    await expect(
      router({
        action: 'options:saveProvider',
        apiKey: 'sk-test-fake-key-do-not-use',
        defaultModel: 'mock-model',
        keyMode: 'encrypted',
        providerId: 'mock-e2e',
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        providerConfigs: {
          'mock-e2e': {
            hasKey: true,
            keyMode: 'encrypted',
          },
        },
      },
    });

    expect(JSON.stringify(storageArea.values)).not.toContain('sk-test-fake-key-do-not-use');

    await expect(
      router({
        action: 'options:testProvider',
        defaultModel: 'mock-model',
        keyMode: 'encrypted',
        providerId: 'mock-e2e',
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        connected: true,
      },
    });

    await expect(
      router({
        action: 'options:completeOnboarding',
        providerId: 'mock-e2e',
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        defaultProviderId: 'mock-e2e',
        onboardingComplete: true,
      },
    });

    await expect(
      router({
        action: 'rewrite',
        preset: 'make-formal',
        providerId: 'mock-e2e',
        tabId: 42,
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        body: '<p>Formal <img src="cid:first"></p>',
        model: 'mock-model',
        providerId: 'mock-e2e',
      },
    });

    expect(testConnectionCalls).toEqual([
      {
        key: 'sk-test-fake-key-do-not-use',
        options: {
          baseUrl: 'https://mock.e2e.local/v1',
          fetchImpl: undefined,
          model: 'mock-model',
          throwOnError: true,
        },
      },
    ]);
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]).toMatchObject({
      key: 'sk-test-fake-key-do-not-use',
      model: 'mock-model',
    });
    expect(providerCalls[0].system).toContain('Preserve every [[TC_IMG_N]] token exactly once.');
    expect(providerCalls[0].user).toContain('Rewrite the email in a more formal');
    expect(providerCalls[0].user).toContain('<p>Hello[[TC_IMG_1]]</p>');
    expect(thunderbird.setCalls).toEqual([
      {
        details: {
          body: '<p>Formal <img src="cid:first"></p>',
          isPlainText: false,
        },
        tabId: 42,
      },
    ]);
  });

  it('treats a verified provider from options as setup complete', async () => {
    await router({
      action: 'options:saveProvider',
      apiKey: 'sk-test-fake-key-do-not-use',
      defaultModel: 'mock-model',
      keyMode: 'encrypted',
      providerId: 'mock-e2e',
    });

    await expect(
      router({
        action: 'options:testProvider',
        defaultModel: 'mock-model',
        keyMode: 'encrypted',
        providerId: 'mock-e2e',
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        connected: true,
        verified: true,
      },
    });

    await expect(
      router({
        action: 'options:getSnapshot',
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        settings: {
          defaultProviderId: 'mock-e2e',
          onboardingComplete: true,
        },
      },
    });

    await expect(
      router({
        action: 'rewrite',
        preset: 'make-formal',
        providerId: 'mock-e2e',
        tabId: 42,
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        providerId: 'mock-e2e',
      },
    });
  });

  it('keeps inline images ordered when relocation is disabled', async () => {
    thunderbird = createThunderbird('<p>Hello<img src="cid:first"><img src="cid:second"></p>');
    router = createMessageRouter({ storageArea, thunderbird });
    await configureProvider();

    await expect(
      router({
        action: 'rewrite',
        allowImageRelocation: false,
        preset: 'make-formal',
        providerId: 'mock-e2e',
        tabId: 42,
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        body: '<p>Formal <img src="cid:first"><img src="cid:second"></p>',
      },
    });

    expect(providerCalls[0].system).toContain('one text segment');
    expect(providerCalls[0].user).not.toContain('[[TC_IMG_');
    expect(thunderbird.setCalls).toHaveLength(1);
  });

  it('leaves the draft untouched when a saved key has not been verified', async () => {
    await configureProvider();
    await router({
      action: 'options:saveProvider',
      apiKey: 'sk-test-wrong-key-do-not-use',
      defaultModel: 'mock-model',
      keyMode: 'encrypted',
      providerId: 'mock-e2e',
    });

    await expect(
      router({
        action: 'rewrite',
        preset: 'make-formal',
        providerId: 'mock-e2e',
        tabId: 42,
      })
    ).resolves.toMatchObject({
      error: {
        code: 'provider_not_verified',
      },
      ok: false,
    });

    expect(thunderbird.setCalls).toEqual([]);
  });
});
