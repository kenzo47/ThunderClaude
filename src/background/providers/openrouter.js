import { extractChatCompletionText, fetchProviderJson, registerProvider } from './index.js';

const ENDPOINT_HOST = 'openrouter.ai';
const DEFAULT_BASE_URL = `https://${ENDPOINT_HOST}/api/v1`;
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
      model: model ?? openrouterProvider.defaultModel,
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

const openrouterProvider = {
  id: 'openrouter',
  label: 'OpenRouter',
  defaultModel: 'openai/gpt-5.6-luna',
  modelList: [
    'openai/gpt-5.6-luna',
    'openai/gpt-6-astra',
    'anthropic/claude-opus-5',
    'anthropic/claude-fable-5.1',
    'google/gemini-3.8-flash',
    'x-ai/grok-4.7',
    'z-ai/glm-5.3',
    'deepseek/deepseek-v4.1-flash',
    'custom',
  ],
  defaultBaseUrl: DEFAULT_BASE_URL,
  keyHelpUrl: 'https://openrouter.ai/settings/keys',
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

export default registerProvider(openrouterProvider);
