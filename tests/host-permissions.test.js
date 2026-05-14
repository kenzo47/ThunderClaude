import { describe, expect, it } from 'vitest';

import {
  createCustomEndpointOriginPattern,
  ensureCustomEndpointPermission,
} from '../src/lib/host-permissions.js';

describe('host permission helper', () => {
  it('derives the exact origin pattern for custom endpoints', () => {
    expect(createCustomEndpointOriginPattern('https://custom.example.test/v1')).toBe(
      'https://custom.example.test/*'
    );
    expect(createCustomEndpointOriginPattern('https://custom.example.test:8443/v1')).toBe(
      'https://custom.example.test:8443/*'
    );
    expect(createCustomEndpointOriginPattern('http://localhost:11434/v1')).toBe(
      'http://localhost:11434/*'
    );
    expect(createCustomEndpointOriginPattern('http://[::1]:11434/v1')).toBe('http://[::1]:11434/*');
  });

  it('rejects unsupported custom endpoint URLs', () => {
    expect(() => createCustomEndpointOriginPattern('https://custom.example.test/v1?x=1')).toThrow(
      'cannot include query or fragment'
    );
    expect(() => createCustomEndpointOriginPattern('http://custom.example.test/v1')).toThrow(
      'must use HTTPS unless it is loopback'
    );
  });

  it('requests a missing custom endpoint permission', async () => {
    const calls = [];
    const origin = await ensureCustomEndpointPermission(
      'openai-compatible',
      'https://custom.example.test/v1',
      {
        async contains(permission) {
          calls.push(['contains', permission]);
          return false;
        },
        async request(permission) {
          calls.push(['request', permission]);
          return true;
        },
      }
    );

    const permission = {
      origins: ['https://custom.example.test/*'],
    };
    expect(origin).toBe('https://custom.example.test/*');
    expect(calls).toEqual([
      ['contains', permission],
      ['request', permission],
    ]);
  });

  it('skips the permission prompt when the origin is already granted', async () => {
    const calls = [];
    const origin = await ensureCustomEndpointPermission(
      'openai-compatible',
      'https://custom.example.test/v1',
      {
        async contains(permission) {
          calls.push(['contains', permission]);
          return true;
        },
        async request(permission) {
          calls.push(['request', permission]);
          return true;
        },
      }
    );

    expect(origin).toBe('https://custom.example.test/*');
    expect(calls).toEqual([
      [
        'contains',
        {
          origins: ['https://custom.example.test/*'],
        },
      ],
    ]);
  });

  it('does not prompt for the required OpenAI origin', async () => {
    await expect(
      ensureCustomEndpointPermission('openai-compatible', 'https://api.openai.com/v1')
    ).resolves.toBe('https://api.openai.com/*');
  });

  it('fails when the user denies the custom endpoint permission', async () => {
    await expect(
      ensureCustomEndpointPermission('openai-compatible', 'https://custom.example.test/v1', {
        async contains() {
          return false;
        },
        async request() {
          return false;
        },
      })
    ).rejects.toThrow('Allow access to the custom endpoint');
  });

  it('does nothing for fixed-host providers', async () => {
    await expect(
      ensureCustomEndpointPermission('openai', '', {
        async contains() {
          throw new Error('unused');
        },
        async request() {
          throw new Error('unused');
        },
      })
    ).resolves.toBeNull();
  });
});
