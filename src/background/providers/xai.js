import { extractChatCompletionText, fetchProviderJson, registerProvider } from './index.js';

const ENDPOINT_HOST = 'api.x.ai';
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
      model: model ?? xaiProvider.defaultModel,
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

const xaiProvider = {
  id: 'xai',
  label: 'xAI Grok',
  defaultModel: 'grok-4.6',
  modelList: ['grok-4.6', 'grok-4.5', 'grok-4.1-fast'],
  defaultBaseUrl: DEFAULT_BASE_URL,
  keyHelpUrl: 'https://console.x.ai/team/default/api-keys',
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
    } catch (error) {
      if (options.throwOnError) {
        throw error;
      }

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

export default registerProvider(xaiProvider);
