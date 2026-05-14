import { describe, expect, it } from 'vitest';

import localLlmsProvider from '../../src/background/providers/local-llms.js';
import {
  jsonResponse,
  providerError,
  successfulChatResponse,
} from './chat-provider-test-helper.js';

function successfulOllamaResponse(text = '<p>Rewritten draft.</p>') {
  return jsonResponse({
    done: true,
    message: {
      content: text,
      role: 'assistant',
    },
    model: 'llama3.2',
  });
}

describe('local llms provider', () => {
  it('matches the provider contract', () => {
    expect(localLlmsProvider).toMatchObject({
      defaultBaseUrl: 'http://localhost:11434',
      defaultModel: 'llama3.2',
      endpointHost: 'localhost',
      id: 'local-llms',
      keyHelpUrl: 'https://lmstudio.ai/docs/app/api/endpoints/openai/',
      label: 'Local LLMs',
      modelList: ['llama3.2', 'gemma3', 'qwen3', 'mistral', 'custom'],
    });
  });

  it('rewrites through Ollama by default', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ options, url });
      return successfulOllamaResponse();
    };

    await expect(
      localLlmsProvider.rewrite({
        fetchImpl,
        model: 'llama3.2',
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).resolves.toBe('<p>Rewritten draft.</p>');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://localhost:11434/api/chat');
    expect(JSON.parse(calls[0].options.body)).toEqual({
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
      model: 'llama3.2',
      stream: false,
      think: false,
    });
  });

  it('rewrites through LM Studio with an OpenAI-compatible base URL', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ options, url });
      return successfulChatResponse();
    };

    await expect(
      localLlmsProvider.rewrite({
        baseUrl: 'http://localhost:1234/v1',
        fetchImpl,
        model: 'local-model',
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).resolves.toBe('<p>Rewritten draft.</p>');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://localhost:1234/v1/chat/completions');
    expect(JSON.parse(calls[0].options.body)).toEqual({
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
      model: 'local-model',
      stream: false,
    });
  });

  it('returns true for a successful test connection without an API key', async () => {
    const calls = [];

    await expect(
      localLlmsProvider.testConnection('', {
        fetchImpl: async (url, options) => {
          calls.push({ options, url });
          return jsonResponse({
            models: [],
          });
        },
      })
    ).resolves.toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://localhost:11434/api/tags');
    expect(calls[0].options.method).toBe('GET');
  });

  it('tests LM Studio through the OpenAI-compatible models endpoint', async () => {
    const calls = [];

    await expect(
      localLlmsProvider.testConnection('', {
        baseUrl: 'http://localhost:1234/v1',
        fetchImpl: async (url, options) => {
          calls.push({ options, url });
          return jsonResponse({
            data: [],
          });
        },
      })
    ).resolves.toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://localhost:1234/v1/models');
    expect(calls[0].options.method).toBe('GET');
  });

  it('returns false when an API key is supplied', async () => {
    await expect(
      localLlmsProvider.testConnection('sk-test-fake-key-do-not-use', {
        fetchImpl: async () => successfulOllamaResponse('OK'),
      })
    ).resolves.toBe(false);
  });

  it('returns false for a failed test connection', async () => {
    await expect(
      localLlmsProvider.testConnection('', {
        fetchImpl: async () => providerError(500, 'local model unavailable', 'server_error'),
      })
    ).resolves.toBe(false);
  });

  it('maps provider errors', async () => {
    await expect(
      localLlmsProvider.rewrite({
        fetchImpl: async () => providerError(429, 'rate limited', 'rate_limit_error'),
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).rejects.toMatchObject({
      code: 'rate_limit_error',
      status: 429,
    });
  });

  it('maps aborted requests to network timeout errors', async () => {
    const fetchImpl = async () => {
      const error = new Error('request timed out');
      error.name = 'AbortError';
      throw error;
    };

    await expect(
      localLlmsProvider.rewrite({
        fetchImpl,
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).rejects.toMatchObject({
      code: 'network_timeout',
    });
  });

  it('rejects malformed JSON responses', async () => {
    await expect(
      localLlmsProvider.rewrite({
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          async json() {
            throw new SyntaxError('bad json');
          },
        }),
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).rejects.toMatchObject({
      code: 'malformed_json',
      status: 200,
    });
  });

  it('rejects responses without assistant text', async () => {
    await expect(
      localLlmsProvider.rewrite({
        fetchImpl: async () => jsonResponse({ done: true, message: { role: 'assistant' } }),
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).rejects.toMatchObject({
      code: 'empty_response',
    });
  });
});
