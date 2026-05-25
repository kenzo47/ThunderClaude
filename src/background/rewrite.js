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
import { replaceSelectedTextWithHtml } from './selection.js';
import { splitQuotedReply } from './quoted-reply.js';
import { splitSignature } from './signature.js';
import { hasRewriteableText, splitAroundInlineMediaTokens } from '../lib/html-segments.js';
import { allowlistHtml } from '../lib/sanitize.js';

const RELOCATE_PLACEHOLDER_RULE =
  'Preserve every [[TC_IMG_N]] token exactly once. You may move the tokens to better locations, but never delete, duplicate, rename, or invent them.';
const KEEP_PLACEHOLDER_RULE =
  'Preserve every [[TC_IMG_N]] token exactly once. Keep the tokens in their original order and locations; never delete, duplicate, rename, invent, or move them.';
const TONE_RULE = 'Use a human-like tone. Do not use em-dashes.';
const LIST_FORMAT_RULE =
  'Use bullet or numbered lists when the draft contains long lists of summaries, specifications, tasks, requirements, or examples.';
const INLINE_MEDIA_VALIDATION_CODES = new Set([
  'inline_media_token_mismatch',
  'inline_media_token_order_mismatch',
]);

const PRESETS = {
  'make-formal': 'Rewrite the email in a more formal and professional tone.',
  'make-casual': 'Rewrite the email in a warmer, more casual tone.',
  shorten: 'Shorten the email while preserving the important details.',
  expand: 'Expand the email with clear, useful detail while preserving the original intent.',
  'fix-grammar': 'Fix grammar, spelling, and clarity while preserving the original meaning.',
};
const LOCAL_PROVIDER_IDS = new Set(['local-llms']);
const INLINE_MEDIA_TOKEN_PATTERN = /\[\[TC_IMG_\d+\]\]/g;
const RESERVED_TOKEN_MARKER = '[[TC_IMG_';

// User-supplied instruction text must never carry the reserved inline-media
// marker, or it could coax the model into emitting tokens that do not map to a
// real image. Removing the marker prefix breaks any such sequence.
function stripReservedTokenMarker(text) {
  return text.split(RESERVED_TOKEN_MARKER).join('');
}

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
    return stripReservedTokenMarker(custom);
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
    stripReservedTokenMarker(selection),
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
      LIST_FORMAT_RULE,
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
      LIST_FORMAT_RULE,
      'Do not include [[TC_IMG_N]] tokens or image tags; fixed inline images are inserted outside this segment.',
    ].join(' '),
    user: [`Instruction: ${instruction}`, 'Segment HTML:', segmentHtml].join('\n\n'),
  };
}

function buildSelectionPrompt({ contextHtml, instruction, selectedText }) {
  return {
    system: [
      'You rewrite selected text from a Thunderbird compose-window email draft.',
      'Return only the replacement HTML fragment for the selected text.',
      'Do not rewrite or repeat unselected draft text.',
      'Do not include [[TC_IMG_N]] tokens or image tags.',
      TONE_RULE,
      LIST_FORMAT_RULE,
    ].join(' '),
    user: [
      `Instruction: ${instruction}`,
      'Selected text:',
      selectedText,
      'Draft context HTML:',
      contextHtml,
    ].join('\n\n'),
  };
}

function stripInlineMediaTokens(html) {
  return html.replace(INLINE_MEDIA_TOKEN_PATTERN, '');
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

    rewrittenSegments.push(stripInlineMediaTokens(sanitizeImpl(rewrittenSegment)));
  }

  return rewrittenSegments.join('');
}

function getSelectedRewriteText(message) {
  if (message?.preset === 'reply-draft') {
    return '';
  }

  return message?.selectionText?.trim() ?? '';
}

function assertInlineMediaPreserved(originalMedia, rewrittenMedia) {
  const originalImages = originalMedia.map((entry) => entry.outerHTML);
  const rewrittenImages = rewrittenMedia.map((entry) => entry.outerHTML);

  if (
    originalImages.length !== rewrittenImages.length ||
    originalImages.some((imageHtml, index) => imageHtml !== rewrittenImages[index])
  ) {
    throw new RewriteError('AI dropped an image, retry?', {
      code: 'inline_media_token_mismatch',
    });
  }
}

async function rewriteSelectedComposeText({
  baseUrl,
  composeBody,
  instruction,
  key,
  model,
  provider,
  sanitizeImpl,
  selectedText,
  signal,
  tokenizeImpl,
  DOMParserImpl,
}) {
  const tokenizedBody = tokenizeImpl(composeBody, { includeAllImages: true });
  replaceSelectedTextWithHtml(composeBody, selectedText, '', {
    DOMParserImpl,
  });
  const prompt = buildSelectionPrompt({
    contextHtml: tokenizedBody.text,
    instruction,
    selectedText,
  });
  const rawOutput = await callProviderRewrite({
    baseUrl,
    key,
    model,
    prompt,
    provider,
    signal,
  });
  const replacementHtml = sanitizeImpl(rawOutput);
  const body = replaceSelectedTextWithHtml(composeBody, selectedText, replacementHtml, {
    DOMParserImpl,
  });
  const rewrittenBody = tokenizeImpl(body, { includeAllImages: true });

  assertInlineMediaPreserved(tokenizedBody.media, rewrittenBody.media);

  return body;
}

function validateRestoredOutput({
  allowedCidImageHtml,
  rawOutput,
  requireOriginalOrder,
  restoreImpl,
  sanitizeImpl,
  tokenized,
}) {
  const sanitizedOutput = sanitizeImpl(rawOutput, {
    allowedCidImageHtml,
  });

  return restoreImpl(sanitizedOutput, tokenized.mediaMap, {
    requireOriginalOrder,
  });
}

function canFallbackToFixedMedia(error) {
  return INLINE_MEDIA_VALIDATION_CODES.has(error?.code);
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
  const instruction = normalizeInstruction(message);
  const details = await thunderbird.compose.getComposeDetails(tabId);
  const composeBody = normalizeComposeBody(details);
  const selectedText = getSelectedRewriteText(message);
  // A full-mail rewrite must leave any quoted reply or forwarded thread below
  // the new message untouched, so peel it off first and re-append it verbatim.
  const quotedSplit = (options.splitQuotedReplyImpl ?? splitQuotedReply)(composeBody);
  const signatureSplit = (options.splitSignatureImpl ?? splitSignature)(quotedSplit.bodyHtml);
  const tokenizeImpl = options.tokenizeImpl ?? tokenize;
  const sanitizeImpl = options.sanitizeImpl ?? allowlistHtml;
  const restoreImpl = options.restoreImpl ?? restore;
  const tokenizedSignature = signatureSplit.signatureHtml
    ? tokenizeImpl(signatureSplit.signatureHtml)
    : { media: [], mediaMap: new Map(), text: '' };
  const allowImageRelocation = message?.allowImageRelocation === true;
  const resolveProviderCredential =
    options.resolveProviderCredential ?? defaultResolveProviderCredential;
  const key = await resolveProviderCredential(providerId, options);
  const model = resolveModel(provider, message, settings);

  if (selectedText) {
    const body = await rewriteSelectedComposeText({
      baseUrl,
      composeBody,
      DOMParserImpl: options.DOMParserImpl,
      instruction,
      key,
      model,
      provider,
      sanitizeImpl,
      selectedText,
      signal: options.signal,
      tokenizeImpl,
    });

    await thunderbird.compose.setComposeDetails(tabId, {
      body,
      isPlainText: false,
    });

    return {
      body,
      model,
      providerId,
      scope: 'selection',
    };
  }

  const tokenized = tokenizeImpl(signatureSplit.bodyHtml, { includeAllImages: true });
  if (!hasRewriteableText(tokenized.text) && tokenized.media.length === 0) {
    // Everything was quoted history or a signature; there is no new message to
    // rewrite. Ask the user to write or select something rather than send the
    // model an empty draft.
    throw new RewriteError(
      'Write a message above the quoted reply, or select the text you want rewritten.',
      { code: 'empty_rewrite_body' }
    );
  }
  // Body images of any scheme (cid, http(s), data:image) are tokenized so the
  // model cannot drop or restyle them; the allowlist below is keyed on their
  // exact original markup, so only the user's own images survive sanitizing.
  const allowedCidImageHtml = [...tokenized.media, ...tokenizedSignature.media].map(
    (entry) => entry.outerHTML
  );
  let rawOutput;
  let restoredOutput;

  if (allowImageRelocation || tokenized.media.length === 0) {
    rawOutput = await rewriteWithRelocatableMedia({
      baseUrl,
      instruction,
      key,
      model,
      provider,
      signal: options.signal,
      tokenizedHtml: tokenized.text,
    });

    try {
      restoredOutput = validateRestoredOutput({
        allowedCidImageHtml,
        rawOutput,
        requireOriginalOrder: false,
        restoreImpl,
        sanitizeImpl,
        tokenized,
      });
    } catch (error) {
      if (
        !allowImageRelocation ||
        tokenized.media.length === 0 ||
        !canFallbackToFixedMedia(error)
      ) {
        throw error;
      }

      rawOutput = await rewriteWithFixedMedia({
        baseUrl,
        instruction,
        key,
        model,
        provider,
        sanitizeImpl,
        signal: options.signal,
        tokenizedHtml: tokenized.text,
      });
      restoredOutput = validateRestoredOutput({
        allowedCidImageHtml,
        rawOutput,
        requireOriginalOrder: true,
        restoreImpl,
        sanitizeImpl,
        tokenized,
      });
    }
  } else {
    rawOutput = await rewriteWithFixedMedia({
      baseUrl,
      instruction,
      key,
      model,
      provider,
      sanitizeImpl,
      signal: options.signal,
      tokenizedHtml: tokenized.text,
    });
    restoredOutput = validateRestoredOutput({
      allowedCidImageHtml,
      rawOutput,
      requireOriginalOrder: true,
      restoreImpl,
      sanitizeImpl,
      tokenized,
    });
  }
  const restoredSignature = tokenizedSignature.text
    ? restoreImpl(tokenizedSignature.text, tokenizedSignature.mediaMap)
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
  // quotedSplit.quotedHtml comes straight from the user's own draft and is
  // re-appended verbatim, never sanitized or sent to the model, so the quoted
  // thread keeps its original styling exactly.
  const bodyWithSignature = `${body}${sanitizedSignature}${quotedSplit.quotedHtml}`;

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
