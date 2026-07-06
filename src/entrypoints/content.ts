import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';

import { handleExport, handleProbe, isExportRequest, isProbeRequest } from '../lib/messaging';

export default defineContentScript({
  matches: ['https://claude.ai/*'],
  main() {
    // The popup/background probe the page first (hardcopy:probe), then ask it
    // to run an export end to end (hardcopy:export). Each handler responds
    // via sendResponse and returns `true` to keep the message channel open
    // for the async response (MV3-safe across Chrome and Firefox, unlike
    // returning a Promise directly).
    browser.runtime.onMessage.addListener(
      (message: unknown, _sender, sendResponse: (response: unknown) => void) => {
        if (isProbeRequest(message)) {
          void handleProbe().then(sendResponse);
          return true;
        }
        if (isExportRequest(message)) {
          void handleExport(message).then(sendResponse);
          return true;
        }
        return;
      },
    );
  },
});
