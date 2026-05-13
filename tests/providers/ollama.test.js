import { describe, expect, it } from 'vitest';

import ollamaProvider from '../../src/background/providers/ollama.js';
import { jsonResponse, providerError } from './chat-provider-test-helper.js';

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

describe('ollama provider', () => {
  it('matches the provider contract', () => {
    expect(ollamaProvider).toMatchObject({
      defaultModel: 'llama3.2',
      endpointHost: 'localhost',
      id: 'ollama',
      keyHelpUrl: 'https://ollama.com/download',
      label: 'Ollama',
      modelList: ['llama3.2', 'gemma3', 'qwen3', 'mistral', 'custom'],
    });
  });

  it('rewrites successfully through the local chat endpoint', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ options, url });
      return successfulOllamaResponse();
    };

    await expect(
      ollamaProvider.rewrite({
        fetchImpl,
        model: 'llama3.2',
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).resolves.toBe('<p>Rewritten draft.</p>');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://localhost:11434/api/chat');
    expect(calls[0].options).toMatchObject({
      credentials: 'omit',
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      referrerPolicy: 'no-referrer',
    });
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

  it('returns true for a successful test connection without an API key', async () => {
    await expect(
      ollamaProvider.testConnection('', {
        fetchImpl: async () => successfulOllamaResponse('OK'),
      })
    ).resolves.toBe(true);
  });

  it('returns false when an API key is supplied', async () => {
    await expect(
      ollamaProvider.testConnection('sk-test-fake-key-do-not-use', {
        fetchImpl: async () => successfulOllamaResponse('OK'),
      })
    ).resolves.toBe(false);
  });

  it('returns false for a failed test connection', async () => {
    await expect(
      ollamaProvider.testConnection('', {
        fetchImpl: async () => providerError(500, 'ollama unavailable', 'server_error'),
      })
    ).resolves.toBe(false);
  });

  it('maps 401 responses to authentication errors', async () => {
    await expect(
      ollamaProvider.rewrite({
        fetchImpl: async () => providerError(401, 'invalid api key', 'authentication_error'),
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).rejects.toMatchObject({
      code: 'authentication_error',
      status: 401,
    });
  });

  it('maps 429 responses to rate-limit errors', async () => {
    await expect(
      ollamaProvider.rewrite({
        fetchImpl: async () => providerError(429, 'rate limited', 'rate_limit_error'),
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).rejects.toMatchObject({
      code: 'rate_limit_error',
      status: 429,
    });
  });

  it('maps 5xx responses to server errors', async () => {
    await expect(
      ollamaProvider.rewrite({
        fetchImpl: async () => providerError(500, 'server failed', 'server_error'),
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).rejects.toMatchObject({
      code: 'server_error',
      status: 500,
    });
  });

  it('maps aborted requests to network timeout errors', async () => {
    const fetchImpl = async () => {
      const error = new Error('request timed out');
      error.name = 'AbortError';
      throw error;
    };

    await expect(
      ollamaProvider.rewrite({
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
      ollamaProvider.rewrite({
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
      ollamaProvider.rewrite({
        fetchImpl: async () => jsonResponse({ done: true, message: { role: 'assistant' } }),
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).rejects.toMatchObject({
      code: 'empty_response',
    });
  });
});
