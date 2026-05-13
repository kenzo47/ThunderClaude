import { fetchProviderJson, ProviderError, registerProvider } from './index.js';

const ENDPOINT_HOST = 'generativelanguage.googleapis.com';
const API_VERSION = 'v1beta';
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

function createGenerateContentUrl(model) {
  const encodedModel = encodeURIComponent(model).replaceAll('%2F', '/');
  return `https://${ENDPOINT_HOST}/${API_VERSION}/models/${encodedModel}:generateContent`;
}

function extractGeminiText(body) {
  if (!Array.isArray(body?.candidates)) {
    throw new ProviderError('Provider response did not include candidates.', {
      code: 'malformed_response',
    });
  }

  const text = body.candidates
    .flatMap((candidate) => candidate?.content?.parts ?? [])
    .filter((part) => typeof part?.text === 'string')
    .map((part) => part.text)
    .join('');

  if (!text) {
    throw new ProviderError('Provider response did not include text output.', {
      code: 'empty_response',
    });
  }

  return text;
}

async function generateContent({
  key,
  model,
  system,
  user,
  signal,
  fetchImpl,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
}) {
  const body = await fetchProviderJson(
    createGenerateContentUrl(model ?? geminiProvider.defaultModel),
    {
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: user,
              },
            ],
            role: 'user',
          },
        ],
        generationConfig: {
          maxOutputTokens,
        },
        system_instruction: {
          parts: {
            text: system,
          },
        },
      }),
      endpointHost: ENDPOINT_HOST,
      fetchImpl,
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': key,
      },
      method: 'POST',
      signal,
    }
  );

  return extractGeminiText(body);
}

const geminiProvider = {
  id: 'gemini',
  label: 'Google Gemini',
  defaultModel: 'gemini-2.5-pro',
  modelList: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  keyHelpUrl: 'https://aistudio.google.com/app/apikey',
  endpointHost: ENDPOINT_HOST,
  async testConnection(key, options = {}) {
    try {
      await generateContent({
        key,
        maxOutputTokens: 8,
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
    return generateContent({
      key,
      model,
      system,
      user,
      signal,
      fetchImpl,
    });
  },
};

export default registerProvider(geminiProvider);
