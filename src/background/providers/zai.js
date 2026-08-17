import { extractChatCompletionText, fetchProviderJson, registerProvider } from './index.js';

const ENDPOINT_HOST = 'api.z.ai';
const DEFAULT_BASE_URL = `https://${ENDPOINT_HOST}/api/paas/v4`;
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
      model: model ?? zaiProvider.defaultModel,
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

const zaiProvider = {
  id: 'zai',
  label: 'Z.ai GLM',
  defaultModel: 'glm-5.2',
  modelList: ['glm-5.2', 'glm-5.1', 'glm-5-turbo', 'glm-4.7-flash'],
  defaultBaseUrl: DEFAULT_BASE_URL,
  keyHelpUrl: 'https://z.ai/manage-apikey/apikey-list',
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

export default registerProvider(zaiProvider);
