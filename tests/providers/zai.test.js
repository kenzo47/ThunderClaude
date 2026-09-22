import { describe, expect, it } from 'vitest';

import zaiProvider from '../../src/background/providers/zai.js';
import { defineChatProviderBehaviorTests } from './chat-provider-test-helper.js';

describe('zai provider', () => {
  it('matches the provider contract', () => {
    expect(zaiProvider).toMatchObject({
      defaultModel: 'glm-5.3',
      endpointHost: 'api.z.ai',
      id: 'zai',
      keyHelpUrl: 'https://z.ai/manage-apikey/apikey-list',
      label: 'Z.ai GLM',
      modelList: ['glm-5.3', 'glm-5.3-flash', 'glm-5.3-flashx', 'glm-5.2'],
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
        model: 'glm-5.2',
        stream: false,
      },
      model: 'glm-5.2',
      url: 'https://api.z.ai/api/paas/v4/chat/completions',
    },
  });
});
