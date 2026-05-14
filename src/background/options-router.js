import './providers/anthropic.js';
import './providers/deepseek.js';
import './providers/gemini.js';
import './providers/local-llms.js';
import './providers/minimax.js';
import './providers/openai-compatible.js';
import './providers/openai.js';
import './providers/openrouter.js';

import { isOllamaBaseUrl } from './providers/local-llms.js';
import { getProvider, listProviders } from './providers/index.js';
import { getSettings, updateSettings } from './settings.js';
import {
  getEncryptedValue,
  getStorageArea,
  getStorageKeys,
  removeValue,
  setEncryptedValue,
} from './secure-storage.js';

const LOCAL_PROVIDER_IDS = new Set(['local-llms']);

export class OptionsError extends Error {
  constructor(message, { code = 'options_error' } = {}) {
    super(message);
    this.name = 'OptionsError';
    this.code = code;
  }
}

function redactErrorMessage(message) {
  return String(message)
    .replace(/sk-[a-zA-Z0-9_-]+/g, 'sk-...')
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer ...');
}

function serializeConnectionError(error) {
  return {
    code: error?.code ?? 'provider_connection_failed',
    message: redactErrorMessage(error?.message ?? 'Provider connection failed.'),
    status: error?.status ?? null,
  };
}

function serializeProvider(provider) {
  const serialized = {
    defaultModel: provider.defaultModel,
    endpointHost: provider.endpointHost,
    id: provider.id,
    keyHelpUrl: provider.keyHelpUrl,
    label: provider.label,
    modelList: provider.modelList,
  };

  if (provider.defaultBaseUrl) {
    serialized.defaultBaseUrl = provider.defaultBaseUrl;
  }

  if (provider.alternateBaseUrls) {
    serialized.alternateBaseUrls = provider.alternateBaseUrls;
  }

  return serialized;
}

async function readStorageKey(storageArea, key) {
  const result = await storageArea.get(key);
  return result[key];
}

async function getKeyStatus(providerId, storageArea) {
  const keys = getStorageKeys(providerId);
  const hasEncrypted = Boolean(await readStorageKey(storageArea, keys.encrypted));
  const hasLegacyPlain = Boolean(await readStorageKey(storageArea, keys.legacyPlain));

  if (hasLegacyPlain) {
    await storageArea.remove([keys.legacyPlain]);
  }

  return {
    hasKey: LOCAL_PROVIDER_IDS.has(providerId) ? false : hasEncrypted,
    keyMode: getExpectedKeyMode(providerId),
  };
}

function getExpectedKeyMode(providerId) {
  if (LOCAL_PROVIDER_IDS.has(providerId)) {
    return 'none';
  }

  return 'encrypted';
}

function assertValidKeyMode(providerId, keyMode) {
  const expectedKeyMode = getExpectedKeyMode(providerId);

  if (keyMode !== expectedKeyMode) {
    throw new OptionsError('Provider keys must use encrypted storage.', {
      code: 'invalid_key_mode',
    });
  }
}

async function resolveProviderKey(providerId, keyMode, apiKey, options = {}) {
  if (LOCAL_PROVIDER_IDS.has(providerId)) {
    return '';
  }

  if (apiKey?.trim()) {
    return apiKey.trim();
  }

  assertValidKeyMode(providerId, keyMode);

  const encryptedValue = await getEncryptedValue(providerId, options);
  if (encryptedValue !== null) {
    return encryptedValue;
  }

  throw new OptionsError('Provider API key is not configured.', {
    code: 'missing_provider_key',
  });
}

function getProviderConfig(settings, providerId, keyStatus) {
  const provider = getProvider(providerId);
  const customBaseUrl =
    settings.customBaseUrlByProvider[providerId] ?? provider.defaultBaseUrl ?? '';
  const requiresLocalAccess = LOCAL_PROVIDER_IDS.has(providerId) && isOllamaBaseUrl(customBaseUrl);

  return {
    customBaseUrl,
    defaultModel: settings.defaultModelByProvider[providerId] ?? provider.defaultModel,
    hasKey: keyStatus.hasKey,
    keyMode: keyStatus.keyMode,
    localAccessEnabled: requiresLocalAccess
      ? settings.enabledLocalProviderIds[providerId] !== false
      : false,
    verified: Boolean(settings.verifiedProviderIds[providerId]),
  };
}

function requiresLocalAccess(providerId, baseUrl) {
  return LOCAL_PROVIDER_IDS.has(providerId) && isOllamaBaseUrl(baseUrl);
}

function assertLocalProviderEnabled(providerId, baseUrl, settings, localAccessEnabled) {
  if (!requiresLocalAccess(providerId, baseUrl)) {
    return;
  }

  if (localAccessEnabled || settings.enabledLocalProviderIds[providerId]) {
    return;
  }

  throw new OptionsError('Enable local LLM access before connecting to localhost.', {
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

  const resolvedKeyMode = keyMode ?? getExpectedKeyMode(providerId);
  const savedKeyMode = getExpectedKeyMode(providerId);
  const savedModel = settings.defaultModelByProvider[providerId] ?? provider.defaultModel;
  const testedModel = defaultModel?.trim() || savedModel;
  const savedBaseUrl =
    settings.customBaseUrlByProvider[providerId] ?? provider.defaultBaseUrl ?? '';
  const testedBaseUrl = customBaseUrl.trim() || savedBaseUrl;
  const savedLocalAccess = requiresLocalAccess(providerId, savedBaseUrl)
    ? settings.enabledLocalProviderIds[providerId] !== false
    : false;
  const testedLocalAccess = requiresLocalAccess(providerId, testedBaseUrl)
    ? Boolean(localAccessEnabled)
    : false;

  return (
    resolvedKeyMode === savedKeyMode &&
    testedModel === savedModel &&
    testedBaseUrl === savedBaseUrl &&
    testedLocalAccess === savedLocalAccess
  );
}

function findVerifiedProviderId(settings, providers = listProviders()) {
  if (settings.verifiedProviderIds[settings.defaultProviderId]) {
    return settings.defaultProviderId;
  }

  return providers.find((provider) => settings.verifiedProviderIds[provider.id])?.id ?? null;
}

export async function getOptionsSnapshot(options = {}) {
  const storageArea = getStorageArea(options.storageArea);
  let settings = await getSettings({ storageArea });
  const providers = listProviders().map(serializeProvider);
  const providerConfigs = {};
  const verifiedProviderId = findVerifiedProviderId(settings, providers);

  if (!settings.onboardingComplete && verifiedProviderId) {
    settings = await updateSettings(
      (settings) => ({
        ...settings,
        defaultProviderId: verifiedProviderId,
        onboardingComplete: true,
      }),
      { storageArea }
    );
  }

  for (const provider of providers) {
    const keyStatus = await getKeyStatus(provider.id, storageArea);
    providerConfigs[provider.id] = getProviderConfig(settings, provider.id, keyStatus);
  }

  return {
    providerConfigs,
    providers,
    settings,
  };
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
  const normalizedKeyMode = keyMode ?? getExpectedKeyMode(providerId);
  assertValidKeyMode(providerId, normalizedKeyMode);

  const storageArea = getStorageArea(options.storageArea);
  const trimmedApiKey = apiKey.trim();
  const currentSettings = await getSettings({ storageArea });
  const savedBaseUrl = customBaseUrl.trim() || provider.defaultBaseUrl || '';
  assertLocalProviderEnabled(providerId, savedBaseUrl, currentSettings, localAccessEnabled);

  if (trimmedApiKey || normalizedKeyMode === 'none') {
    await removeValue(providerId, { storageArea });
  }

  if (trimmedApiKey && normalizedKeyMode === 'encrypted') {
    await setEncryptedValue(providerId, trimmedApiKey, { storageArea });
  }

  await updateSettings(
    (settings) => {
      const storedKeyMode =
        trimmedApiKey || normalizedKeyMode === 'none'
          ? normalizedKeyMode
          : getExpectedKeyMode(providerId);

      return {
        ...settings,
        customBaseUrlByProvider: {
          ...settings.customBaseUrlByProvider,
          [providerId]: savedBaseUrl,
        },
        defaultModelByProvider: {
          ...settings.defaultModelByProvider,
          [providerId]: defaultModel?.trim() || provider.defaultModel,
        },
        defaultProviderId: providerId,
        enabledLocalProviderIds: {
          ...settings.enabledLocalProviderIds,
          [providerId]: requiresLocalAccess(providerId, savedBaseUrl)
            ? Boolean(localAccessEnabled)
            : false,
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
  const resolvedKeyMode = keyMode ?? getExpectedKeyMode(providerId);
  assertValidKeyMode(providerId, resolvedKeyMode);
  const settings = await getSettings(options);
  const savedBaseUrl =
    settings.customBaseUrlByProvider[providerId] ?? provider.defaultBaseUrl ?? '';
  const testedBaseUrl = customBaseUrl?.trim() || savedBaseUrl;
  const savedModel = settings.defaultModelByProvider[providerId] ?? provider.defaultModel;
  const testedModel = defaultModel?.trim() || savedModel;
  assertLocalProviderEnabled(providerId, testedBaseUrl, settings, localAccessEnabled);
  const key = await resolveProviderKey(providerId, resolvedKeyMode, apiKey, options);
  let connected = false;
  let connectionError = null;

  try {
    connected = await provider.testConnection(key, {
      baseUrl: testedBaseUrl,
      fetchImpl: options.fetchImpl,
      model: testedModel,
      throwOnError: true,
    });
  } catch (error) {
    connectionError = serializeConnectionError(error);
  }

  const matchesSavedConfig = testMatchesSavedProviderConfig(
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
  );
  const verified = connected && matchesSavedConfig;

  if (matchesSavedConfig) {
    await updateSettings(
      (settings) => ({
        ...settings,
        defaultProviderId: verified ? providerId : settings.defaultProviderId,
        onboardingComplete: verified ? true : settings.onboardingComplete,
        verifiedProviderIds: {
          ...settings.verifiedProviderIds,
          [providerId]: verified,
        },
      }),
      options
    );
  }

  return {
    connected,
    ...(connectionError ? { error: connectionError } : {}),
    verified,
  };
}

export async function completeOnboarding({ providerId } = {}, options = {}) {
  getProvider(providerId);
  const storageArea = getStorageArea(options.storageArea);
  const settings = await getSettings(options);
  const provider = getProvider(providerId);
  const savedBaseUrl =
    settings.customBaseUrlByProvider[providerId] ?? provider.defaultBaseUrl ?? '';
  assertLocalProviderEnabled(providerId, savedBaseUrl, settings, false);
  const keyStatus = await getKeyStatus(providerId, storageArea);
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

export async function setThemeOptions({ theme } = {}, options = {}) {
  const normalizedTheme = theme === 'dark' ? 'dark' : 'light';

  return updateSettings(
    (settings) => ({
      ...settings,
      theme: normalizedTheme,
    }),
    options
  );
}

export async function handleOptionsMessage(message, options = {}) {
  if (message?.action === 'options:getSnapshot') {
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

  if (message?.action === 'options:setTheme') {
    return setThemeOptions(message, options);
  }

  return undefined;
}
