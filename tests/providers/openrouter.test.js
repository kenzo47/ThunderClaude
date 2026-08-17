import { describe, expect, it } from 'vitest';

import openrouterProvider from '../../src/background/providers/openrouter.js';
import { defineChatProviderBehaviorTests } from './chat-provider-test-helper.js';

describe('openrouter provider', () => {
  it('matches the provider contract', () => {
    expect(openrouterProvider).toMatchObject({
      defaultModel: 'openai/gpt-5.6-sol',
      endpointHost: 'openrouter.ai',
      id: 'openrouter',
      keyHelpUrl: 'https://openrouter.ai/settings/keys',
      label: 'OpenRouter',
      modelList: [
        'openai/gpt-5.6-sol',
        'openai/gpt-5.6-luna',
        'anthropic/claude-opus-5',
        'google/gemini-3.7-flash',
        'x-ai/grok-4.6',
        'z-ai/glm-5.2',
        'custom',
      ],
    });
  });

  defineChatProviderBehaviorTests({
    provider: openrouterProvider,
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
        model: 'anthropic/claude-opus-5',
        stream: false,
      },
      model: 'anthropic/claude-opus-5',
      url: 'https://openrouter.ai/api/v1/chat/completions',
    },
  });
});
