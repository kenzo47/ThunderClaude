import { beforeEach, describe, expect, it } from 'vitest';

import { registerProvider } from '../src/background/providers/index.js';
import { createMessageRouter } from '../src/background/rewrite.js';
import { lockSession } from '../src/background/session-key.js';

let providerCalls = [];
let testConnectionCalls = [];

registerProvider({
  defaultModel: 'mock-model',
  endpointHost: 'mock.e2e.local',
  id: 'mock-e2e',
  keyHelpUrl: 'https://mock.e2e.local/keys',
  label: 'Mock E2E',
  modelList: ['mock-model', 'mock-fast'],
  async rewrite(input) {
    providerCalls.push(input);
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
    lockSession();
    providerCalls = [];
    testConnectionCalls = [];
    storageArea = createStorageArea();
    thunderbird = createThunderbird('<p>Hello<img src="cid:first"></p>');
    router = createMessageRouter({ storageArea, thunderbird });
  });

  it('unlocks, stores an encrypted key, completes onboarding, and rewrites a draft', async () => {
    await expect(
      router({
        action: 'options:unlock',
        storagePhrase: 'storage phrase',
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        session: {
          locked: false,
        },
      },
    });

    await expect(
      router({
        action: 'options:testProvider',
        apiKey: 'sk-test-fake-key-do-not-use',
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
          baseUrl: '',
          model: 'mock-model',
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
});
