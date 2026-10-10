import { getString, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { registerItemMenu, unregisterItemMenu } from "./modules/menu";
import { createZToolkit } from "./utils/ztoolkit";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();
  registerPrefsPane();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Signals to the scaffold test runner that the plugin finished loading.
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();
  registerItemMenu(win);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  // Remove this window's menu entry explicitly: ztoolkit only tracks the
  // toolkit instance created for the most recently loaded window.
  unregisterItemMenu(win);
  try {
    ztoolkit.unregisterAll();
  } catch (error) {
    Zotero.logError(error as Error);
  }
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  for (const win of Zotero.getMainWindows()) {
    unregisterItemMenu(win);
  }
  try {
    ztoolkit.unregisterAll();
  } catch (error) {
    Zotero.logError(error as Error);
  }
  addon.data.dialog?.window?.close();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

function registerPrefsPane(): void {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    stylesheets: [rootURI + "content/preferences.css"],
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
}

/**
 * Dispatcher for preference pane events. Hooks stay thin; the work lives in
 * `modules/preferenceScript`.
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
};
