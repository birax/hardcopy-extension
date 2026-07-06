import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: ['https://claude.ai/*'],
  main() {
    // Intentionally empty: no behaviour (and no logging) ships in this stub.
    //
    // TODO(M2 data layer): implement the claude.ai API client and conversation
    // parser here — same-origin fetch with `credentials: 'include'` against
    // /api/organizations/{orgId}/chat_conversations/{convId}. See
    // docs/decisions/0006-core-architecture.md and the M2 data-layer issue.
  },
});
