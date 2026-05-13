import { createMessageRouter } from './rewrite.js';

const thunderbird = globalThis.messenger ?? globalThis.browser;
const handleRuntimeMessage = createMessageRouter({ thunderbird });

thunderbird.runtime.onInstalled.addListener(() => {
  console.info('ThunderClaude installed.');
});

thunderbird.runtime.onMessage.addListener((message) => handleRuntimeMessage(message));
