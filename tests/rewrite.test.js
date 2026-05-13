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
      return output;
    },
  };
}

function getTestSettings() {
  return {
    customBaseUrlByProvider: {},
    defaultModelByProvider: {},
    defaultProviderId: 'test-provider',
    keyModeByProvider: {},
    keySalt: null,
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
