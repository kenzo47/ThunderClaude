import { extractChatCompletionText, fetchProviderJson, registerProvider } from './index.js';

const ENDPOINT_HOST = 'api.deepseek.com';
const CHAT_COMPLETIONS_URL = `https://${ENDPOINT_HOST}/chat/completions`;
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
      model: model ?? deepseekProvider.defaultModel,
      stream: false,
      thinking: {
        type: 'disabled',
      },
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

const deepseekProvider = {
  id: 'deepseek',
  label: 'DeepSeek',
  defaultModel: 'deepseek-v4-flash',
  modelList: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
  keyHelpUrl: 'https://platform.deepseek.com/api_keys',
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

export default registerProvider(deepseekProvider);
