import { expect, it } from 'vitest';

export function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

export function successfulChatResponse(text = '<p>Rewritten draft.</p>') {
  return jsonResponse({
    choices: [
      {
        message: {
          content: text,
          role: 'assistant',
        },
      },
    ],
  });
}

export function providerError(status, message, type) {
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

export function defineChatProviderBehaviorTests({
  expectedHeaders = {
    authorization: 'Bearer sk-test-fake-key-do-not-use',
    'content-type': 'application/json',
  },
  provider,
  request,
  rewriteOptions = {},
  testConnectionOptions = {},
}) {
  it('rewrites successfully through chat completions', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ options, url });
      return successfulChatResponse();
    };

    await expect(
      provider.rewrite({
        fetchImpl,
        key: 'sk-test-fake-key-do-not-use',
        model: request.model,
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
        ...rewriteOptions,
      })
    ).resolves.toBe('<p>Rewritten draft.</p>');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(request.url);
    expect(calls[0].options).toMatchObject({
      credentials: 'omit',
      headers: expectedHeaders,
      method: 'POST',
      referrerPolicy: 'no-referrer',
    });
    expect(JSON.parse(calls[0].options.body)).toEqual(request.body);
  });

  it('returns true for a successful test connection', async () => {
    await expect(
      provider.testConnection('sk-test-fake-key-do-not-use', {
        fetchImpl: async () => successfulChatResponse('OK'),
        ...testConnectionOptions,
      })
    ).resolves.toBe(true);
  });

  it('returns false for a failed test connection', async () => {
    await expect(
      provider.testConnection('sk-test-fake-key-do-not-use', {
        fetchImpl: async () => providerError(401, 'invalid api key', 'authentication_error'),
        ...testConnectionOptions,
      })
    ).resolves.toBe(false);
  });

  it('throws failed test connection errors when requested', async () => {
    await expect(
      provider.testConnection('sk-test-fake-key-do-not-use', {
        fetchImpl: async () => providerError(401, 'invalid api key', 'authentication_error'),
        throwOnError: true,
        ...testConnectionOptions,
      })
    ).rejects.toMatchObject({
      code: 'authentication_error',
      status: 401,
    });
  });

  it('maps 401 responses to authentication errors', async () => {
    await expect(
      provider.rewrite({
        fetchImpl: async () => providerError(401, 'invalid api key', 'authentication_error'),
        key: 'sk-test-fake-key-do-not-use',
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
        ...rewriteOptions,
      })
    ).rejects.toMatchObject({
      code: 'authentication_error',
      status: 401,
    });
  });

  it('maps 429 responses to rate-limit errors', async () => {
    await expect(
      provider.rewrite({
        fetchImpl: async () => providerError(429, 'rate limited', 'rate_limit_error'),
        key: 'sk-test-fake-key-do-not-use',
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
        ...rewriteOptions,
      })
    ).rejects.toMatchObject({
      code: 'rate_limit_error',
      status: 429,
    });
  });

  it('maps 5xx responses to server errors', async () => {
    await expect(
      provider.rewrite({
        fetchImpl: async () => providerError(500, 'server failed', 'server_error'),
        key: 'sk-test-fake-key-do-not-use',
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
        ...rewriteOptions,
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
      provider.rewrite({
        fetchImpl,
        key: 'sk-test-fake-key-do-not-use',
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
        ...rewriteOptions,
      })
    ).rejects.toMatchObject({
      code: 'network_timeout',
    });
  });

  it('rejects malformed JSON responses', async () => {
    await expect(
      provider.rewrite({
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
        ...rewriteOptions,
      })
    ).rejects.toMatchObject({
      code: 'malformed_json',
      status: 200,
    });
  });
}
