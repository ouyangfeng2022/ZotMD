/**
 * Access to the privileged `Components` object.
 *
 * `Components` is not part of the documented plugin sandbox globals, so look it
 * up defensively (sandbox first, then the main window) rather than assuming it
 * is present.
 */
export function getComponents(): any {
  const sandbox = globalThis as any;
  if (sandbox.Components?.classes) {
    return sandbox.Components;
  }
  const win = (Zotero as any).getMainWindow?.();
  if (win?.Components?.classes) {
    return win.Components;
  }
  throw new Error(
    "Cannot reach Components; privileged XPCOM services are unavailable here",
  );
}
