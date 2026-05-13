import './providers/anthropic.js';
import './providers/deepseek.js';
import './providers/gemini.js';
import './providers/minimax.js';
import './providers/ollama.js';
import './providers/openai-compatible.js';
import './providers/openai.js';
import './providers/openrouter.js';

import { getProvider } from './providers/index.js';
import { getEncryptedValue, getPlainValue } from './secure-storage.js';
import { getSettings } from './settings.js';
import { getSessionKey } from './session-key.js';
import { restore, tokenize } from './inline-media.js';
import { handleOptionsMessage } from './options-router.js';
import { allowlistHtml } from '../lib/sanitize.js';

const PLACEHOLDER_RULE =
  'Preserve every [[TC_IMG_N]] token exactly once. You may move the tokens to better locations, but never delete, duplicate, rename, or invent them.';

const PRESETS = {
  'make-formal': 'Rewrite the email in a more formal and professional tone.',
  'make-casual': 'Rewrite the email in a warmer, more casual tone.',
  shorten: 'Shorten the email while preserving the important details.',
  expand: 'Expand the email with clear, useful detail while preserving the original intent.',
  'fix-grammar': 'Fix grammar, spelling, and clarity while preserving the original meaning.',
};

export class RewriteError extends Error {
  constructor(message, { code = 'rewrite_error' } = {}) {
    super(message);
    this.name = 'RewriteError';
    this.code = code;
  }
}

function getThunderbirdApi(thunderbird) {
  const resolvedApi = thunderbird ?? globalThis.messenger ?? globalThis.browser;

  if (!resolvedApi?.compose) {
    throw new RewriteError('Thunderbird compose API is unavailable.', {
      code: 'compose_api_unavailable',
    });
  }

  return resolvedApi;
}

function normalizeInstruction({ preset, customPrompt }) {
  const custom = customPrompt?.trim();

  if (custom) {
    return custom;
  }

  if (preset && PRESETS[preset]) {
    return PRESETS[preset];
  }

  throw new RewriteError('Choose a rewrite preset or enter a custom instruction.', {
    code: 'missing_rewrite_instruction',
  });
}

function resolveModel(provider, { modelId, customModel }, settings) {
  if (modelId && modelId !== 'custom') {
    return modelId;
  }

  if (customModel?.trim()) {
    return customModel.trim();
  }

  return settings.defaultModelByProvider[provider.id] ?? provider.defaultModel;
}

function buildPrompt({ instruction, tokenizedHtml }) {
  return {
    system: [
      'You rewrite Thunderbird compose-window email drafts.',
      'Return only a sanitized HTML fragment suitable for an email body.',
      'Use only simple formatting tags such as paragraphs, lists, emphasis, and links.',
      PLACEHOLDER_RULE,
    ].join(' '),
    user: [`Instruction: ${instruction}`, 'Draft HTML:', tokenizedHtml].join('\n\n'),
  };
}

async function defaultResolveProviderCredential(providerId) {
  if (providerId === 'ollama') {
    return '';
  }

  const plainValue = await getPlainValue(providerId);
  if (plainValue !== null) {
    return plainValue;
  }

  let key;
  try {
    key = getSessionKey();
  } catch (error) {
    throw new RewriteError(error.message, {
      code: 'session_locked',
    });
  }

  const encryptedValue = await getEncryptedValue(providerId, key);
  if (encryptedValue !== null) {
    return encryptedValue;
  }

  throw new RewriteError('Provider API key is not configured.', {
    code: 'missing_provider_key',
  });
}

function normalizeComposeBody(details) {
  return typeof details?.body === 'string' ? details.body : '';
}

export async function rewriteComposeDraft(message, options = {}) {
  const thunderbird = getThunderbirdApi(options.thunderbird);
  const tabId = Number(message?.tabId);

  if (!Number.isInteger(tabId)) {
    throw new RewriteError('A compose tab id is required.', {
      code: 'missing_compose_tab',
    });
  }

  const getSettingsImpl = options.getSettingsImpl ?? getSettings;
  const settings = await getSettingsImpl();
  if (!settings.onboardingComplete) {
    throw new RewriteError('Finish ThunderClaude onboarding before rewriting drafts.', {
      code: 'onboarding_required',
    });
  }

  const providerId = message?.providerId ?? settings.defaultProviderId;
  if (!providerId) {
    throw new RewriteError('A provider is required.', {
      code: 'missing_provider',
    });
  }

  const getProviderImpl = options.getProviderImpl ?? getProvider;
  const provider = getProviderImpl(providerId);
  const instruction = normalizeInstruction(message);
  const details = await thunderbird.compose.getComposeDetails(tabId);
  const tokenized = (options.tokenizeImpl ?? tokenize)(normalizeComposeBody(details));
  const prompt = buildPrompt({
    instruction,
    tokenizedHtml: tokenized.text,
  });
  const resolveProviderCredential =
    options.resolveProviderCredential ?? defaultResolveProviderCredential;
  const key = await resolveProviderCredential(providerId);
  const model = resolveModel(provider, message, settings);
  const rawOutput = await provider.rewrite({
    baseUrl: message?.baseUrl ?? settings.customBaseUrlByProvider[providerId],
    key,
    model,
    signal: options.signal,
    system: prompt.system,
    user: prompt.user,
  });
  const allowedCidImageHtml = tokenized.media.map((entry) => entry.outerHTML);
  const sanitizedOutput = (options.sanitizeImpl ?? allowlistHtml)(rawOutput, {
    allowedCidImageHtml,
  });
  const restoredOutput = (options.restoreImpl ?? restore)(sanitizedOutput, tokenized.mediaMap);
  const body = (options.sanitizeImpl ?? allowlistHtml)(restoredOutput, {
    allowedCidImageHtml,
  });

  await thunderbird.compose.setComposeDetails(tabId, {
    body,
    isPlainText: false,
  });

  return {
    body,
    model,
    providerId,
  };
}

export function createMessageRouter(options = {}) {
  return async function handleRuntimeMessage(message) {
    try {
      const optionsResult = await handleOptionsMessage(message, options);
      if (optionsResult !== undefined) {
        return {
          ok: true,
          result: optionsResult,
        };
      }

      if (message?.action !== 'rewrite') {
        return undefined;
      }

      const result = await rewriteComposeDraft(message, options);
      return {
        ok: true,
        result,
      };
    } catch (error) {
      return {
        error: {
          code: error?.code ?? 'rewrite_error',
          message: error?.message ?? 'Rewrite failed.',
        },
        ok: false,
      };
    }
  };
}
