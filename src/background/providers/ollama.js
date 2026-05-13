import { fetchProviderJson, ProviderError, registerProvider } from './index.js';

const ENDPOINT_HOST = 'localhost';
const CHAT_URL = `http://${ENDPOINT_HOST}:11434/api/chat`;

function extractOllamaChatText(body) {
  const text = body?.message?.content;

  if (typeof text !== 'string' || !text) {
    throw new ProviderError('Provider response did not include text content.', {
      code: 'empty_response',
    });
  }

  return text;
}

async function createChatCompletion({ model, system, user, signal, fetchImpl }) {
  const body = await fetchProviderJson(CHAT_URL, {
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
      model: model ?? ollamaProvider.defaultModel,
      stream: false,
      think: false,
    }),
    endpointHost: ENDPOINT_HOST,
    fetchImpl,
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    signal,
  });

  return extractOllamaChatText(body);
}

const ollamaProvider = {
  id: 'ollama',
  label: 'Ollama',
  defaultModel: 'llama3.2',
  modelList: ['llama3.2', 'gemma3', 'qwen3', 'mistral', 'custom'],
  keyHelpUrl: 'https://ollama.com/download',
  endpointHost: ENDPOINT_HOST,
  async testConnection(key, options = {}) {
    if (key) {
      return false;
    }

    try {
      await createChatCompletion({
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
  async rewrite({ model, system, user, signal, fetchImpl }) {
    return createChatCompletion({
      model,
      system,
      user,
      signal,
      fetchImpl,
    });
  },
};

export default registerProvider(ollamaProvider);
