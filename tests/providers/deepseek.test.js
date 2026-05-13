import { describe, expect, it } from 'vitest';

import deepseekProvider from '../../src/background/providers/deepseek.js';
import { defineChatProviderBehaviorTests } from './chat-provider-test-helper.js';

describe('deepseek provider', () => {
  it('matches the provider contract', () => {
    expect(deepseekProvider).toMatchObject({
      defaultModel: 'deepseek-v4-flash',
      endpointHost: 'api.deepseek.com',
      id: 'deepseek',
      keyHelpUrl: 'https://platform.deepseek.com/api_keys',
      label: 'DeepSeek',
      modelList: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
    });
  });

  defineChatProviderBehaviorTests({
    provider: deepseekProvider,
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
        model: 'deepseek-v4-pro',
        stream: false,
        thinking: {
          type: 'disabled',
        },
      },
      model: 'deepseek-v4-pro',
      url: 'https://api.deepseek.com/chat/completions',
    },
  });
});
