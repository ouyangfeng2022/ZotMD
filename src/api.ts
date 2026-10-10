/**
 * Internal modules exposed on `Zotero.ZotMD.api`.
 *
 * Handy from the "Run JavaScript" console for debugging, and it is what the
 * scaffold test suite drives so it exercises the real loaded modules rather
 * than a second bundled copy.
 */

import * as attachment from "./modules/attachment";
import * as menu from "./modules/menu";
import * as mineru from "./modules/mineru";
import * as ocrTask from "./modules/ocrTask";
import * as notify from "./utils/notify";
import * as zip from "./utils/zip";

export function createApi() {
  return {
    attachment,
    menu,
    mineru,
    notify,
    ocrTask,
    zip,
  };
}

export type AddonApi = ReturnType<typeof createApi>;
