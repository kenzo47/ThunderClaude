const SETTINGS_KEY = 'thunderclaude.settings';

export const DEFAULT_SETTINGS = Object.freeze({
  customBaseUrlByProvider: {},
  defaultModelByProvider: {},
  defaultProviderId: 'openai',
  enabledLocalProviderIds: {},
  keyModeByProvider: {},
  onboardingComplete: false,
  rememberCustomPrompt: true,
  savedCustomPrompt: '',
  theme: 'light',
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
    enabledLocalProviderIds: {
      ...DEFAULT_SETTINGS.enabledLocalProviderIds,
      ...(settings.enabledLocalProviderIds ?? {}),
    },
    keyModeByProvider: {
      ...DEFAULT_SETTINGS.keyModeByProvider,
      ...(settings.keyModeByProvider ?? {}),
    },
    onboardingComplete: Boolean(settings.onboardingComplete),
    rememberCustomPrompt: settings.rememberCustomPrompt !== false,
    savedCustomPrompt:
      typeof settings.savedCustomPrompt === 'string'
        ? settings.savedCustomPrompt.slice(0, 1000)
        : DEFAULT_SETTINGS.savedCustomPrompt,
    theme: settings.theme === 'dark' ? 'dark' : DEFAULT_SETTINGS.theme,
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
