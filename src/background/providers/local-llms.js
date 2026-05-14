import {
  extractChatCompletionText,
  fetchProviderJson,
  ProviderError,
  registerProvider,
} from './index.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const LM_STUDIO_BASE_URL = 'http://localhost:1234/v1';
const DEFAULT_ENDPOINT_HOST = 'localhost';

function createLocalUrl(baseUrl = DEFAULT_BASE_URL) {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/, '');

  if (path.endsWith('/v1')) {
    url.pathname = `${path}/chat/completions`.replace(/^\/?/, '/');
    return {
      kind: 'openai-compatible',
      url: url.toString(),
    };
  }

  url.pathname = path.endsWith('/api/chat') ? path : `${path}/api/chat`.replace(/^\/?/, '/');
  return {
    kind: 'ollama',
    url: url.toString(),
  };
}

function extractOllamaChatText(body) {
  const text = body?.message?.content;

  if (typeof text !== 'string' || !text) {
    throw new ProviderError('Provider response did not include text content.', {
      code: 'empty_response',
    });
  }

  return text;
}

async function createChatCompletion({ baseUrl, model, system, user, signal, fetchImpl }) {
  const endpoint = createLocalUrl(baseUrl);
  const isOpenAiCompatible = endpoint.kind === 'openai-compatible';
  const body = await fetchProviderJson(endpoint.url, {
    body: JSON.stringify({
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
      model: model ?? localLlmsProvider.defaultModel,
      stream: false,
      ...(isOpenAiCompatible
        ? {}
        : {
            think: false,
          }),
    }),
    endpointHost: new URL(endpoint.url).hostname,
    fetchImpl,
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    signal,
  });

  return isOpenAiCompatible ? extractChatCompletionText(body) : extractOllamaChatText(body);
}

const localLlmsProvider = {
  id: 'local-llms',
  label: 'Local LLMs',
  defaultModel: 'llama3.2',
  modelList: ['llama3.2', 'gemma3', 'qwen3', 'mistral', 'custom'],
  defaultBaseUrl: DEFAULT_BASE_URL,
  alternateBaseUrls: [DEFAULT_BASE_URL, LM_STUDIO_BASE_URL],
  keyHelpUrl: 'https://lmstudio.ai/docs/app/api/endpoints/openai/',
  endpointHost: DEFAULT_ENDPOINT_HOST,
  async testConnection(key, options = {}) {
    if (key) {
      return false;
    }

    try {
      await createChatCompletion({
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
  async rewrite({ baseUrl, model, system, user, signal, fetchImpl }) {
    return createChatCompletion({
      baseUrl,
      model,
      system,
      user,
      signal,
      fetchImpl,
    });
  },
};

export default registerProvider(localLlmsProvider);
