import {
  extractChatCompletionText,
  fetchProviderJson,
  ProviderError,
  registerProvider,
} from './index.js';

const DEFAULT_MAX_TOKENS = 4096;
const CONFIGURED_ENDPOINT_HOST = 'user-configured';

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function createChatCompletionsUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new ProviderError('OpenAI-compatible base URL is required.', {
      code: 'missing_provider_endpoint',
    });
  }

  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ProviderError('OpenAI-compatible base URL is invalid.', {
      code: 'invalid_provider_endpoint',
    });
  }

  if (url.search || url.hash) {
    throw new ProviderError('OpenAI-compatible base URL cannot include query or fragment.', {
      code: 'invalid_provider_endpoint',
    });
  }

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) {
    throw new ProviderError('OpenAI-compatible base URL must use HTTPS unless it is loopback.', {
      code: 'invalid_provider_endpoint',
    });
  }

  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/chat/completions')
    ? path
    : `${path}/chat/completions`.replace(/^\/?/, '/');

  return url.toString();
}

async function createChatCompletion({
  key,
  baseUrl,
  model,
  system,
  user,
  signal,
  fetchImpl,
  maxTokens = DEFAULT_MAX_TOKENS,
}) {
  const url = createChatCompletionsUrl(baseUrl);

  const body = await fetchProviderJson(url, {
    body: JSON.stringify({
      max_tokens: maxTokens,
      messages: [
        {
          content: system,
          role: 'system',
        },
        {
          content: user,
          role: 'user',
        },
      ],
      model: model ?? openaiCompatibleProvider.defaultModel,
      stream: false,
    }),
    endpointHost: new URL(url).hostname,
    fetchImpl,
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal,
  });

  return extractChatCompletionText(body);
}

const openaiCompatibleProvider = {
  id: 'openai-compatible',
  label: 'OpenAI-Compatible',
  defaultModel: 'custom',
  modelList: ['custom'],
  keyHelpUrl: 'https://developers.openai.com/api/reference/chat/create',
  endpointHost: CONFIGURED_ENDPOINT_HOST,
  async testConnection(key, options = {}) {
    try {
      await createChatCompletion({
        key,
        maxTokens: 8,
        model: options.model ?? this.defaultModel,
        system: 'Reply with OK.',
        user: 'Connection test.',
        ...options,
      });
      return true;
    } catch {
      return false;
    }
  },
  async rewrite({ key, baseUrl, model, system, user, signal, fetchImpl }) {
    return createChatCompletion({
      key,
      baseUrl,
      model,
      system,
      user,
      signal,
      fetchImpl,
    });
  },
};

export default registerProvider(openaiCompatibleProvider);
