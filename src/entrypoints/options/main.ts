/**
 * Options entrypoint: thin glue only — everything with behavior lives in
 * src/lib/options/ (view, controller, template helpers), where it is
 * unit-tested. Same discipline as the popup entrypoint.
 */

import { initOptions } from '../../lib/options/controller';

void initOptions(document);
