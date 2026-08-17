import { describe, expect, it } from 'vitest';

import zaiProvider from '../../src/background/providers/zai.js';
import { defineChatProviderBehaviorTests } from './chat-provider-test-helper.js';

describe('zai provider', () => {
  it('matches the provider contract', () => {
    expect(zaiProvider).toMatchObject({
      defaultModel: 'glm-5.2',
      endpointHost: 'api.z.ai',
      id: 'zai',
      keyHelpUrl: 'https://z.ai/manage-apikey/apikey-list',
      label: 'Z.ai GLM',
      modelList: ['glm-5.2', 'glm-5.1', 'glm-5-turbo', 'glm-4.7-flash'],
    });
  });

  defineChatProviderBehaviorTests({
    provider: zaiProvider,
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
        model: 'glm-5.1',
        stream: false,
      },
      model: 'glm-5.1',
      url: 'https://api.z.ai/api/paas/v4/chat/completions',
    },
  });
});
