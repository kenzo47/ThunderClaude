import { describe, expect, it } from 'vitest';

import minimaxProvider from '../../src/background/providers/minimax.js';
import { defineChatProviderBehaviorTests } from './chat-provider-test-helper.js';

describe('minimax provider', () => {
  it('matches the provider contract', () => {
    expect(minimaxProvider).toMatchObject({
      defaultModel: 'MiniMax-M2',
      endpointHost: 'api.minimax.io',
      id: 'minimax',
      keyHelpUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
      label: 'MiniMax',
      modelList: [
        'MiniMax-M2',
        'MiniMax-M2.1',
        'MiniMax-M2.1-highspeed',
        'MiniMax-M2.5',
        'MiniMax-M2.5-highspeed',
        'MiniMax-M2.7',
        'MiniMax-M2.7-highspeed',
      ],
    });
  });

  defineChatProviderBehaviorTests({
    provider: minimaxProvider,
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
        model: 'MiniMax-M2.5',
        reasoning_split: true,
        stream: false,
      },
      model: 'MiniMax-M2.5',
      url: 'https://api.minimax.io/v1/chat/completions',
    },
  });
});
