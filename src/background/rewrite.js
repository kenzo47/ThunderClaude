import './providers/anthropic.js';
import './providers/deepseek.js';
import './providers/gemini.js';
import './providers/local-llms.js';
import './providers/minimax.js';
import './providers/openai-compatible.js';
import './providers/openai.js';
import './providers/openrouter.js';

import { isOllamaBaseUrl } from './providers/local-llms.js';
import { getProvider } from './providers/index.js';
import { getEncryptedValue } from './secure-storage.js';
import { getSettings } from './settings.js';
import { restore, tokenize } from './inline-media.js';
import { handleOptionsMessage } from './options-router.js';
import { splitSignature } from './signature.js';
import { hasRewriteableText, splitAroundInlineMediaTokens } from '../lib/html-segments.js';
import { allowlistHtml } from '../lib/sanitize.js';

const RELOCATE_PLACEHOLDER_RULE =
  'Preserve every [[TC_IMG_N]] token exactly once. You may move the tokens to better locations, but never delete, duplicate, rename, or invent them.';
const KEEP_PLACEHOLDER_RULE =
  'Preserve every [[TC_IMG_N]] token exactly once. Keep the tokens in their original order and locations; never delete, duplicate, rename, invent, or move them.';
const TONE_RULE = 'Use a human-like tone. Do not use em-dashes.';

const PRESETS = {
  'make-formal': 'Rewrite the email in a more formal and professional tone.',
  'make-casual': 'Rewrite the email in a warmer, more casual tone.',
  shorten: 'Shorten the email while preserving the important details.',
  expand: 'Expand the email with clear, useful detail while preserving the original intent.',
  'fix-grammar': 'Fix grammar, spelling, and clarity while preserving the original meaning.',
};
const LOCAL_PROVIDER_IDS = new Set(['local-llms']);

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

function normalizeInstruction(message) {
  const { customPrompt, preset } = message;
  const custom = customPrompt?.trim();

  if (custom) {
    return custom;
  }

  if (preset && PRESETS[preset]) {
    return PRESETS[preset];
  }

  if (preset === 'translate') {
    return normalizeTranslateInstruction(message);
  }

  if (preset === 'reply-draft') {
    return normalizeReplyDraftInstruction(message);
  }

  throw new RewriteError('Choose a rewrite preset or enter a custom instruction.', {
    code: 'missing_rewrite_instruction',
  });
}

function normalizeTranslateInstruction({ targetLanguage }) {
  const language = targetLanguage?.trim();

  if (!language) {
    throw new RewriteError('Choose a target language.', {
      code: 'missing_target_language',
    });
  }

  return `Translate the email to ${language}. Preserve meaning, formatting, and tone.`;
}

function normalizeReplyDraftInstruction({ selectionText }) {
  const selection = selectionText?.trim();

  if (!selection) {
    throw new RewriteError('Select text in the compose window to draft a reply.', {
      code: 'missing_reply_selection',
    });
  }

  return [
    'Draft a clear, helpful reply to the selected text below.',
    'Use the current draft as context if it contains notes, but focus the response on the selection.',
    'Selected text:',
    selection,
  ].join('\n\n');
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

function buildPrompt({ allowImageRelocation, instruction, tokenizedHtml }) {
  return {
    system: [
      'You rewrite Thunderbird compose-window email drafts.',
      'Return only a sanitized HTML fragment suitable for an email body.',
      'Use only simple formatting tags such as paragraphs, lists, emphasis, and links.',
      TONE_RULE,
      allowImageRelocation ? RELOCATE_PLACEHOLDER_RULE : KEEP_PLACEHOLDER_RULE,
    ].join(' '),
    user: [`Instruction: ${instruction}`, 'Draft HTML:', tokenizedHtml].join('\n\n'),
  };
}

function buildFixedSegmentPrompt({ instruction, segmentHtml }) {
  return {
    system: [
      'You rewrite one text segment from a Thunderbird compose-window email draft.',
      'Return only a sanitized HTML fragment suitable for this segment.',
      TONE_RULE,
      'Do not include [[TC_IMG_N]] tokens or image tags; fixed inline images are inserted outside this segment.',
    ].join(' '),
    user: [`Instruction: ${instruction}`, 'Segment HTML:', segmentHtml].join('\n\n'),
  };
}

async function callProviderRewrite({ baseUrl, key, model, prompt, provider, signal }) {
  return provider.rewrite({
    baseUrl,
    key,
    model,
    signal,
    system: prompt.system,
    user: prompt.user,
  });
}

async function rewriteWithRelocatableMedia({
  baseUrl,
  instruction,
  key,
  model,
  provider,
  signal,
  tokenizedHtml,
}) {
  const prompt = buildPrompt({
    allowImageRelocation: true,
    instruction,
    tokenizedHtml,
  });

  return callProviderRewrite({
    baseUrl,
    key,
    model,
    prompt,
    provider,
    signal,
  });
}

async function rewriteWithFixedMedia({
  baseUrl,
  instruction,
  key,
  model,
  provider,
  sanitizeImpl,
  signal,
  tokenizedHtml,
}) {
  const rewrittenSegments = [];

  for (const segment of splitAroundInlineMediaTokens(tokenizedHtml)) {
    if (segment.type === 'token' || !hasRewriteableText(segment.value)) {
      rewrittenSegments.push(segment.value);
      continue;
    }

    const prompt = buildFixedSegmentPrompt({
      instruction,
      segmentHtml: segment.value,
    });
    const rewrittenSegment = await callProviderRewrite({
      baseUrl,
      key,
      model,
      prompt,
      provider,
      signal,
    });

    rewrittenSegments.push(sanitizeImpl(rewrittenSegment));
  }

  return rewrittenSegments.join('');
}

async function defaultResolveProviderCredential(providerId, options = {}) {
  if (LOCAL_PROVIDER_IDS.has(providerId)) {
    return '';
  }

  const encryptedValue = await getEncryptedValue(providerId, options);
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

function resolveBaseUrl(provider, message, settings) {
  const savedBaseUrl =
    settings.customBaseUrlByProvider[provider.id] ?? provider.defaultBaseUrl ?? '';
  const requestedBaseUrl = message?.baseUrl?.trim();

  if (requestedBaseUrl && requestedBaseUrl !== savedBaseUrl) {
    throw new RewriteError('Save and test the custom endpoint before rewriting drafts.', {
      code: 'provider_endpoint_not_verified',
    });
  }

  return savedBaseUrl;
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
  const settings = await getSettingsImpl(options);
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
  const baseUrl = resolveBaseUrl(provider, message, settings);
  if (
    LOCAL_PROVIDER_IDS.has(providerId) &&
    isOllamaBaseUrl(baseUrl) &&
    !settings.enabledLocalProviderIds?.[providerId]
  ) {
    throw new RewriteError('Enable Ollama localhost access before rewriting.', {
      code: 'local_provider_not_enabled',
    });
  }
  if (!settings.verifiedProviderIds?.[providerId]) {
    throw new RewriteError('Test this provider before rewriting drafts.', {
      code: 'provider_not_verified',
    });
  }
  const instruction = normalizeInstruction(message);
  const details = await thunderbird.compose.getComposeDetails(tabId);
  const composeBody = normalizeComposeBody(details);
  const signatureSplit = (options.splitSignatureImpl ?? splitSignature)(composeBody);
  const tokenized = (options.tokenizeImpl ?? tokenize)(signatureSplit.bodyHtml);
  const tokenizedSignature = signatureSplit.signatureHtml
    ? (options.tokenizeImpl ?? tokenize)(signatureSplit.signatureHtml)
    : { media: [], mediaMap: new Map(), text: '' };
  const allowImageRelocation = message?.allowImageRelocation !== false;
  const resolveProviderCredential =
    options.resolveProviderCredential ?? defaultResolveProviderCredential;
  const key = await resolveProviderCredential(providerId, options);
  const model = resolveModel(provider, message, settings);
  const allowedCidImageHtml = [...tokenized.media, ...tokenizedSignature.media].map(
    (entry) => entry.outerHTML
  );
  const sanitizeImpl = options.sanitizeImpl ?? allowlistHtml;
  const rawOutput =
    allowImageRelocation || tokenized.media.length === 0
      ? await rewriteWithRelocatableMedia({
          baseUrl,
          instruction,
          key,
          model,
          provider,
          signal: options.signal,
          tokenizedHtml: tokenized.text,
        })
      : await rewriteWithFixedMedia({
          baseUrl,
          instruction,
          key,
          model,
          provider,
          sanitizeImpl,
          signal: options.signal,
          tokenizedHtml: tokenized.text,
        });
  const sanitizedOutput = (options.sanitizeImpl ?? allowlistHtml)(rawOutput, {
    allowedCidImageHtml,
  });
  const restoredOutput = (options.restoreImpl ?? restore)(sanitizedOutput, tokenized.mediaMap, {
    requireOriginalOrder: !allowImageRelocation,
  });
  const restoredSignature = tokenizedSignature.text
    ? (options.restoreImpl ?? restore)(tokenizedSignature.text, tokenizedSignature.mediaMap)
    : '';
  const sanitizedSignature = restoredSignature
    ? (options.sanitizeImpl ?? allowlistHtml)(restoredSignature, {
        allowedCidImageHtml,
        signatureMode: true,
      })
    : '';
  const body = (options.sanitizeImpl ?? allowlistHtml)(restoredOutput, {
    allowedCidImageHtml,
  });
  const bodyWithSignature = `${body}${sanitizedSignature}`;

  await thunderbird.compose.setComposeDetails(tabId, {
    body: bodyWithSignature,
    isPlainText: false,
  });

  return {
    body: bodyWithSignature,
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
