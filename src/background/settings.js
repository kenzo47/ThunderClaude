const SETTINGS_KEY = 'thunderclaude.settings';

export const DEFAULT_SETTINGS = Object.freeze({
  customBaseUrlByProvider: {},
  defaultModelByProvider: {},
  defaultProviderId: 'anthropic',
  keyModeByProvider: {},
  keySalt: null,
  onboardingComplete: false,
  verifiedProviderIds: {},
});

function getStorageArea(storageArea) {
  const resolvedArea =
    storageArea ?? globalThis.messenger?.storage?.local ?? globalThis.browser?.storage?.local;

  if (!resolvedArea) {
    throw new Error('storage.local is unavailable.');
  }

  return resolvedArea;
}

function normalizeSettings(settings = {}) {
  return {
    customBaseUrlByProvider: {
      ...DEFAULT_SETTINGS.customBaseUrlByProvider,
      ...(settings.customBaseUrlByProvider ?? {}),
    },
    defaultModelByProvider: {
      ...DEFAULT_SETTINGS.defaultModelByProvider,
      ...(settings.defaultModelByProvider ?? {}),
    },
    defaultProviderId: settings.defaultProviderId ?? DEFAULT_SETTINGS.defaultProviderId,
    keyModeByProvider: {
      ...DEFAULT_SETTINGS.keyModeByProvider,
      ...(settings.keyModeByProvider ?? {}),
    },
    keySalt: settings.keySalt ?? DEFAULT_SETTINGS.keySalt,
    onboardingComplete: Boolean(settings.onboardingComplete),
    verifiedProviderIds: {
      ...DEFAULT_SETTINGS.verifiedProviderIds,
      ...(settings.verifiedProviderIds ?? {}),
    },
  };
}

export async function getSettings(options = {}) {
  const storageArea = getStorageArea(options.storageArea);
  const result = await storageArea.get(SETTINGS_KEY);

  return normalizeSettings(result[SETTINGS_KEY]);
}

export async function setSettings(settings, options = {}) {
  const storageArea = getStorageArea(options.storageArea);
  const normalizedSettings = normalizeSettings(settings);

  await storageArea.set({
    [SETTINGS_KEY]: normalizedSettings,
  });

  return normalizedSettings;
}

export async function updateSettings(updater, options = {}) {
  const currentSettings = await getSettings(options);
  const nextSettings = updater(currentSettings);

  return setSettings(nextSettings, options);
}

export function getSettingsKey() {
  return SETTINGS_KEY;
}
