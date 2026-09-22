import { describe, expect, it } from 'vitest';

import anthropicProvider from '../../src/background/providers/anthropic.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

describe('anthropic provider', () => {
  it('matches the provider contract', () => {
    expect(anthropicProvider).toMatchObject({
      defaultModel: 'claude-opus-5',
      endpointHost: 'api.anthropic.com',
      id: 'anthropic',
      keyHelpUrl: 'https://console.anthropic.com/settings/keys',
      label: 'Anthropic',
      modelList: ['claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5', 'claude-haiku-4-5'],
    });
  });

  it('rewrites successfully through the Messages API', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ options, url });
      return jsonResponse({
        content: [
          {
            text: '<p>Rewritten draft.</p>',
            type: 'text',
          },
        ],
      });
    };

    await expect(
      anthropicProvider.rewrite({
        fetchImpl,
        key: 'sk-test-fake-key-do-not-use',
        model: 'claude-sonnet-5',
        system: 'Rewrite email.',
        user: '<p>Hello.</p>',
      })
    ).resolves.toBe('<p>Rewritten draft.</p>');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0].options).toMatchObject({
      credentials: 'omit',
      headers: {
        'anthropic-dangerous-direct-browser-access': 'true',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': 'sk-test-fake-key-do-not-use',
      },
      method: 'POST',
      referrerPolicy: 'no-referrer',
    });
    expect(JSON.parse(calls[0].options.body)).toEqual({
      max_tokens: 4096,
      messages: [
        {
          content: '<p>Hello.</p>',
          role: 'user',
        },
      ],
      model: 'claude-sonnet-5',
      system: 'Rewrite email.',
    });
  });

  it('returns true for a successful test connection', async () => {
    const fetchImpl = async () =>
      jsonResponse({
        content: [{ text: 'OK', type: 'text' }],
      });

    await expect(
      anthropicProvider.testConnection('sk-test-fake-key-do-not-use', { fetchImpl })
    ).resolves.toBe(true);
  });

  it('returns false for a failed test connection', async () => {
    const fetchImpl = async () =>
      jsonResponse(
        {
          error: {
            message: 'invalid x-api-key',
            type: 'authentication_error',
          },
          type: 'error',
        },
        { ok: false, status: 401 }
      );

    await expect(
      anthropicProvider.testConnection('sk-test-fake-key-do-not-use', { fetchImpl })
    ).resolves.toBe(false);
  });

  it('maps 401 responses to authentication errors', async () => {
    const fetchImpl = async () =>
      jsonResponse(
        {
          error: {
            message: 'invalid x-api-key',
            type: 'authentication_error',
          },
          type: 'error',
        },
        { ok: false, status: 401 }
      );

    await expect(
      anthropicProvider.rewrite({
        fetchImpl,
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
    const fetchImpl = async () =>
      jsonResponse(
        {
          error: {
            message: 'rate limited',
            type: 'rate_limit_error',
          },
          type: 'error',
        },
        { ok: false, status: 429 }
      );

    await expect(
      anthropicProvider.rewrite({
        fetchImpl,
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
    const fetchImpl = async () =>
      jsonResponse(
        {
          error: {
            message: 'server failed',
            type: 'api_error',
          },
          type: 'error',
        },
        { ok: false, status: 500 }
      );

    await expect(
      anthropicProvider.rewrite({
        fetchImpl,
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
      anthropicProvider.rewrite({
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
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      async json() {
        throw new SyntaxError('bad json');
      },
    });

    await expect(
      anthropicProvider.rewrite({
        fetchImpl,
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
