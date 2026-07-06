/**
 * Compute the serializer output a fixture *should* produce, by running the
 * same pipeline the extension runs (parse → prepare → serialize) here in
 * Node. The E2E specs compare the file the real browser downloaded against
 * this, so the assertion is byte-for-byte against the actual serializer —
 * not a hand-maintained snapshot.
 */

import type { ExportFormat } from '../src/lib/export/options';
import { prepareConversation } from '../src/lib/export/prepare';
import { serializeConversation } from '../src/lib/export/serialize';
import { parseConversation } from '../src/lib/parser';

import type { ConversationFixture } from './fixtures';

/**
 * Serialize `fixture` with the default export options (what a fresh popup
 * exports) and return the payload bytes decoded as UTF-8.
 */
export async function expectedSerializedText(
  fixture: ConversationFixture,
  format: ExportFormat,
): Promise<string> {
  const { conversation } = parseConversation(fixture.payload);
  const prepared = prepareConversation(conversation);
  const payload = await serializeConversation(prepared, format);
  return Buffer.from(payload.bytes).toString('utf8');
}
