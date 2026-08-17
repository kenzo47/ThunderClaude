import { describe, expect, it } from 'vitest';

import xaiProvider from '../../src/background/providers/xai.js';
import { defineChatProviderBehaviorTests } from './chat-provider-test-helper.js';

describe('xai provider', () => {
  it('matches the provider contract', () => {
    expect(xaiProvider).toMatchObject({
      defaultModel: 'grok-4.6',
      endpointHost: 'api.x.ai',
      id: 'xai',
      keyHelpUrl: 'https://console.x.ai/team/default/api-keys',
      label: 'xAI Grok',
      modelList: ['grok-4.6', 'grok-4.5', 'grok-4.1-fast'],
    });
  });

  defineChatProviderBehaviorTests({
    provider: xaiProvider,
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
        model: 'grok-4.5',
        stream: false,
      },
      model: 'grok-4.5',
      url: 'https://api.x.ai/v1/chat/completions',
    },
  });
});
