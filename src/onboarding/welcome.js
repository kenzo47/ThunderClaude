import { warn } from '../lib/log.js';
import { ensureCustomEndpointPermission } from '../lib/host-permissions.js';

const thunderbird = globalThis.messenger ?? globalThis.browser;

const steps = {
  done: document.querySelector('#step-done'),
  key: document.querySelector('#step-key'),
  provider: document.querySelector('#step-provider'),
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
const baseUrl = document.querySelector('#base-url');
const keyField = document.querySelector('#key-field');
const apiKey = document.querySelector('#api-key');
const localAccessField = document.querySelector('#local-access-field');
const localAccess = document.querySelector('#local-access');
const storageNote = document.querySelector('#storage-note');
const getStarted = document.querySelector('#get-started');
const providerNext = document.querySelector('#provider-next');
const keyBack = document.querySelector('#key-back');
const testProviderButton = document.querySelector('#test-provider');
const openOptions = document.querySelector('#open-options');
const finish = document.querySelector('#finish');

let snapshot = null;
let selectedProviderId = 'local-llms';

function isOllamaBaseUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === 'localhost' && url.port === '11434';
  } catch {
    return false;
  }
}

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
      detail.textContent =
        provider.id === 'local-llms' ? 'Free local option' : provider.endpointHost;
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
    provider.id === 'local-llms'
      ? 'Use http://localhost:11434 for Ollama or http://localhost:1234/v1 for LM Studio.'
      : 'Paste a key for testing and storage.';
  defaultModel.replaceChildren(...provider.modelList.map((model) => createOption(model)));
  defaultModel.value = provider.defaultModel;
  customModel.value = '';
  customModelField.hidden = defaultModel.value !== 'custom';
  baseUrl.value = provider.defaultBaseUrl || '';
  keyField.hidden = provider.id === 'local-llms';
  renderLocalAccess(provider);
  storageNote.hidden = provider.id === 'local-llms';
}

function renderLocalAccess(provider = getProvider()) {
  const showLocalAccess = provider.id === 'local-llms' && isOllamaBaseUrl(baseUrl.value.trim());

  localAccessField.hidden = !showLocalAccess;
  localAccess.checked = showLocalAccess;
}

function providerPayload() {
  const provider = getProvider();
  const model = getDefaultModelValue();

  if (!model) {
    throw new Error('Enter a custom model.');
  }

  if (!baseUrl.value.trim()) {
    throw new Error('Enter a base URL.');
  }

  if (provider.id !== 'local-llms' && !apiKey.value.trim()) {
    throw new Error('Enter a provider key.');
  }

  if (
    provider.id === 'local-llms' &&
    isOllamaBaseUrl(baseUrl.value.trim()) &&
    !localAccess.checked
  ) {
    throw new Error('Enable Ollama localhost access.');
  }

  return {
    apiKey: apiKey.value.trim(),
    customBaseUrl: baseUrl.value.trim(),
    defaultModel: model,
    keyMode: provider.id === 'local-llms' ? 'none' : 'encrypted',
    localAccessEnabled:
      provider.id === 'local-llms' && isOllamaBaseUrl(baseUrl.value.trim())
        ? localAccess.checked
        : false,
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

  await sendMessage({
    action: 'options:saveProvider',
    ...payload,
  });

  const testResult = await sendMessage({
    action: 'options:testProvider',
    ...payload,
    apiKey: '',
  });

  if (!testResult.connected || !testResult.verified) {
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

defaultModel.addEventListener('change', () => {
  customModelField.hidden = defaultModel.value !== 'custom';
});

baseUrl.addEventListener('input', () => {
  renderLocalAccess();
});

testProviderButton.addEventListener('click', async () => {
  setError(null);
  testProviderButton.disabled = true;
  setStatus('Testing provider connection...');

  try {
    await testAndSaveProvider();
    apiKey.value = '';
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
    ? (snapshot.settings.defaultProviderId ?? 'local-llms')
    : 'local-llms';
  if (!snapshot.providers.some((provider) => provider.id === selectedProviderId)) {
    selectedProviderId = 'local-llms';
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
