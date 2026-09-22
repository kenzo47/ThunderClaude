import { describe, expect, it } from 'vitest';

import { JSDOM } from 'jsdom';

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

  it('keeps a full-mail image whose data URL type is outside the sanitizer allowlist', async () => {
    // Regression: data:image/jpg (and svg, avif, etc.) are not in the sanitizer
    // image allowlist, so re-sanitizing the restored body used to delete them.
    // The user's image markup must now be restored verbatim and left in place.
    const providerCalls = [];
    const thunderbird = createThunderbird(
      '<p>Hello <img src="data:image/jpg;base64,QQ=="> world</p>'
    );
    const provider = createProvider((input, index) => {
      expect(input.user).not.toContain('data:image');
      return index === 0 ? '<p>Formal hello ' : ' world</p>';
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

    expect(thunderbird.setCalls[0].details.body).toBe(
      '<p>Formal hello <img src="data:image/jpg;base64,QQ=="> world</p>'
    );
  });

  it('strips images the model invents during a full rewrite', async () => {
    const thunderbird = createThunderbird('<p>Hello world</p>');
    const provider = createProvider('<p>Hi <img src="https://evil.test/x.png"> there</p>');

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

    expect(thunderbird.setCalls[0].details.body).not.toContain('evil.test');
    expect(thunderbird.setCalls[0].details.body).toContain('Hi');
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
    expect(providerCalls[0].user).toContain('Selected HTML:');
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

  it('rejects a selection that spans an image when no DOMParser is available', async () => {
    const providerCalls = [];
    const thunderbird = createThunderbird('<p>Hello<img src="cid:first"> Bob</p>');
    const provider = createProvider('<em>Robert</em>', providerCalls);

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
    ).rejects.toMatchObject({
      code: 'selection_spans_markup',
    });
    expect(providerCalls).toEqual([]);
    expect(thunderbird.setCalls).toEqual([]);
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

  it('keeps the quoted reply thread out of a full-mail rewrite', async () => {
    const providerCalls = [];
    const quoted =
      '<div class="moz-cite-prefix">On 5/25/26 10:00, Sam wrote:</div>' +
      '<blockquote type="cite" cite="mid:abc"><p style="color: green">Original idea</p></blockquote>';
    const thunderbird = createThunderbird(`<p>Hi Sam</p>${quoted}`);
    const provider = createProvider('<p>Hello Sam</p>', providerCalls);

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

    expect(providerCalls[0].user).toContain('<p>Hi Sam</p>');
    expect(providerCalls[0].user).not.toContain('Original idea');
    expect(providerCalls[0].user).not.toContain('moz-cite-prefix');
    expect(thunderbird.setCalls[0].details.body).toBe(`<p>Hello Sam</p>${quoted}`);
  });

  it('keeps a forwarded thread out of a full-mail rewrite', async () => {
    const providerCalls = [];
    const forwarded =
      '<div class="moz-forward-container"><br>-------- Forwarded Message --------' +
      '<p style="color: red">Forwarded body</p></div>';
    const thunderbird = createThunderbird(`<p>See below</p>${forwarded}`);
    const provider = createProvider('<p>Please see below</p>', providerCalls);

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

    expect(providerCalls[0].user).toContain('<p>See below</p>');
    expect(providerCalls[0].user).not.toContain('Forwarded Message');
    expect(thunderbird.setCalls[0].details.body).toBe(`<p>Please see below</p>${forwarded}`);
  });

  it('refuses a full-mail rewrite when only a quoted reply remains', async () => {
    const providerCalls = [];
    const thunderbird = createThunderbird(
      '<div class="moz-cite-prefix">On 5/25/26, Sam wrote:</div>' +
        '<blockquote type="cite"><p>Earlier</p></blockquote>'
    );
    const provider = createProvider('<p>should not run</p>', providerCalls);

    await expect(
      rewriteComposeDraft(
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
      )
    ).rejects.toThrow(/quoted reply/i);
    expect(providerCalls).toHaveLength(0);
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

describe('selection rewrite with a DOMParser', () => {
  const { DOMParser } = new JSDOM('').window;
  const IMG = '<img src="cid:first" alt="chart">';
  const IMG2 = '<img src="https://example.com/logo.png" width="40">';

  function run(body, selectionText, output, { allowImageRelocation = false } = {}) {
    const providerCalls = [];
    const thunderbird = createThunderbird(body);
    const provider = createProvider(output, providerCalls);
    const result = rewriteComposeDraft(
      {
        action: 'rewrite',
        allowImageRelocation,
        preset: 'make-formal',
        providerId: 'test-provider',
        selectionText,
        tabId: 7,
      },
      {
        DOMParserImpl: DOMParser,
        getSettingsImpl: async () => getTestSettings(),
        getProviderImpl: () => provider,
        resolveProviderCredential: async () => 'stored-provider-key',
        thunderbird,
      }
    );

    return { providerCalls, result, thunderbird };
  }

  it('rewrites a whole mail selection around an inline image and keeps the image in place', async () => {
    const body = `<p>Hello Bob,</p><p>${IMG}</p><p>See the chart above.</p>`;
    const { providerCalls, result, thunderbird } = run(
      body,
      'Hello Bob,\n\nSee the chart above.',
      (input, index) => (index === 0 ? '<p>Dear Bob,</p>' : '<p>Please see the chart above.</p>')
    );

    await expect(result).resolves.toMatchObject({ scope: 'selection' });
    // Fixed-media mode rewrites the text segments on either side of the image.
    expect(providerCalls).toHaveLength(2);
    for (const call of providerCalls) {
      expect(call.user).not.toContain('<img');
      expect(call.user).not.toContain('[[TC_IMG_');
    }
    expect(thunderbird.setCalls[0].details.body).toBe(
      `<p>Dear Bob,</p>${IMG}<p>Please see the chart above.</p>`
    );
  });

  it('sends the selection with image tokens in one call when relocation is allowed', async () => {
    const body = `<p>Hello Bob,</p><p>${IMG}</p><p>See the chart above.</p>`;
    const { providerCalls, thunderbird } = run(
      body,
      'Hello Bob,\n\nSee the chart above.',
      '<p>Dear Bob, see the chart below.</p><p>[[TC_IMG_1]]</p>',
      { allowImageRelocation: true }
    );

    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0].user).toContain('[[TC_IMG_1]]');
    expect(providerCalls[0].user).not.toContain('<img');
    expect(providerCalls[0].system).toContain('You may move the tokens');
    expect(thunderbird.setCalls[0].details.body).toBe(
      `<p>Dear Bob, see the chart below.</p><p>${IMG}</p>`
    );
  });

  it('falls back to fixed segments when the model drops a token during relocation', async () => {
    const body = `<p>Hello Bob,</p><p>${IMG}</p><p>See the chart above.</p>`;
    const { providerCalls, result, thunderbird } = run(
      body,
      'Hello Bob,\n\nSee the chart above.',
      (input, index) => {
        if (index === 0) {
          return '<p>Dear Bob, see the chart.</p>';
        }
        return index === 1 ? '<p>Dear Bob,</p>' : '<p>Please see the chart above.</p>';
      },
      { allowImageRelocation: true }
    );

    await result;
    expect(providerCalls).toHaveLength(3);
    expect(thunderbird.setCalls[0].details.body).toBe(
      `<p>Dear Bob,</p>${IMG}<p>Please see the chart above.</p>`
    );
  });

  it('keeps two images of different schemes inside a partial selection', async () => {
    const body = `<p>Intro line.</p><p>Hello ${IMG} Bob ${IMG2} bye.</p><p>Outro line.</p>`;
    const { providerCalls, result, thunderbird } = run(
      body,
      'Hello  Bob  bye.',
      (input, index) => ['Good day', 'Robert', 'farewell.'][index]
    );

    await result;
    expect(providerCalls).toHaveLength(3);
    expect(thunderbird.setCalls[0].details.body).toBe(
      `<p>Intro line.</p>Good day${IMG}Robert${IMG2}farewell.<p>Outro line.</p>`
    );
  });

  it('strips an image the model invents and keeps the original', async () => {
    const body = `<p>Hello Bob,</p><p>${IMG}</p><p>Bye.</p>`;
    const { result, thunderbird } = run(body, 'Hello Bob,\n\nBye.', (input, index) =>
      index === 0 ? '<p>Dear Bob,</p><img src="https://evil.example/x.png">' : '<p>Goodbye.</p>'
    );

    await result;
    expect(thunderbird.setCalls[0].details.body).toBe(`<p>Dear Bob,</p>${IMG}<p>Goodbye.</p>`);
  });

  it('leaves images outside the selection untouched and out of the context tokens', async () => {
    const body = `<p>${IMG}</p><p>Hello Bob.</p><p>${IMG2}</p>`;
    const { providerCalls, result, thunderbird } = run(body, 'Hello Bob.', '<p>Dear Bob.</p>');

    await result;
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0].user).not.toContain('[[TC_IMG_');
    expect(providerCalls[0].user).not.toContain('<img');
    expect(thunderbird.setCalls[0].details.body).toBe(
      `<p>${IMG}</p><p>Dear Bob.</p><p>${IMG2}</p>`
    );
  });
});
