import {
  extractChatCompletionText,
  fetchProviderJson,
  ProviderError,
  registerProvider,
} from './index.js';

const DEFAULT_BASE_URL = 'http://localhost:11434/api';
const LM_STUDIO_BASE_URL = 'http://localhost:1234/v1';
const DEFAULT_ENDPOINT_HOST = 'localhost';

function createLocalUrl(baseUrl = DEFAULT_BASE_URL) {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/, '');

  if (path.endsWith('/v1') || path.endsWith('/chat/completions')) {
    url.pathname = path.endsWith('/chat/completions')
      ? path
      : `${path}/chat/completions`.replace(/^\/?/, '/');
    return {
      kind: 'openai-compatible',
      url: url.toString(),
    };
  }

  if (path.endsWith('/api/chat')) {
    url.pathname = path;
  } else if (path.endsWith('/api')) {
    url.pathname = `${path}/chat`.replace(/^\/?/, '/');
  } else {
    url.pathname = `${path}/api/chat`.replace(/^\/?/, '/');
  }

  return {
    kind: 'ollama',
    url: url.toString(),
  };
}

function createHealthCheckUrl(baseUrl = DEFAULT_BASE_URL) {
  const endpoint = createLocalUrl(baseUrl);
  const url = new URL(endpoint.url);
  const path = url.pathname.replace(/\/+$/, '');

  url.pathname =
    endpoint.kind === 'openai-compatible'
      ? path.replace(/\/chat\/completions$/, '/models')
      : path.replace(/\/api\/chat$/, '/api/tags');

  return {
    kind: endpoint.kind,
    url: url.toString(),
  };
}

export function isOllamaBaseUrl(baseUrl = DEFAULT_BASE_URL) {
  try {
    return createLocalUrl(baseUrl).kind === 'ollama';
  } catch {
    return false;
  }
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

async function checkLocalServer({ baseUrl, signal, fetchImpl }) {
  const endpoint = createHealthCheckUrl(baseUrl);
  await fetchProviderJson(endpoint.url, {
    endpointHost: new URL(endpoint.url).hostname,
    fetchImpl,
    headers: {
      'content-type': 'application/json',
    },
    method: 'GET',
    signal,
  });

  return true;
}

const localLlmsProvider = {
  id: 'local-llms',
  label: 'Local LLMs',
  defaultModel: 'qwen3.6',
  modelList: ['qwen3.6', 'gemma4', 'llama3.3', 'glm-4.7-flash', 'custom'],
  defaultBaseUrl: DEFAULT_BASE_URL,
  alternateBaseUrls: [DEFAULT_BASE_URL, LM_STUDIO_BASE_URL],
  keyHelpUrl: 'https://lmstudio.ai/docs/app/api/endpoints/openai/',
  endpointHost: DEFAULT_ENDPOINT_HOST,
  async testConnection(key, options = {}) {
    if (key) {
      return false;
    }

    try {
      return await checkLocalServer(options);
    } catch (error) {
      if (options.throwOnError) {
        throw error;
      }

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
