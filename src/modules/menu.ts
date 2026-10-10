/**
 * Item context menu entry.
 *
 * Uses `ztoolkit.Menu`, which inserts a plain XUL element into
 * `#zotero-itemmenu`. `Zotero.MenuManager` would be the forward-looking choice,
 * but it only exists from Zotero 8 on and this plugin declares Zotero 7 support.
 */

import { getString } from "../utils/locale";
import { runOcrForItems } from "./ocrTask";

export const ITEM_MENU_ID = "zotmd-itemmenu-ocr";

export function registerItemMenu(win: _ZoteroTypes.MainWindow): void {
  const popup = win.document.querySelector(
    "#zotero-itemmenu",
  ) as XUL.MenuPopup | null;
  if (!popup) {
    ztoolkit.log("Item context menu popup not found; skipping registration");
    return;
  }
  ztoolkit.Menu.register(popup, {
    tag: "menuitem",
    id: ITEM_MENU_ID,
    label: getString("menuitem-ocr"),
    icon: `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
    commandListener: () => {
      void onOcrCommand();
    },
    isDisabled: () => !hasRunnableSelection(),
  });
}

export function unregisterItemMenu(win: Window): void {
  win.document.querySelector(`#${ITEM_MENU_ID}`)?.remove();
}

async function onOcrCommand(): Promise<void> {
  const pane = Zotero.getActiveZoteroPane();
  const items = (pane?.getSelectedItems() ?? []).filter(
    (item) => item && !item.deleted,
  );
  await runOcrForItems(items);
}

/**
 * Cheap synchronous check used to grey out the menu entry. The real validation
 * (file exists, type supported) happens once the command runs.
 */
function hasRunnableSelection(): boolean {
  const pane = Zotero.getActiveZoteroPane();
  const items = pane?.getSelectedItems() ?? [];
  return items.some((item) => {
    if (item.isAttachment()) {
      return item.isFileAttachment();
    }
    return item.isRegularItem() && item.getAttachments().length > 0;
  });
}
