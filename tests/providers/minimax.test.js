import { describe, expect, it } from 'vitest';

import minimaxProvider from '../../src/background/providers/minimax.js';
import { defineChatProviderBehaviorTests } from './chat-provider-test-helper.js';

describe('minimax provider', () => {
  it('matches the provider contract', () => {
    expect(minimaxProvider).toMatchObject({
      defaultModel: 'MiniMax-M2.7',
      endpointHost: 'api.minimax.io',
      id: 'minimax',
      keyHelpUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
      label: 'MiniMax',
      modelList: [
        'MiniMax-M2.7',
        'MiniMax-M2.7-highspeed',
        'MiniMax-M2.5',
        'MiniMax-M2.5-highspeed',
        'MiniMax-M2.1',
        'MiniMax-M2.1-highspeed',
        'MiniMax-M2',
      ],
    });
  });

  defineChatProviderBehaviorTests({
    provider: minimaxProvider,
    request: {
      body: {
        max_completion_tokens: 2048,
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
        model: 'MiniMax-M2.5',
        reasoning_split: true,
        stream: false,
      },
      model: 'MiniMax-M2.5',
      url: 'https://api.minimax.io/v1/chat/completions',
    },
  });

  it('uses a non-reasoning smoke request for connection tests', async () => {
    const calls = [];

    await expect(
      minimaxProvider.testConnection('sk-test-fake-key-do-not-use', {
        fetchImpl: async (url, options) => {
          calls.push({ options, url });
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                choices: [
                  {
                    message: {
                      content: 'OK',
                      role: 'assistant',
                    },
                  },
                ],
              };
            },
          };
        },
      })
    ).resolves.toBe(true);

    expect(JSON.parse(calls[0].options.body)).toMatchObject({
      max_completion_tokens: 64,
      reasoning_split: false,
    });
  });
});
