import { describe, expect, it } from 'vitest';

import openaiCompatibleProvider, {
  createChatCompletionsUrl,
} from '../../src/background/providers/openai-compatible.js';
import { defineChatProviderBehaviorTests } from './chat-provider-test-helper.js';

const BASE_URL = 'https://custom.example.test/v1';

describe('openai-compatible provider', () => {
  it('matches the provider contract', () => {
    expect(openaiCompatibleProvider).toMatchObject({
      defaultBaseUrl: 'https://api.openai.com/v1',
      defaultModel: 'custom',
      endpointHost: 'user-configured',
      id: 'openai-compatible',
      keyHelpUrl: 'https://developers.openai.com/api/reference/chat/create',
      label: 'OpenAI-Compatible',
      modelList: ['custom'],
    });
  });

  it('normalizes base URLs to chat completions endpoints', () => {
    expect(createChatCompletionsUrl(BASE_URL)).toBe(
      'https://custom.example.test/v1/chat/completions'
    );
    expect(createChatCompletionsUrl(`${BASE_URL}/chat/completions`)).toBe(
      'https://custom.example.test/v1/chat/completions'
    );
    expect(createChatCompletionsUrl(`${BASE_URL}/chat/completions/`)).toBe(
      'https://custom.example.test/v1/chat/completions'
    );
  });

  it('rejects missing base URLs', async () => {
    await expect(
      openaiCompatibleProvider.rewrite({
        key: 'sk-test-fake-key-do-not-use',
        model: 'custom-model',
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).rejects.toMatchObject({
      code: 'missing_provider_endpoint',
    });
  });

  it('rejects non-HTTPS non-loopback base URLs', () => {
    expect(() => createChatCompletionsUrl('http://example.test/v1')).toThrow(
      'must use HTTPS unless it is loopback'
    );
  });

  defineChatProviderBehaviorTests({
    provider: openaiCompatibleProvider,
    request: {
      body: {
        max_tokens: 4096,
        messages: [
          {
            content: 'Rewrite email.',
            role: 'system',
          },
          {
            content: '<p>Hello.</p>',
            role: 'user',
          },
        ],
        model: 'custom-model',
        stream: false,
      },
      model: 'custom-model',
      url: 'https://custom.example.test/v1/chat/completions',
    },
    rewriteOptions: {
      baseUrl: BASE_URL,
    },
    testConnectionOptions: {
      baseUrl: BASE_URL,
    },
  });
});
