import { describe, expect, it } from 'vitest';

import { createMessageRouter, rewriteComposeDraft } from '../src/background/rewrite.js';

function createThunderbird(body) {
  const setCalls = [];

  return {
    compose: {
      async getComposeDetails(tabId) {
        return {
          body,
          isPlainText: false,
          tabId,
        };
      },
      async setComposeDetails(tabId, details) {
        setCalls.push({ details, tabId });
      },
    },
    setCalls,
  };
}

function createProvider(output, calls = []) {
  return {
    defaultModel: 'test-model',
    async rewrite(input) {
      calls.push(input);
      return typeof output === 'function' ? output(input, calls.length - 1) : output;
    },
  };
}

function getTestSettings() {
  return {
    customBaseUrlByProvider: {},
    defaultModelByProvider: {},
    defaultProviderId: 'test-provider',
    enabledLocalProviderIds: {},
    keyModeByProvider: {},
    onboardingComplete: true,
    verifiedProviderIds: {
      'test-provider': true,
    },
  };
}

describe('rewrite orchestrator', () => {
  it('rewrites, sanitizes, restores inline media, and updates compose details', async () => {
    const providerCalls = [];
    const thunderbird = createThunderbird('<p>Hello<img src="cid:first"></p>');
    const provider = createProvider(
      '<div onclick="bad()">Formal [[TC_IMG_1]]</div><script>alert(1)</script>',
      providerCalls
    );

    await expect(
      rewriteComposeDraft(
        {
          action: 'rewrite',
          modelId: 'chosen-model',
          preset: 'make-formal',
          providerId: 'test-provider',
          tabId: 42,
        },
        {
          getSettingsImpl: async () => getTestSettings(),
          getProviderImpl: () => provider,
          resolveProviderCredential: async () => 'stored-provider-key',
          thunderbird,
        }
      )
    ).resolves.toMatchObject({
      body: '<div>Formal <img src="cid:first"></div>',
      model: 'chosen-model',
      providerId: 'test-provider',
    });

    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]).toMatchObject({
      key: 'stored-provider-key',
      model: 'chosen-model',
    });
    expect(providerCalls[0].system).toContain('Preserve every [[TC_IMG_N]] token exactly once.');
    expect(providerCalls[0].system).toContain('You may move the tokens to better locations');
    expect(providerCalls[0].user).toContain('Rewrite the email in a more formal');
    expect(providerCalls[0].user).toContain('<p>Hello[[TC_IMG_1]]</p>');
    expect(thunderbird.setCalls).toEqual([
      {
        details: {
          body: '<div>Formal <img src="cid:first"></div>',
          isPlainText: false,
        },
        tabId: 42,
      },
    ]);
  });

  it('rewrites segments around inline media when relocation is disabled', async () => {
    const providerCalls = [];
    const thunderbird = createThunderbird(
      '<p>Hello<img src="cid:first">there<img src="cid:second"></p>'
    );
    const provider = createProvider((input, index) => {
      expect(input.system).toContain('one text segment');
      expect(input.user).not.toContain('[[TC_IMG_');
      return index === 0 ? '<p>Formal greeting ' : ' and follow-up ';
    }, providerCalls);

    await rewriteComposeDraft(
      {
        action: 'rewrite',
        allowImageRelocation: false,
        preset: 'make-formal',
        providerId: 'test-provider',
        tabId: 42,
      },
      {
        getSettingsImpl: async () => getTestSettings(),
        getProviderImpl: () => provider,
        resolveProviderCredential: async () => 'stored-provider-key',
        thunderbird,
      }
    );

    expect(providerCalls).toHaveLength(2);
    expect(thunderbird.setCalls[0].details.body).toBe(
      '<p>Formal greeting <img src="cid:first"> and follow-up <img src="cid:second"></p>'
    );
  });

  it('fails closed when a fixed segment rewrite invents image tokens', async () => {
    const thunderbird = createThunderbird(
      '<p>Hello<img src="cid:first"><img src="cid:second"></p>'
    );
    const provider = createProvider('<p>Moved [[TC_IMG_2]]</p>');

    await expect(
      rewriteComposeDraft(
        {
          action: 'rewrite',
          allowImageRelocation: false,
          preset: 'make-formal',
          providerId: 'test-provider',
          tabId: 42,
        },
        {
          getSettingsImpl: async () => getTestSettings(),
          getProviderImpl: () => provider,
          resolveProviderCredential: async () => 'stored-provider-key',
          thunderbird,
        }
      )
    ).rejects.toMatchObject({
      code: 'inline_media_token_mismatch',
    });
    expect(thunderbird.setCalls).toEqual([]);
  });

  it('uses custom instructions when supplied', async () => {
    const providerCalls = [];
    const thunderbird = createThunderbird('<p>Hello</p>');
    const provider = createProvider('<p>Bonjour</p>', providerCalls);

    await rewriteComposeDraft(
      {
        action: 'rewrite',
        customPrompt: 'Translate this to French.',
        providerId: 'test-provider',
        tabId: 7,
      },
      {
        getSettingsImpl: async () => getTestSettings(),
        getProviderImpl: () => provider,
        resolveProviderCredential: async () => 'stored-provider-key',
        thunderbird,
      }
    );

    expect(providerCalls[0].user).toContain('Translate this to French.');
    expect(thunderbird.setCalls[0].details.body).toBe('<p>Bonjour</p>');
  });

  it('builds translate instructions with a target language', async () => {
    const providerCalls = [];
    const thunderbird = createThunderbird('<p>Hello</p>');
    const provider = createProvider('<p>Bonjour</p>', providerCalls);

    await rewriteComposeDraft(
      {
        action: 'rewrite',
        preset: 'translate',
        providerId: 'test-provider',
        tabId: 7,
        targetLanguage: 'French',
      },
      {
        getSettingsImpl: async () => getTestSettings(),
        getProviderImpl: () => provider,
        resolveProviderCredential: async () => 'stored-provider-key',
        thunderbird,
      }
    );

    expect(providerCalls[0].user).toContain('Translate the email to French.');
    expect(thunderbird.setCalls[0].details.body).toBe('<p>Bonjour</p>');
  });

  it('requires a target language for translate', async () => {
    const thunderbird = createThunderbird('<p>Hello</p>');
    const provider = createProvider('<p>Unused</p>');

    await expect(
      rewriteComposeDraft(
        {
          action: 'rewrite',
          preset: 'translate',
          providerId: 'test-provider',
          tabId: 7,
        },
        {
          getSettingsImpl: async () => getTestSettings(),
          getProviderImpl: () => provider,
          resolveProviderCredential: async () => 'stored-provider-key',
          thunderbird,
        }
      )
    ).rejects.toMatchObject({
      code: 'missing_target_language',
    });
  });

  it('builds reply-draft instructions from selected text', async () => {
    const providerCalls = [];
    const thunderbird = createThunderbird('<p>My notes</p>');
    const provider = createProvider('<p>Thanks, Tuesday works.</p>', providerCalls);

    await rewriteComposeDraft(
      {
        action: 'rewrite',
        preset: 'reply-draft',
        providerId: 'test-provider',
        selectionText: 'Can we move the meeting to Tuesday?',
        tabId: 7,
      },
      {
        getSettingsImpl: async () => getTestSettings(),
        getProviderImpl: () => provider,
        resolveProviderCredential: async () => 'stored-provider-key',
        thunderbird,
      }
    );

    expect(providerCalls[0].user).toContain('Draft a clear, helpful reply');
    expect(providerCalls[0].user).toContain('Can we move the meeting to Tuesday?');
    expect(thunderbird.setCalls[0].details.body).toBe('<p>Thanks, Tuesday works.</p>');
  });

  it('requires selected text for reply-draft', async () => {
    const thunderbird = createThunderbird('<p>Hello</p>');
    const provider = createProvider('<p>Unused</p>');

    await expect(
      rewriteComposeDraft(
        {
          action: 'rewrite',
          preset: 'reply-draft',
          providerId: 'test-provider',
          selectionText: '   ',
          tabId: 7,
        },
        {
          getSettingsImpl: async () => getTestSettings(),
          getProviderImpl: () => provider,
          resolveProviderCredential: async () => 'stored-provider-key',
          thunderbird,
        }
      )
    ).rejects.toMatchObject({
      code: 'missing_reply_selection',
    });
  });

  it('does not overwrite the draft when inline media validation fails', async () => {
    const thunderbird = createThunderbird('<p>Hello<img src="cid:first"></p>');
    const provider = createProvider('<p>AI dropped the image.</p>');

    await expect(
      rewriteComposeDraft(
        {
          action: 'rewrite',
          preset: 'shorten',
          providerId: 'test-provider',
          tabId: 42,
        },
        {
          getSettingsImpl: async () => getTestSettings(),
          getProviderImpl: () => provider,
          resolveProviderCredential: async () => 'stored-provider-key',
          thunderbird,
        }
      )
    ).rejects.toMatchObject({
      code: 'inline_media_token_mismatch',
    });
    expect(thunderbird.setCalls).toEqual([]);
  });

  it('requires a preset or custom instruction', async () => {
    const thunderbird = createThunderbird('<p>Hello</p>');
    const provider = createProvider('<p>Unused</p>');

    await expect(
      rewriteComposeDraft(
        {
          action: 'rewrite',
          providerId: 'test-provider',
          tabId: 42,
        },
        {
          getSettingsImpl: async () => getTestSettings(),
          getProviderImpl: () => provider,
          resolveProviderCredential: async () => 'stored-provider-key',
          thunderbird,
        }
      )
    ).rejects.toMatchObject({
      code: 'missing_rewrite_instruction',
    });
  });

  it('requires onboarding before rewriting drafts', async () => {
    const thunderbird = createThunderbird('<p>Hello</p>');
    const provider = createProvider('<p>Unused</p>');

    await expect(
      rewriteComposeDraft(
        {
          action: 'rewrite',
          preset: 'shorten',
          providerId: 'test-provider',
          tabId: 42,
        },
        {
          getSettingsImpl: async () => ({
            ...getTestSettings(),
            onboardingComplete: false,
          }),
          getProviderImpl: () => provider,
          resolveProviderCredential: async () => 'stored-provider-key',
          thunderbird,
        }
      )
    ).rejects.toMatchObject({
      code: 'onboarding_required',
    });
  });

  it('requires explicit local access before rewriting with Local LLMs', async () => {
    const thunderbird = createThunderbird('<p>Hello</p>');
    const provider = {
      ...createProvider('<p>Unused</p>'),
      defaultBaseUrl: 'http://localhost:11434/api',
    };

    await expect(
      rewriteComposeDraft(
        {
          action: 'rewrite',
          preset: 'shorten',
          providerId: 'local-llms',
          tabId: 42,
        },
        {
          getSettingsImpl: async () => ({
            ...getTestSettings(),
            defaultProviderId: 'local-llms',
            verifiedProviderIds: {
              'local-llms': true,
            },
          }),
          getProviderImpl: () => provider,
          resolveProviderCredential: async () => '',
          thunderbird,
        }
      )
    ).rejects.toMatchObject({
      code: 'local_provider_not_enabled',
    });
    expect(thunderbird.setCalls).toEqual([]);
  });

  it('requires the selected provider to be verified before rewriting', async () => {
    const thunderbird = createThunderbird('<p>Hello</p>');
    const provider = createProvider('<p>Unused</p>');

    await expect(
      rewriteComposeDraft(
        {
          action: 'rewrite',
          preset: 'shorten',
          providerId: 'test-provider',
          tabId: 42,
        },
        {
          getSettingsImpl: async () => ({
            ...getTestSettings(),
            verifiedProviderIds: {
              'test-provider': false,
            },
          }),
          getProviderImpl: () => provider,
          resolveProviderCredential: async () => 'stored-provider-key',
          thunderbird,
        }
      )
    ).rejects.toMatchObject({
      code: 'provider_not_verified',
    });
    expect(thunderbird.setCalls).toEqual([]);
  });

  it('rejects custom endpoint overrides that were not saved and tested', async () => {
    const thunderbird = createThunderbird('<p>Hello</p>');
    const provider = createProvider('<p>Unused</p>');

    await expect(
      rewriteComposeDraft(
        {
          action: 'rewrite',
          baseUrl: 'https://other.example.test/v1',
          preset: 'shorten',
          providerId: 'test-provider',
          tabId: 42,
        },
        {
          getSettingsImpl: async () => ({
            ...getTestSettings(),
            customBaseUrlByProvider: {
              'test-provider': 'https://saved.example.test/v1',
            },
          }),
          getProviderImpl: () => provider,
          resolveProviderCredential: async () => 'stored-provider-key',
          thunderbird,
        }
      )
    ).rejects.toMatchObject({
      code: 'provider_endpoint_not_verified',
    });
    expect(thunderbird.setCalls).toEqual([]);
  });
});

describe('runtime message router', () => {
  it('returns a structured success response for rewrite messages', async () => {
    const thunderbird = createThunderbird('<p>Hello</p>');
    const provider = createProvider('<p>Rewritten</p>');
    const router = createMessageRouter({
      getSettingsImpl: async () => getTestSettings(),
      getProviderImpl: () => provider,
      resolveProviderCredential: async () => 'stored-provider-key',
      thunderbird,
    });

    await expect(
      router({
        action: 'rewrite',
        preset: 'fix-grammar',
        providerId: 'test-provider',
        tabId: 1,
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        body: '<p>Rewritten</p>',
      },
    });
  });

  it('returns a structured error response for rewrite failures', async () => {
    const router = createMessageRouter({
      thunderbird: {
        compose: {},
      },
    });

    await expect(
      router({
        action: 'rewrite',
      })
    ).resolves.toEqual({
      error: {
        code: 'missing_compose_tab',
        message: 'A compose tab id is required.',
      },
      ok: false,
    });
  });

  it('ignores unrelated messages', async () => {
    const router = createMessageRouter();

    await expect(router({ action: 'other' })).resolves.toBeUndefined();
  });
});
