export class ProviderError extends Error {
  constructor(message, { code = 'provider_error', status = null } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
  }
}

export function assertProviderHost(url, endpointHost) {
  const parsedUrl = new URL(url);

  if (parsedUrl.hostname !== endpointHost) {
    throw new ProviderError('Provider endpoint host mismatch.', {
      code: 'provider_host_mismatch',
    });
  }

  return parsedUrl;
}

export async function parseProviderJson(response) {
  try {
    return await response.json();
  } catch {
    throw new ProviderError('Provider returned malformed JSON.', {
      code: 'malformed_json',
      status: response.status,
    });
  }
}

export function normalizeProviderError(status, body) {
  const error = body?.error;
  const message =
    (typeof error === 'string' ? error : error?.message) ??
    body?.message ??
    `Provider request failed with ${status}.`;
  const type = typeof error === 'string' ? body?.type : (error?.type ?? body?.type);

  if (status === 401) {
    return new ProviderError(message, { code: 'authentication_error', status });
  }

  if (status === 429) {
    return new ProviderError(message, { code: 'rate_limit_error', status });
  }

  if (status >= 500) {
    return new ProviderError(message, { code: 'server_error', status });
  }

  return new ProviderError(message, {
    code: type ?? 'provider_error',
    status,
  });
}

export async function fetchProviderJson(url, { endpointHost, fetchImpl = fetch, ...options }) {
  assertProviderHost(url, endpointHost);

  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    throw new ProviderError(error?.message ?? 'Provider request failed.', {
      code: error?.name === 'AbortError' ? 'network_timeout' : 'network_error',
    });
  }

  const body = await parseProviderJson(response);

  if (!response.ok) {
    throw normalizeProviderError(response.status, body);
  }

  return body;
}

export function extractTextBlocks(body) {
  if (!Array.isArray(body?.content)) {
    throw new ProviderError('Provider response did not include content blocks.', {
      code: 'malformed_response',
    });
  }

  const text = body.content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');

  if (!text) {
    throw new ProviderError('Provider response did not include text content.', {
      code: 'empty_response',
    });
  }

  return text;
}

export function extractChatCompletionText(body) {
  if (!Array.isArray(body?.choices)) {
    throw new ProviderError('Provider response did not include choices.', {
      code: 'malformed_response',
    });
  }

  const text = body.choices
    .map((choice) => choice?.message?.content ?? choice?.text)
    .filter((content) => typeof content === 'string')
    .join('');

  if (!text) {
    throw new ProviderError('Provider response did not include text content.', {
      code: 'empty_response',
    });
  }

  return text;
}

export const providers = new Map();

export function registerProvider(provider) {
  const requiredKeys = [
    'id',
    'label',
    'defaultModel',
    'modelList',
    'keyHelpUrl',
    'endpointHost',
    'testConnection',
    'rewrite',
  ];

  for (const key of requiredKeys) {
    if (!(key in provider)) {
      throw new ProviderError(`Provider missing required key: ${key}`, {
        code: 'invalid_provider',
      });
    }
  }

  providers.set(provider.id, Object.freeze(provider));
  return provider;
}

export function getProvider(providerId) {
  const provider = providers.get(providerId);

  if (!provider) {
    throw new ProviderError(`Unknown provider: ${providerId}`, {
      code: 'unknown_provider',
    });
  }

  return provider;
}

export function listProviders() {
  return [...providers.values()];
}
