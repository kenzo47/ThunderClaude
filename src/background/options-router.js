import './providers/anthropic.js';
import './providers/deepseek.js';
import './providers/gemini.js';
import './providers/minimax.js';
import './providers/ollama.js';
import './providers/openai-compatible.js';
import './providers/openai.js';
import './providers/openrouter.js';

import { getProvider, listProviders } from './providers/index.js';
import { getSettings, setSettings, updateSettings } from './settings.js';
import {
  getEncryptedValue,
  getPlainValue,
  getStorageArea,
  getStorageKeys,
  removeValue,
  setEncryptedValue,
  setPlainValue,
} from './secure-storage.js';
import { getSessionKey, getSessionState, lockSession, unlockSession } from './session-key.js';

const KEY_MODES = new Set(['encrypted', 'plain', 'none']);
const LOCAL_PROVIDER_IDS = new Set(['ollama']);

export class OptionsError extends Error {
  constructor(message, { code = 'options_error' } = {}) {
    super(message);
    this.name = 'OptionsError';
    this.code = code;
  }
}

function serializeProvider(provider) {
  return {
    defaultModel: provider.defaultModel,
    endpointHost: provider.endpointHost,
    id: provider.id,
    keyHelpUrl: provider.keyHelpUrl,
    label: provider.label,
    modelList: provider.modelList,
  };
}

async function readStorageKey(storageArea, key) {
  const result = await storageArea.get(key);
  return result[key];
}

async function getKeyStatus(providerId, settings, storageArea) {
  const keys = getStorageKeys(providerId);
  const hasEncrypted = Boolean(await readStorageKey(storageArea, keys.encrypted));
  const hasPlain = Boolean(await readStorageKey(storageArea, keys.plain));
  const keyMode =
    settings.keyModeByProvider[providerId] ??
    (providerId === 'ollama' ? 'none' : hasPlain ? 'plain' : 'encrypted');

  return {
    hasKey: hasEncrypted || hasPlain,
    keyMode,
  };
}

async function resolveProviderKey(providerId, keyMode, apiKey, options = {}) {
  if (providerId === 'ollama' || keyMode === 'none') {
    return '';
  }

  if (apiKey?.trim()) {
    return apiKey.trim();
  }

  if (keyMode === 'plain') {
    const plainValue = await getPlainValue(providerId, options);
    if (plainValue !== null) {
      return plainValue;
    }

    throw new OptionsError('Provider API key is not configured.', {
      code: 'missing_provider_key',
    });
  }

  const sessionKey = getSessionKey();
  const encryptedValue = await getEncryptedValue(providerId, sessionKey, options);
  if (encryptedValue !== null) {
    return encryptedValue;
  }

  throw new OptionsError('Provider API key is not configured.', {
    code: 'missing_provider_key',
  });
}

function getProviderConfig(settings, providerId, keyStatus) {
  return {
    customBaseUrl: settings.customBaseUrlByProvider[providerId] ?? '',
    defaultModel:
      settings.defaultModelByProvider[providerId] ?? getProvider(providerId).defaultModel,
    hasKey: keyStatus.hasKey,
    keyMode: keyStatus.keyMode,
    localAccessEnabled: Boolean(settings.enabledLocalProviderIds[providerId]),
    verified: Boolean(settings.verifiedProviderIds[providerId]),
  };
}

function assertLocalProviderEnabled(providerId, settings, localAccessEnabled) {
  if (!LOCAL_PROVIDER_IDS.has(providerId)) {
    return;
  }

  if (localAccessEnabled || settings.enabledLocalProviderIds[providerId]) {
    return;
  }

  throw new OptionsError('Enable local Ollama access before connecting to localhost.', {
    code: 'local_provider_not_enabled',
  });
}

function testMatchesSavedProviderConfig(
  {
    apiKey = '',
    customBaseUrl = '',
    defaultModel,
    keyMode,
    localAccessEnabled = false,
    provider,
    providerId,
  },
  settings
) {
  if (apiKey.trim()) {
    return false;
  }

  const resolvedKeyMode = keyMode ?? (providerId === 'ollama' ? 'none' : 'encrypted');
  const savedKeyMode =
    settings.keyModeByProvider[providerId] ?? (providerId === 'ollama' ? 'none' : 'encrypted');
  const savedModel = settings.defaultModelByProvider[providerId] ?? provider.defaultModel;
  const testedModel = defaultModel?.trim() || provider.defaultModel;
  const savedBaseUrl = settings.customBaseUrlByProvider[providerId] ?? '';
  const testedBaseUrl = providerId === 'openai-compatible' ? customBaseUrl.trim() : '';
  const savedLocalAccess = Boolean(settings.enabledLocalProviderIds[providerId]);
  const testedLocalAccess = LOCAL_PROVIDER_IDS.has(providerId)
    ? Boolean(localAccessEnabled)
    : false;

  return (
    resolvedKeyMode === savedKeyMode &&
    testedModel === savedModel &&
    testedBaseUrl === savedBaseUrl &&
    testedLocalAccess === savedLocalAccess
  );
}

export async function getOptionsSnapshot(options = {}) {
  const storageArea = getStorageArea(options.storageArea);
  const settings = await getSettings({ storageArea });
  const providers = listProviders().map(serializeProvider);
  const providerConfigs = {};

  for (const provider of providers) {
    const keyStatus = await getKeyStatus(provider.id, settings, storageArea);
    providerConfigs[provider.id] = getProviderConfig(settings, provider.id, keyStatus);
  }

  return {
    providerConfigs,
    providers,
    session: getSessionState(),
    settings,
  };
}

export async function unlockOptionsSession({ storagePhrase } = {}, options = {}) {
  if (!storagePhrase?.trim()) {
    throw new OptionsError('Enter a storage phrase.', {
      code: 'missing_storage_phrase',
    });
  }

  const settings = await getSettings(options);
  const session = await unlockSession(storagePhrase, settings.keySalt);

  if (!settings.keySalt) {
    await setSettings(
      {
        ...settings,
        keySalt: session.salt,
      },
      options
    );
  }

  return getOptionsSnapshot(options);
}

export async function saveProviderOptions(
  {
    apiKey = '',
    customBaseUrl = '',
    defaultModel,
    keyMode,
    localAccessEnabled = false,
    providerId,
  } = {},
  options = {}
) {
  const provider = getProvider(providerId);
  const normalizedKeyMode = keyMode ?? (providerId === 'ollama' ? 'none' : 'encrypted');

  if (!KEY_MODES.has(normalizedKeyMode)) {
    throw new OptionsError('Choose a valid key storage mode.', {
      code: 'invalid_key_mode',
    });
  }

  const storageArea = getStorageArea(options.storageArea);
  const trimmedApiKey = apiKey.trim();
  const currentSettings = await getSettings({ storageArea });
  assertLocalProviderEnabled(providerId, currentSettings, localAccessEnabled);

  if (trimmedApiKey || normalizedKeyMode === 'none') {
    await removeValue(providerId, { storageArea });
  }

  if (trimmedApiKey && normalizedKeyMode === 'encrypted') {
    await setEncryptedValue(providerId, trimmedApiKey, getSessionKey(), { storageArea });
  }

  if (trimmedApiKey && normalizedKeyMode === 'plain') {
    await setPlainValue(providerId, trimmedApiKey, { storageArea });
  }

  await updateSettings(
    (settings) => {
      const storedKeyMode =
        trimmedApiKey || normalizedKeyMode === 'none'
          ? normalizedKeyMode
          : (settings.keyModeByProvider[providerId] ?? normalizedKeyMode);

      return {
        ...settings,
        customBaseUrlByProvider: {
          ...settings.customBaseUrlByProvider,
          [providerId]: providerId === 'openai-compatible' ? customBaseUrl.trim() : '',
        },
        defaultModelByProvider: {
          ...settings.defaultModelByProvider,
          [providerId]: defaultModel?.trim() || provider.defaultModel,
        },
        defaultProviderId: providerId,
        enabledLocalProviderIds: {
          ...settings.enabledLocalProviderIds,
          [providerId]: LOCAL_PROVIDER_IDS.has(providerId) ? Boolean(localAccessEnabled) : false,
        },
        keyModeByProvider: {
          ...settings.keyModeByProvider,
          [providerId]: storedKeyMode,
        },
        verifiedProviderIds: {
          ...settings.verifiedProviderIds,
          [providerId]: false,
        },
      };
    },
    { storageArea }
  );

  return getOptionsSnapshot({ storageArea });
}

export async function testProviderOptions(
  {
    apiKey = '',
    customBaseUrl = '',
    defaultModel,
    keyMode,
    localAccessEnabled = false,
    providerId,
  } = {},
  options = {}
) {
  const provider = getProvider(providerId);
  const resolvedKeyMode = keyMode ?? (providerId === 'ollama' ? 'none' : 'encrypted');
  const settings = await getSettings(options);
  assertLocalProviderEnabled(providerId, settings, localAccessEnabled);
  const key = await resolveProviderKey(providerId, resolvedKeyMode, apiKey, options);
  const connected = await provider.testConnection(key, {
    baseUrl: customBaseUrl?.trim(),
    fetchImpl: options.fetchImpl,
    model: defaultModel?.trim() || provider.defaultModel,
  });
  const verified = connected
    ? testMatchesSavedProviderConfig(
        {
          apiKey,
          customBaseUrl,
          defaultModel,
          keyMode: resolvedKeyMode,
          localAccessEnabled,
          provider,
          providerId,
        },
        settings
      )
    : false;

  await updateSettings(
    (settings) => ({
      ...settings,
      verifiedProviderIds: {
        ...settings.verifiedProviderIds,
        [providerId]: verified,
      },
    }),
    options
  );

  return { connected, verified };
}

export async function completeOnboarding({ providerId } = {}, options = {}) {
  getProvider(providerId);
  const storageArea = getStorageArea(options.storageArea);
  const settings = await getSettings(options);
  assertLocalProviderEnabled(providerId, settings, false);
  const keyStatus = await getKeyStatus(providerId, settings, storageArea);
  const providerConfigured = LOCAL_PROVIDER_IDS.has(providerId) || keyStatus.hasKey;

  if (!providerConfigured) {
    throw new OptionsError('Configure this provider before completing onboarding.', {
      code: 'provider_not_configured',
    });
  }

  if (!settings.verifiedProviderIds[providerId]) {
    throw new OptionsError('Test this provider before completing onboarding.', {
      code: 'provider_not_verified',
    });
  }

  return updateSettings(
    (settings) => ({
      ...settings,
      defaultProviderId: providerId,
      onboardingComplete: true,
      verifiedProviderIds: {
        ...settings.verifiedProviderIds,
        [providerId]: true,
      },
    }),
    options
  );
}

export async function handleOptionsMessage(message, options = {}) {
  if (message?.action === 'options:getSnapshot') {
    return getOptionsSnapshot(options);
  }

  if (message?.action === 'options:unlock') {
    return unlockOptionsSession(message, options);
  }

  if (message?.action === 'options:lock') {
    lockSession();
    return getOptionsSnapshot(options);
  }

  if (message?.action === 'options:saveProvider') {
    return saveProviderOptions(message, options);
  }

  if (message?.action === 'options:testProvider') {
    return testProviderOptions(message, options);
  }

  if (message?.action === 'options:completeOnboarding') {
    return completeOnboarding(message, options);
  }

  return undefined;
}
