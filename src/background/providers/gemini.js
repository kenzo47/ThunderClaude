import { fetchProviderJson, ProviderError, registerProvider } from './index.js';

const ENDPOINT_HOST = 'generativelanguage.googleapis.com';
const DEFAULT_BASE_URL = `https://${ENDPOINT_HOST}/v1beta`;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

function createGenerateContentUrl(model, baseUrl = DEFAULT_BASE_URL) {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/, '');
  const encodedModel = encodeURIComponent(model).replaceAll('%2F', '/');
  url.pathname = `${path}/models/${encodedModel}:generateContent`.replace(/^\/?/, '/');
  return url.toString();
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
  baseUrl,
  key,
  model,
  system,
  user,
  signal,
  fetchImpl,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
}) {
  const body = await fetchProviderJson(
    createGenerateContentUrl(model ?? geminiProvider.defaultModel, baseUrl),
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
      endpointHost: new URL(createGenerateContentUrl(model ?? geminiProvider.defaultModel, baseUrl))
        .hostname,
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
  defaultModel: 'gemini-3.8-flash',
  modelList: [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-pro-preview',
  ],
  defaultBaseUrl: DEFAULT_BASE_URL,
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
    } catch (error) {
      if (options.throwOnError) {
        throw error;
      }

      return false;
    }
  },
  async rewrite({ key, baseUrl, model, system, user, signal, fetchImpl }) {
    return generateContent({
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

export default registerProvider(geminiProvider);
