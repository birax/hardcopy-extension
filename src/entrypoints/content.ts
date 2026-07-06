import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';

import { handleProbe, isProbeRequest } from '../lib/messaging';

export default defineContentScript({
  matches: ['https://claude.ai/*'],
  main() {
    // Message listener skeleton: the popup/background probe the page first;
    // export-triggering message types will be added here as they land.
    browser.runtime.onMessage.addListener(
      (message: unknown, _sender, sendResponse: (response: unknown) => void) => {
        if (!isProbeRequest(message)) {
          return;
        }
        void handleProbe().then(sendResponse);
        // Keep the message channel open for the async response (MV3-safe
        // across Chrome and Firefox, unlike returning a Promise directly).
        return true;
      },
    );
  },
});
