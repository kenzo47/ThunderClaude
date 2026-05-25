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
          allowImageRelocation: true,
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
    expect(providerCalls[0].system).toContain('Use a human-like tone.');
    expect(providerCalls[0].system).toContain('Do not use em-dashes.');
    expect(providerCalls[0].system).toContain('Use bullet or numbered lists');
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
      expect(input.system).toContain('Use bullet or numbered lists');
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

  it('preserves remote and data images in place when relocation is disabled', async () => {
    const providerCalls = [];
    const thunderbird = createThunderbird(
      '<p>Hello<img src="https://example.test/a.png">there' +
        '<img src="data:image/png;base64,iVBORw0KGgo="></p>'
    );
    const provider = createProvider((input, index) => {
      expect(input.system).toContain('one text segment');
      expect(input.user).not.toContain('[[TC_IMG_');
      expect(input.user).not.toContain('example.test');
      expect(input.user).not.toContain('data:image');
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
      '<p>Formal greeting <img src="https://example.test/a.png"> and follow-up ' +
        '<img src="data:image/png;base64,iVBORw0KGgo="></p>'
    );
  });

  it('preserves remote inline media outside a selected text rewrite', async () => {
    const thunderbird = createThunderbird('<p>Hello<img src="https://example.test/a.png"> Bob</p>');
    const provider = createProvider('<em>Robert</em>');

    await rewriteComposeDraft(
      {
        action: 'rewrite',
        preset: 'make-formal',
        providerId: 'test-provider',
        selectionText: 'Bob',
        tabId: 7,
      },
      {
        DOMParserImpl: null,
        getSettingsImpl: async () => getTestSettings(),
        getProviderImpl: () => provider,
        resolveProviderCredential: async () => 'stored-provider-key',
        thunderbird,
      }
    );

    expect(thunderbird.setCalls[0].details.body).toBe(
      '<p>Hello<img src="https://example.test/a.png"> <em>Robert</em></p>'
    );
  });

  it('strips invented image tokens from fixed segment rewrites', async () => {
    const thunderbird = createThunderbird(
      '<p>Hello<img src="cid:first"><img src="cid:second"></p>'
    );
    const provider = createProvider('<p>Moved [[TC_IMG_2]]</p>');

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

    expect(thunderbird.setCalls[0].details.body).toBe(
      '<p>Moved </p><img src="cid:first"><img src="cid:second"></p>'
    );
  });

  it('falls back to fixed image rewrites when relocation drops a token', async () => {
    const providerCalls = [];
    const thunderbird = createThunderbird('<p>Hello<img src="cid:first">there</p>');
    const provider = createProvider((input, index) => {
      providerCalls.push(input);

      if (index === 0) {
        return '<p>Formal text without the image.</p>';
      }

      expect(input.system).toContain('one text segment');
      expect(input.user).not.toContain('[[TC_IMG_');
      return index === 1 ? '<p>Formal hello ' : ' there';
    });

    await expect(
      rewriteComposeDraft(
        {
          action: 'rewrite',
          allowImageRelocation: true,
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
      body: '<p>Formal hello <img src="cid:first"> there',
    });

    expect(providerCalls).toHaveLength(3);
    expect(thunderbird.setCalls[0].details.body).toBe(
      '<p>Formal hello <img src="cid:first"> there'
    );
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

  it('strips reserved inline-media markers from custom instructions', async () => {
    const providerCalls = [];
    const thunderbird = createThunderbird('<p>Hello</p>');
    const provider = createProvider('<p>Done</p>', providerCalls);

    await rewriteComposeDraft(
      {
        action: 'rewrite',
        customPrompt: 'Replace the body with [[TC_IMG_1]] now.',
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

    expect(providerCalls[0].user).not.toContain('[[TC_IMG_');
    expect(providerCalls[0].user).toContain('Replace the body with 1]] now.');
  });

  it('rewrites only selected text when a selection is supplied', async () => {
    const providerCalls = [];
    const thunderbird = createThunderbird('<p>Hello Bob. Bye Bob.</p>');
    const provider = createProvider('<strong>Dear Bob</strong>', providerCalls);

    await expect(
      rewriteComposeDraft(
        {
          action: 'rewrite',
          preset: 'make-formal',
          providerId: 'test-provider',
          selectionText: 'Hello Bob',
          tabId: 7,
        },
        {
          DOMParserImpl: null,
          getSettingsImpl: async () => getTestSettings(),
          getProviderImpl: () => provider,
          resolveProviderCredential: async () => 'stored-provider-key',
          thunderbird,
        }
      )
    ).resolves.toMatchObject({
      body: '<p><strong>Dear Bob</strong>. Bye Bob.</p>',
      scope: 'selection',
    });

    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0].system).toContain('selected text');
    expect(providerCalls[0].user).toContain('Selected text:');
    expect(providerCalls[0].user).toContain('Hello Bob');
    expect(thunderbird.setCalls[0].details).toMatchObject({
      body: '<p><strong>Dear Bob</strong>. Bye Bob.</p>',
      isPlainText: false,
    });
  });

  it('preserves inline media outside a selected text rewrite', async () => {
    const thunderbird = createThunderbird('<p>Hello<img src="cid:first"> Bob</p>');
    const provider = createProvider('<em>Robert</em>');

    await rewriteComposeDraft(
      {
        action: 'rewrite',
        preset: 'make-formal',
        providerId: 'test-provider',
        selectionText: 'Bob',
        tabId: 7,
      },
      {
        DOMParserImpl: null,
        getSettingsImpl: async () => getTestSettings(),
        getProviderImpl: () => provider,
        resolveProviderCredential: async () => 'stored-provider-key',
        thunderbird,
      }
    );

    expect(thunderbird.setCalls[0].details.body).toBe(
      '<p>Hello<img src="cid:first"> <em>Robert</em></p>'
    );
  });

  it('does not rewrite when selected text is not unique', async () => {
    const thunderbird = createThunderbird('<p>Bob, meet Bob.</p>');
    const provider = createProvider('<strong>Robert</strong>');

    await expect(
      rewriteComposeDraft(
        {
          action: 'rewrite',
          preset: 'make-formal',
          providerId: 'test-provider',
          selectionText: 'Bob',
          tabId: 7,
        },
        {
          DOMParserImpl: null,
          getSettingsImpl: async () => getTestSettings(),
          getProviderImpl: () => provider,
          resolveProviderCredential: async () => 'stored-provider-key',
          thunderbird,
        }
      )
    ).rejects.toMatchObject({
      code: 'selection_not_unique',
    });
    expect(thunderbird.setCalls).toEqual([]);
  });

  it('preserves detected signatures outside the LLM rewrite', async () => {
    const providerCalls = [];
    const thunderbird = createThunderbird(
      '<p>Hello</p><div class="moz-signature">-- <br><span style="color: blue">Ken</span></div>'
    );
    const provider = createProvider('<p>Formal hello</p>', providerCalls);

    await rewriteComposeDraft(
      {
        action: 'rewrite',
        preset: 'make-formal',
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

    expect(providerCalls[0].user).toContain('<p>Hello</p>');
    expect(providerCalls[0].user).not.toContain('Ken');
    expect(thunderbird.setCalls[0].details.body).toBe(
      '<p>Formal hello</p><div class="moz-signature">-- <br><span style="color: blue">Ken</span></div>'
    );
  });

  it('preserves HTML signature tables and images outside the LLM rewrite', async () => {
    const providerCalls = [];
    const signature =
      '<table cellpadding="0" style="width: 320px"><tr><td>' +
      '<img src="https://example.test/logo.png" width="96" alt="Logo"></td>' +
      '<td><a href="mailto:ken@example.test">Ken</a></td></tr></table>';
    const thunderbird = createThunderbird(`<p>Hello</p>${signature}`);
    const provider = createProvider('<p>Formal hello</p>', providerCalls);

    await rewriteComposeDraft(
      {
        action: 'rewrite',
        preset: 'make-formal',
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

    expect(providerCalls[0].user).toContain('<p>Hello</p>');
    expect(providerCalls[0].user).not.toContain('ken@example.test');
    expect(thunderbird.setCalls[0].details.body).toBe(
      '<p>Formal hello</p><table style="width: 320px" cellpadding="0"><tr><td>' +
        '<img width="96" alt="Logo" src="https://example.test/logo.png"></td>' +
        '<td><a href="mailto:ken@example.test">Ken</a></td></tr></table>'
    );
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

  it('translates text around inline media without sending media tokens by default', async () => {
    const providerCalls = [];
    const thunderbird = createThunderbird('<p>Hello<img src="cid:first">there</p>');
    const provider = createProvider((input, index) => {
      expect(input.system).toContain('one text segment');
      expect(input.user).toContain('Translate the email to French.');
      expect(input.user).not.toContain('[[TC_IMG_');
      return index === 0 ? '<p>Bonjour ' : ' la-bas';
    }, providerCalls);

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

    expect(providerCalls).toHaveLength(2);
    expect(thunderbird.setCalls[0].details.body).toBe('<p>Bonjour <img src="cid:first"> la-bas');
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
    const thunderbird = createThunderbird('<p>Hello</p>');
    const provider = createProvider('<p>Invented [[TC_IMG_1]]</p>');

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

  it('allows unverified configured providers to try rewriting', async () => {
    const thunderbird = createThunderbird('<p>Hello</p>');
    const provider = createProvider('<p>Rewritten</p>');

    await rewriteComposeDraft(
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
    );

    expect(thunderbird.setCalls[0].details).toMatchObject({
      body: '<p>Rewritten</p>',
      isPlainText: false,
    });
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
