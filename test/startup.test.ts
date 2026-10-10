import { assert } from "chai";
import { config } from "../package.json";

/** The plugin instance lives on Zotero under its addonInstance name. */
function plugin(): any {
  return (Zotero as any)[config.addonInstance];
}

describe("startup", function () {
  it("should have plugin instance defined", function () {
    assert.isNotEmpty(plugin());
  });

  it("should expose its internal modules on api", function () {
    const api = plugin().api;
    assert.isFunction(api.zip.extractZipToDirectory);
    assert.isFunction(api.ocrTask.runOcrForItems);
    assert.isFunction(api.ocrTask.collectTargets);
    assert.isFunction(api.attachment.createMarkdownAttachment);
  });

  it("should register the item context menu entry", function () {
    const menuId = plugin().api.menu.ITEM_MENU_ID;
    const win = Zotero.getMainWindow();
    const menuItem = win.document.querySelector(`#${menuId}`);
    assert.isNotNull(menuItem, `#${menuId} was not added to the item menu`);
    assert.match(menuItem!.getAttribute("label") ?? "", /MinerU/);
  });

  it("should register the preferences pane", function () {
    const panes = Zotero.PreferencePanes.pluginPanes.filter(
      (pane: any) => pane.pluginID === config.addonID,
    );
    assert.isNotEmpty(panes, "ZotMD preference pane was not registered");
  });

  it("should register defaults for every preference", function () {
    const keys = [
      "apiToken",
      "apiBase",
      "modelVersion",
      "language",
      "isOcr",
      "enableFormula",
      "enableTable",
      "pageRanges",
      "mdImageMode",
      "notifyOnComplete",
      "pollIntervalSec",
      "taskTimeoutMin",
    ];
    for (const key of keys) {
      assert.isDefined(
        Zotero.Prefs.get(`${config.prefsPrefix}.${key}`, true),
        `preference ${key} has no default`,
      );
    }
  });
});
