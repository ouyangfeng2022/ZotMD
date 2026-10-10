/**
 * Desktop notification for finished background runs.
 *
 * Zotero itself has no in-app toast API (the progress window is all there is),
 * so this goes through the platform alerts service, which the OS renders as a
 * native notification. The alerts service is injected so tests can stub it;
 * when it is missing — or the OS refuses — the failure is swallowed, because
 * the progress window still reports the outcome.
 */

/** Minimal shape of `Services.alerts` this plugin needs. */
export interface AlertsServiceLike {
  showAlertNotification(
    imageURL: string,
    title: string,
    text: string,
    textClickable?: boolean,
    cookie?: string,
    alertListener?: AlertListenerLike,
    name?: string,
  ): void;
}

export interface AlertListenerLike {
  observe(subject: unknown, topic: string, data: string): void;
}

import { getComponents } from "./xpcom";

/** Alert topics the platform fires at the listener. */
const ALERT_CLICK_TOPIC = "alertclickcallback";

/** XPCOM contract of the platform alerts service. */
const ALERTS_CONTRACT_ID = "@mozilla.org/system-alerts-service;1";

/**
 * @returns whether the notification was handed to the OS. False means it was
 * skipped (no alert service) or the service threw; the caller does not need to
 * react — the progress window still reports the outcome either way.
 */
export function notifyDesktop(
  title: string,
  body: string,
  alertsService: AlertsServiceLike | undefined | null = defaultAlertsService(),
): boolean {
  try {
    if (!alertsService?.showAlertNotification) {
      Zotero.debug("[ZotMD] No system alert service; skipping notification");
      return false;
    }
    alertsService.showAlertNotification(
      `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
      title,
      body,
      // Clicking the toast brings Zotero back to the front.
      true,
      "zotmd-outcome",
      {
        observe(_subject: unknown, topic: string) {
          if (topic === ALERT_CLICK_TOPIC) {
            focusMainZoteroWindow();
          }
        },
      },
      // A stable name lets a new notification replace the previous one
      // instead of stacking.
      "zotmd",
    );
    return true;
  } catch (error) {
    Zotero.debug(`[ZotMD] Desktop notification failed: ${error}`);
    return false;
  }
}

/**
 * Resolve the platform alerts service.
 *
 * This deliberately goes through the XPCOM contract rather than the sandbox's
 * `Services` object: the plugin sandbox's `Services` is whatever Zotero
 * injected, and on Zotero 10 it turned out not to expose `alerts`, while the
 * contract resolves process-wide either way.
 */
function defaultAlertsService(): AlertsServiceLike | undefined {
  try {
    const components = getComponents();
    return components.classes[ALERTS_CONTRACT_ID].getService(
      components.interfaces.nsIAlertsService,
    ) as AlertsServiceLike;
  } catch {
    return (globalThis as any).Services?.alerts;
  }
}

function focusMainZoteroWindow(): void {
  try {
    const win = Zotero.getMainWindow();
    if (win && !win.closed) {
      win.focus();
    }
  } catch (error) {
    Zotero.debug(`[ZotMD] Could not focus Zotero window: ${error}`);
  }
}
