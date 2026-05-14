import { describe, expect, it } from 'vitest';

import openaiProvider from '../../src/background/providers/openai.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

function successfulResponse(text = '<p>Rewritten draft.</p>') {
  return jsonResponse({
    output: [
      {
        content: [
          {
            text,
            type: 'output_text',
          },
        ],
        role: 'assistant',
        type: 'message',
      },
    ],
  });
}

function providerError(status, message, type) {
  return jsonResponse(
    {
      error: {
        message,
        type,
      },
    },
    { ok: false, status }
  );
}

describe('openai provider', () => {
  it('matches the provider contract', () => {
    expect(openaiProvider).toMatchObject({
      defaultModel: 'gpt-5.5',
      endpointHost: 'api.openai.com',
      id: 'openai',
      keyHelpUrl: 'https://platform.openai.com/api-keys',
      label: 'OpenAI',
      modelList: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-4.1-nano'],
    });
  });

  it('rewrites successfully through the Responses API', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ options, url });
      return successfulResponse();
    };

    await expect(
      openaiProvider.rewrite({
        fetchImpl,
        key: 'sk-test-fake-key-do-not-use',
        model: 'gpt-5.4-mini',
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).resolves.toBe('<p>Rewritten draft.</p>');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.openai.com/v1/responses');
    expect(calls[0].options).toMatchObject({
      credentials: 'omit',
      headers: {
        authorization: 'Bearer sk-test-fake-key-do-not-use',
        'content-type': 'application/json',
      },
      method: 'POST',
      referrerPolicy: 'no-referrer',
    });
    expect(JSON.parse(calls[0].options.body)).toEqual({
      input: '<p>Hello.</p>',
      instructions: 'Rewrite email.',
      max_output_tokens: 4096,
      model: 'gpt-5.4-mini',
      store: false,
    });
  });

  it('returns true for a successful test connection', async () => {
    await expect(
      openaiProvider.testConnection('sk-test-fake-key-do-not-use', {
        fetchImpl: async () => successfulResponse('OK'),
      })
    ).resolves.toBe(true);
  });

  it('returns false for a failed test connection', async () => {
    await expect(
      openaiProvider.testConnection('sk-test-fake-key-do-not-use', {
        fetchImpl: async () => providerError(401, 'invalid api key', 'invalid_request_error'),
      })
    ).resolves.toBe(false);
  });

  it('maps 401 responses to authentication errors', async () => {
    await expect(
      openaiProvider.rewrite({
        fetchImpl: async () => providerError(401, 'invalid api key', 'invalid_request_error'),
        key: 'sk-test-fake-key-do-not-use',
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
      openaiProvider.rewrite({
        fetchImpl: async () => providerError(429, 'rate limited', 'rate_limit_exceeded'),
        key: 'sk-test-fake-key-do-not-use',
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
      openaiProvider.rewrite({
        fetchImpl: async () => providerError(500, 'server failed', 'server_error'),
        key: 'sk-test-fake-key-do-not-use',
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
      openaiProvider.rewrite({
        fetchImpl,
        key: 'sk-test-fake-key-do-not-use',
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).rejects.toMatchObject({
      code: 'network_timeout',
    });
  });

  it('rejects malformed JSON responses', async () => {
    await expect(
      openaiProvider.rewrite({
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          async json() {
            throw new SyntaxError('bad json');
          },
        }),
        key: 'sk-test-fake-key-do-not-use',
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).rejects.toMatchObject({
      code: 'malformed_json',
      status: 200,
    });
  });
});
