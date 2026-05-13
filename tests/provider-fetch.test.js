import { describe, expect, it } from 'vitest';

import { fetchProviderJson } from '../src/background/providers/index.js';

describe('provider fetch helper', () => {
  it('enforces omitted credentials and no referrer policy', async () => {
    const calls = [];

    await expect(
      fetchProviderJson('https://api.example.test/v1/chat', {
        credentials: 'include',
        endpointHost: 'api.example.test',
        fetchImpl: async (url, options) => {
          calls.push({ options, url });
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                ok: true,
              };
            },
          };
        },
        referrerPolicy: 'origin',
      })
    ).resolves.toEqual({
      ok: true,
    });

    expect(calls).toEqual([
      {
        options: {
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        },
        url: 'https://api.example.test/v1/chat',
      },
    ]);
  });

  it('rejects endpoint host mismatches before fetch', async () => {
    const calls = [];

    await expect(
      fetchProviderJson('https://api.example.test/v1/chat', {
        endpointHost: 'other.example.test',
        fetchImpl: async () => {
          calls.push('called');
        },
      })
    ).rejects.toMatchObject({
      code: 'provider_host_mismatch',
    });
    expect(calls).toEqual([]);
  });
});
