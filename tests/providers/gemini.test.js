import { describe, expect, it } from 'vitest';

import geminiProvider from '../../src/background/providers/gemini.js';

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
    candidates: [
      {
        content: {
          parts: [
            {
              text,
            },
          ],
          role: 'model',
        },
      },
    ],
  });
}

function providerError(status, message, type) {
  return jsonResponse(
    {
      error: {
        message,
        status: type,
      },
    },
    { ok: false, status }
  );
}

describe('gemini provider', () => {
  it('matches the provider contract', () => {
    expect(geminiProvider).toMatchObject({
      defaultModel: 'gemini-2.5-pro',
      endpointHost: 'generativelanguage.googleapis.com',
      id: 'gemini',
      keyHelpUrl: 'https://aistudio.google.com/app/apikey',
      label: 'Google Gemini',
      modelList: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    });
  });

  it('rewrites successfully through the generateContent API', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ options, url });
      return successfulResponse();
    };

    await expect(
      geminiProvider.rewrite({
        fetchImpl,
        key: 'sk-test-fake-key-do-not-use',
        model: 'gemini-2.5-flash',
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).resolves.toBe('<p>Rewritten draft.</p>');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
    );
    expect(calls[0].options).toMatchObject({
      credentials: 'omit',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': 'sk-test-fake-key-do-not-use',
      },
      method: 'POST',
      referrerPolicy: 'no-referrer',
    });
    expect(JSON.parse(calls[0].options.body)).toEqual({
      contents: [
        {
          parts: [
            {
              text: '<p>Hello.</p>',
            },
          ],
          role: 'user',
        },
      ],
      generationConfig: {
        maxOutputTokens: 4096,
      },
      system_instruction: {
        parts: {
          text: 'Rewrite email.',
        },
      },
    });
  });

  it('returns true for a successful test connection', async () => {
    await expect(
      geminiProvider.testConnection('sk-test-fake-key-do-not-use', {
        fetchImpl: async () => successfulResponse('OK'),
      })
    ).resolves.toBe(true);
  });

  it('returns false for a failed test connection', async () => {
    await expect(
      geminiProvider.testConnection('sk-test-fake-key-do-not-use', {
        fetchImpl: async () => providerError(401, 'invalid api key', 'UNAUTHENTICATED'),
      })
    ).resolves.toBe(false);
  });

  it('maps 401 responses to authentication errors', async () => {
    await expect(
      geminiProvider.rewrite({
        fetchImpl: async () => providerError(401, 'invalid api key', 'UNAUTHENTICATED'),
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
      geminiProvider.rewrite({
        fetchImpl: async () => providerError(429, 'rate limited', 'RESOURCE_EXHAUSTED'),
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
      geminiProvider.rewrite({
        fetchImpl: async () => providerError(500, 'server failed', 'INTERNAL'),
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
      geminiProvider.rewrite({
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
      geminiProvider.rewrite({
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
