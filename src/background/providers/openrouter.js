import { extractChatCompletionText, fetchProviderJson, registerProvider } from './index.js';

const ENDPOINT_HOST = 'openrouter.ai';
const CHAT_COMPLETIONS_URL = `https://${ENDPOINT_HOST}/api/v1/chat/completions`;
const DEFAULT_MAX_TOKENS = 4096;

async function createChatCompletion({
  key,
  model,
  system,
  user,
  signal,
  fetchImpl,
  maxTokens = DEFAULT_MAX_TOKENS,
}) {
  const body = await fetchProviderJson(CHAT_COMPLETIONS_URL, {
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
    endpointHost: ENDPOINT_HOST,
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
  defaultModel: 'openai/gpt-5.4',
  modelList: ['openai/gpt-5.4', 'anthropic/claude-opus-4.7', 'google/gemini-2.5-pro', 'custom'],
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
    } catch {
      return false;
    }
  },
  async rewrite({ key, model, system, user, signal, fetchImpl }) {
    return createChatCompletion({
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
