/**
 * Popup entrypoint: thin glue only — everything with behavior lives in
 * src/lib/popup/ (state machine, view, controller), where it is unit-tested.
 */

import { initPopup } from '../../lib/popup/controller';

void initPopup(document);
