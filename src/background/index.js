import { createMessageRouter } from './rewrite.js';
import { warn } from '../lib/log.js';

const thunderbird = globalThis.messenger ?? globalThis.browser;
const handleRuntimeMessage = createMessageRouter({ thunderbird });
const popupWindowByComposeTab = new Map();

async function openComposePopup(tab) {
  if (!tab?.id || !thunderbird.windows?.create) {
    return;
  }

  const existingWindowId = popupWindowByComposeTab.get(tab.id);
  if (existingWindowId && thunderbird.windows.update) {
    try {
      await thunderbird.windows.update(existingWindowId, { focused: true });
      return;
    } catch {
      popupWindowByComposeTab.delete(tab.id);
    }
  }

  const popupUrl = thunderbird.runtime.getURL(`src/popup/popup.html?composeTabId=${tab.id}`);
  const popupWindow = await thunderbird.windows.create({
    height: 650,
    type: 'popup',
    url: popupUrl,
    width: 390,
  });

  if (popupWindow?.id) {
    popupWindowByComposeTab.set(tab.id, popupWindow.id);
  }
}

function forgetPopupWindow(windowId) {
  for (const [tabId, popupWindowId] of popupWindowByComposeTab.entries()) {
    if (popupWindowId === windowId) {
      popupWindowByComposeTab.delete(tabId);
    }
  }
}

thunderbird.runtime.onInstalled.addListener(() => {
  console.info('ThunderClaude installed.');
});

thunderbird.runtime.onMessage.addListener((message) => handleRuntimeMessage(message));

thunderbird.composeAction?.onClicked?.addListener((tab) => {
  openComposePopup(tab).catch((error) => {
    warn('ThunderClaude popup window failed to open.', error);
  });
});

thunderbird.windows?.onRemoved?.addListener(forgetPopupWindow);
