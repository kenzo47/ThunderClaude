import { warn } from '../lib/log.js';
import { ensureCustomEndpointPermission } from '../lib/host-permissions.js';

const thunderbird = globalThis.messenger ?? globalThis.browser;

const steps = {
  done: document.querySelector('#step-done'),
  key: document.querySelector('#step-key'),
  provider: document.querySelector('#step-provider'),
  storage: document.querySelector('#step-storage'),
  welcome: document.querySelector('#step-welcome'),
};

const status = document.querySelector('#status');
const errorMessage = document.querySelector('#error');
const providerGrid = document.querySelector('#provider-grid');
const providerTitle = document.querySelector('#provider-title');
const providerNote = document.querySelector('#provider-note');
const defaultModel = document.querySelector('#default-model');
const customModelField = document.querySelector('#custom-model-field');
const customModel = document.querySelector('#custom-model');
const baseUrlField = document.querySelector('#base-url-field');
const baseUrl = document.querySelector('#base-url');
const keyField = document.querySelector('#key-field');
const apiKey = document.querySelector('#api-key');
const localAccessField = document.querySelector('#local-access-field');
const localAccess = document.querySelector('#local-access');
const storageMode = document.querySelector('#storage-mode');
const storagePhraseField = document.querySelector('#storage-phrase-field');
const storagePhrase = document.querySelector('#storage-phrase');
const plainWarning = document.querySelector('#plain-warning');
const keyModeInputs = [...document.querySelectorAll('[name="key-mode"]')];
const getStarted = document.querySelector('#get-started');
const providerNext = document.querySelector('#provider-next');
const keyBack = document.querySelector('#key-back');
const keyNext = document.querySelector('#key-next');
const storageBack = document.querySelector('#storage-back');
const testProviderButton = document.querySelector('#test-provider');
const openOptions = document.querySelector('#open-options');
const finish = document.querySelector('#finish');

let snapshot = null;
let selectedProviderId = 'ollama';

function setStatus(message) {
  status.textContent = message;
}

function setError(message) {
  errorMessage.hidden = !message;
  errorMessage.textContent = message ?? '';
}

function showStep(stepName) {
  for (const [name, step] of Object.entries(steps)) {
    step.hidden = name !== stepName;
  }
  setError(null);
}

function createOption(value, label = value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

async function sendMessage(message) {
  const response = await thunderbird.runtime.sendMessage(message);

  if (!response?.ok) {
    throw new Error(response?.error?.message ?? 'Onboarding request failed.');
  }

  return response.result;
}

function getProvider() {
  return snapshot.providers.find((provider) => provider.id === selectedProviderId);
}

function selectedKeyMode() {
  return keyModeInputs.find((input) => input.checked)?.value ?? 'encrypted';
}

function getDefaultModelValue() {
  return defaultModel.value === 'custom' ? customModel.value.trim() : defaultModel.value;
}

function renderProviders() {
  providerGrid.replaceChildren(
    ...snapshot.providers.map((provider) => {
      const button = document.createElement('button');
      button.className = 'provider-card';
      button.type = 'button';
      button.classList.toggle('is-selected', provider.id === selectedProviderId);
      button.dataset.providerId = provider.id;
      const name = document.createElement('strong');
      const detail = document.createElement('span');
      name.textContent = provider.label;
      detail.textContent = provider.id === 'ollama' ? 'Free local option' : provider.endpointHost;
      button.replaceChildren(name, detail);
      button.addEventListener('click', () => {
        selectedProviderId = provider.id;
        renderProviders();
      });
      return button;
    })
  );
}

function renderProviderSettings() {
  const provider = getProvider();

  providerTitle.textContent = provider.label;
  providerNote.textContent =
    provider.id === 'ollama'
      ? 'Ollama runs locally and does not need a provider key.'
      : 'Paste a key for testing and storage.';
  defaultModel.replaceChildren(...provider.modelList.map((model) => createOption(model)));
  defaultModel.value = provider.defaultModel;
  customModel.value = '';
  customModelField.hidden = defaultModel.value !== 'custom';
  baseUrlField.hidden = provider.id !== 'openai-compatible';
  keyField.hidden = provider.id === 'ollama';
  localAccessField.hidden = provider.id !== 'ollama';
  localAccess.checked = false;
  storageMode.hidden = provider.id === 'ollama';

  for (const input of keyModeInputs) {
    input.checked = input.value === 'encrypted';
  }

  updateStorageFields();
}

function updateStorageFields() {
  const provider = getProvider();
  const keyMode = selectedKeyMode();

  storagePhraseField.hidden = provider.id === 'ollama' || keyMode !== 'encrypted';
  plainWarning.hidden = provider.id === 'ollama' || keyMode !== 'plain';
}

function providerPayload() {
  const provider = getProvider();
  const model = getDefaultModelValue();

  if (!model) {
    throw new Error('Enter a custom model.');
  }

  if (provider.id === 'openai-compatible' && !baseUrl.value.trim()) {
    throw new Error('Enter a base URL.');
  }

  if (provider.id !== 'ollama' && !apiKey.value.trim()) {
    throw new Error('Enter a provider key.');
  }

  if (provider.id === 'ollama' && !localAccess.checked) {
    throw new Error('Enable local Ollama access.');
  }

  return {
    apiKey: apiKey.value.trim(),
    customBaseUrl: provider.id === 'openai-compatible' ? baseUrl.value.trim() : '',
    defaultModel: model,
    keyMode: provider.id === 'ollama' ? 'none' : selectedKeyMode(),
    localAccessEnabled: provider.id === 'ollama' ? localAccess.checked : false,
    providerId: provider.id,
  };
}

async function testAndSaveProvider() {
  const payload = providerPayload();

  await ensureCustomEndpointPermission(
    payload.providerId,
    payload.customBaseUrl,
    thunderbird.permissions
  );

  if (payload.keyMode === 'encrypted') {
    if (!storagePhrase.value.trim()) {
      throw new Error('Enter a storage phrase.');
    }

    await sendMessage({
      action: 'options:unlock',
      storagePhrase: storagePhrase.value,
    });
  }

  await sendMessage({
    action: 'options:saveProvider',
    ...payload,
  });

  const testResult = await sendMessage({
    action: 'options:testProvider',
    ...payload,
  });

  if (!testResult.connected) {
    throw new Error('Connection test failed.');
  }

  await sendMessage({
    action: 'options:completeOnboarding',
    providerId: payload.providerId,
  });
}

getStarted.addEventListener('click', () => {
  showStep('provider');
});

providerNext.addEventListener('click', () => {
  renderProviderSettings();
  showStep('key');
});

keyBack.addEventListener('click', () => {
  showStep('provider');
});

keyNext.addEventListener('click', () => {
  updateStorageFields();
  showStep('storage');
});

storageBack.addEventListener('click', () => {
  showStep('key');
});

defaultModel.addEventListener('change', () => {
  customModelField.hidden = defaultModel.value !== 'custom';
});

for (const input of keyModeInputs) {
  input.addEventListener('change', updateStorageFields);
}

testProviderButton.addEventListener('click', async () => {
  setError(null);
  testProviderButton.disabled = true;
  setStatus('Testing provider connection...');

  try {
    await testAndSaveProvider();
    apiKey.value = '';
    storagePhrase.value = '';
    setStatus('Provider verified. Setup is complete.');
    showStep('done');
  } catch (error) {
    setError(error.message);
    setStatus('Provider setup needs attention.');
  } finally {
    testProviderButton.disabled = false;
  }
});

openOptions.addEventListener('click', () => {
  thunderbird.runtime.openOptionsPage();
});

finish.addEventListener('click', () => {
  globalThis.close();
});

try {
  snapshot = await sendMessage({
    action: 'options:getSnapshot',
  });
  selectedProviderId = snapshot.settings.onboardingComplete
    ? (snapshot.settings.defaultProviderId ?? 'ollama')
    : 'ollama';
  if (!snapshot.providers.some((provider) => provider.id === selectedProviderId)) {
    selectedProviderId = 'ollama';
  }
  renderProviders();
  showStep(snapshot.settings.onboardingComplete ? 'done' : 'welcome');
  setStatus(
    snapshot.settings.onboardingComplete
      ? 'Setup is complete.'
      : 'Choose a provider, verify it, then open a compose window.'
  );
} catch (error) {
  warn('ThunderClaude onboarding failed to load.', error);
  setError(error.message);
  setStatus('Setup failed to load.');
}
