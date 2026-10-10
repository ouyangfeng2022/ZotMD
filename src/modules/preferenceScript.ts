/**
 * Logic for the ZotMD preference pane. The pane markup lives in
 * `addon/content/preferences.xhtml`.
 */

import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { getPref } from "../utils/prefs";
import { MineruClient } from "./mineru";

export function registerPrefsScripts(window: Window): void {
  bindTokenCheck(window);
}

/**
 * "Check token" button: hits a harmless MinerU endpoint so a bad token is
 * caught here rather than after a failed OCR run.
 */
function bindTokenCheck(window: Window): void {
  const doc = window.document;
  const button = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-checkToken`,
  ) as XUL.Button | null;
  const status = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-checkResult`,
  ) as HTMLElement | null;
  if (!button || !status) {
    ztoolkit.log("Preference pane: token check widgets not found");
    return;
  }

  button.addEventListener("command", () => {
    void (async () => {
      const input = doc.querySelector(
        `#zotero-prefpane-${config.addonRef}-apiToken`,
      ) as HTMLInputElement | null;
      // Read the field rather than the pref so a freshly typed token works
      // before Zotero has flushed it.
      const token = (input?.value ?? String(getPref("apiToken") ?? "")).trim();
      if (!token) {
        setStatus(status, "error", getString("pref-token-missing"));
        return;
      }
      setStatus(status, "pending", getString("pref-token-checking"));
      button.disabled = true;
      try {
        await new MineruClient(
          token,
          String(getPref("apiBase") ?? ""),
        ).verifyToken();
        setStatus(status, "ok", getString("pref-token-valid"));
      } catch (error) {
        Zotero.logError(error as Error);
        setStatus(
          status,
          "error",
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        button.disabled = false;
      }
    })();
  });
}

function setStatus(
  element: HTMLElement,
  state: "ok" | "error" | "pending",
  text: string,
): void {
  element.textContent = text;
  element.dataset.state = state;
}
