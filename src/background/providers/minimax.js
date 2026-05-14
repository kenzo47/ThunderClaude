import { extractChatCompletionText, fetchProviderJson, registerProvider } from './index.js';

const ENDPOINT_HOST = 'api.minimax.io';
const DEFAULT_BASE_URL = `https://${ENDPOINT_HOST}/v1`;
const DEFAULT_MAX_TOKENS = 4096;

function createChatCompletionsUrl(baseUrl = DEFAULT_BASE_URL) {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/chat/completions')
    ? path
    : `${path}/chat/completions`.replace(/^\/?/, '/');
  return url.toString();
}

async function createChatCompletion({
  baseUrl,
  key,
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
      model: model ?? minimaxProvider.defaultModel,
      reasoning_split: true,
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

const minimaxProvider = {
  id: 'minimax',
  label: 'MiniMax',
  defaultModel: 'MiniMax-M2',
  modelList: [
    'MiniMax-M2',
    'MiniMax-M2.1',
    'MiniMax-M2.1-highspeed',
    'MiniMax-M2.5',
    'MiniMax-M2.5-highspeed',
    'MiniMax-M2.7',
    'MiniMax-M2.7-highspeed',
  ],
  defaultBaseUrl: DEFAULT_BASE_URL,
  keyHelpUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
  endpointHost: ENDPOINT_HOST,
  async testConnection(key, options = {}) {
    try {
      await createChatCompletion({
        key,
        maxTokens: 8,
        model: this.defaultModel,
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
      baseUrl,
      key,
      model,
      system,
      user,
      signal,
      fetchImpl,
    });
  },
};

export default registerProvider(minimaxProvider);
