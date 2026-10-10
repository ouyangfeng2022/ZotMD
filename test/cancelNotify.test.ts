import { assert } from "chai";
import { config } from "../package.json";
import type {
  RunCancelledError as RunCancelledErrorType,
  RunHandle as RunHandleType,
} from "../src/modules/ocrTask";
import type { AlertsServiceLike } from "../src/utils/notify";

function plugin(): any {
  return (Zotero as any)[config.addonInstance];
}

function ocrApi(): {
  RunHandle: new () => RunHandleType;
  RunCancelledError: new () => RunCancelledErrorType;
} {
  return plugin().api.ocrTask;
}

function notifyApi(): {
  notifyDesktop: (
    title: string,
    body: string,
    alertsService?: AlertsServiceLike | null,
  ) => boolean;
} {
  return plugin().api.notify;
}

/** The classes are reached through the plugin instance so `instanceof` matches. */
function capture(fn: () => unknown): any {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}

describe("cancellation", function () {
  it("treats closing the window as a cancel request and passes close through", function () {
    const handle = new (ocrApi().RunHandle)();
    let closed = 0;
    const fakeWindow = {
      close: () => {
        closed++;
      },
    };
    handle.attach(fakeWindow);

    assert.isTrue(handle.windowAlive);
    fakeWindow.close();

    assert.isTrue(handle.cancelRequested, "close should request cancellation");
    assert.isFalse(handle.windowAlive);
    assert.equal(closed, 1, "the original close must still run");
  });

  it("ignores closes that happen after the run has settled", function () {
    const handle = new (ocrApi().RunHandle)();
    const fakeWindow = { close: () => {} };
    handle.attach(fakeWindow);

    handle.settle();
    fakeWindow.close();

    assert.isFalse(handle.cancelRequested, "auto-close is not a cancellation");
    assert.isFalse(handle.windowAlive);
  });

  it("throws a RunCancelledError at checkpoints once cancelled", function () {
    const handle = new (ocrApi().RunHandle)();
    handle.throwIfCancelled();

    const fakeWindow = { close: () => {} };
    handle.attach(fakeWindow);
    fakeWindow.close();

    const error = capture(() => handle.throwIfCancelled());
    assert.instanceOf(error, ocrApi().RunCancelledError);
    assert.equal(error.name, "RunCancelledError");
  });

  it("turns closing a real Zotero progress window into a cancel request", function () {
    // Exercises the actual monkey-patch used by OcrProgress against a live
    // Zotero.ProgressWindow instance.
    const helper = new (plugin().data.ztoolkit as any).ProgressWindow(
      "ZotMD test",
      { closeOnClick: true, closeTime: -1 },
    );
    helper.createLine({ text: "probe", type: "default", progress: 0 }).show();

    const handle = new (ocrApi().RunHandle)();
    handle.attach((helper as any).win);

    assert.isTrue(handle.windowAlive);
    assert.isFalse(handle.cancelRequested);
    (helper as any).win.close();
    assert.isTrue(handle.cancelRequested);
    assert.isFalse(handle.windowAlive);
  });

  describe("desktop notification", function () {
    it("hands title, body and clickability to the alerts service", function () {
      const calls: unknown[][] = [];
      const alerts: AlertsServiceLike = {
        showAlertNotification: (...args: unknown[]) => {
          calls.push(args);
        },
      };

      assert.isTrue(notifyApi().notifyDesktop("Title", "Body", alerts));

      assert.lengthOf(calls, 1);
      const [imageURL, title, body, clickable, , listener, name] =
        calls[0] as unknown[];
      assert.include(String(imageURL), "favicon");
      assert.equal(title, "Title");
      assert.equal(body, "Body");
      assert.strictEqual(clickable, true, "the toast should be clickable");
      assert.equal(
        name,
        "zotmd",
        "a stable name lets toasts replace each other",
      );
      assert.isFunction((listener as any).observe);
      // Clicking must not throw even against the real main window.
      (listener as any).observe(null, "alertclickcallback", "");
      // Unrelated topics are ignored.
      (listener as any).observe(null, "alertfinished", "");
    });

    it("does nothing when there is no alerts service", function () {
      assert.isFalse(notifyApi().notifyDesktop("Title", "Body", null));
      assert.isFalse(
        notifyApi().notifyDesktop("Title", "Body", {} as AlertsServiceLike),
      );
    });

    it("swallows errors thrown by the alerts service", function () {
      const alerts: AlertsServiceLike = {
        showAlertNotification: () => {
          throw new Error("OS said no");
        },
      };
      assert.isFalse(notifyApi().notifyDesktop("Title", "Body", alerts));
    });

    it("handles the default platform alerts service without throwing", function () {
      // Exercise the real XPCOM resolution. Headless Linux runners may have
      // no desktop notification service, in which case false is expected.
      // Success and failure are checked deterministically above with stubs.
      assert.isBoolean(notifyApi().notifyDesktop("ZotMD", "Test notification"));
    });
  });
});
