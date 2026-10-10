/**
 * Orchestrates "OCR the selected items with MinerU".
 *
 * Selection -> source file per item -> one batch upload -> poll -> download each
 * result -> Markdown child attachment on the item.
 */

import { getString } from "../utils/locale";
import { notifyDesktop } from "../utils/notify";
import { getPref } from "../utils/prefs";
import { extractZipToDirectory } from "../utils/zip";
import { createMarkdownAttachment, MarkdownImageMode } from "./attachment";
import {
  MineruApiError,
  MineruClient,
  MineruFileInput,
  MineruParseOptions,
  MineruResult,
} from "./mineru";

/** File types MinerU's precise-parse API accepts. */
const SUPPORTED_FILE_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "png",
  "jpg",
  "jpeg",
]);

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "tif",
  "tiff",
]);

type SkipReason =
  | "no-parent"
  | "no-file"
  | "file-missing"
  | "unsupported"
  | "duplicate";

interface OcrTarget {
  /** Item the Markdown attachment will be added to. */
  parentItem: Zotero.Item;
  /** Absolute path of the file handed to MinerU. */
  filePath: string;
  fileName: string;
  /** Unique id echoed back by MinerU so results can be matched to items. */
  dataId: string;
}

interface SkippedItem {
  label: string;
  reason: SkipReason;
}

export interface OcrRunSummary {
  succeeded: number;
  failed: number;
  /** Targets still unprocessed when the run was cancelled. */
  cancelled: number;
  skipped: SkippedItem[];
}

/**
 * Thrown at checkpoint boundaries once cancellation has been requested, to
 * unwind whatever step is currently running.
 */
export class RunCancelledError extends Error {
  constructor() {
    super("OCR run cancelled");
    this.name = "RunCancelledError";
  }
}

/**
 * Cancellation state for one run.
 *
 * Cancelling is triggered by closing the progress window: `closeOnClick` is
 * on, so a click closes it, and the wrapper installed by `attach` turns that
 * into a cancel request. Once `settle()` has been called (the run finished),
 * later closes — including the auto-close timer — no longer count.
 */
export class RunHandle {
  cancelRequested = false;
  private settled = false;
  private windowClosed = false;

  /** Wrap a Zotero.ProgressWindow so that closing it mid-run cancels. */
  attach(progressWindow: { close: () => void }): void {
    const originalClose = progressWindow.close.bind(progressWindow);
    progressWindow.close = () => {
      this.windowClosed = true;
      if (!this.settled) {
        this.cancelRequested = true;
      }
      originalClose();
    };
  }

  /** Mark the run as finished; further window closes are not cancellations. */
  settle(): void {
    this.settled = true;
  }

  /** False once the progress window has been closed; UI updates become no-ops. */
  get windowAlive(): boolean {
    return !this.windowClosed;
  }

  /** Checkpoint: throws if the user cancelled the run. */
  throwIfCancelled(): void {
    if (this.cancelRequested) {
      throw new RunCancelledError();
    }
  }
}

/**
 * Run OCR for every item that has a usable file attached.
 * Never throws for per-item problems; those are surfaced in the progress window.
 */
export async function runOcrForItems(
  items: Zotero.Item[],
): Promise<OcrRunSummary> {
  const token = String(getPref("apiToken") ?? "").trim();
  const summary: OcrRunSummary = {
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    skipped: [],
  };

  if (!token) {
    notify(getString("error-no-token"), "fail", getString("progress-header"));
    return summary;
  }
  if (!items.length) {
    notify(
      getString("error-no-selection"),
      "fail",
      getString("progress-header"),
    );
    return summary;
  }

  const { targets, skipped } = await collectTargets(items);
  summary.skipped = skipped;
  if (!targets.length) {
    notify(
      getString("error-nothing-to-ocr", {
        args: { count: skipped.length },
      }),
      "fail",
      getString("progress-header"),
    );
    return summary;
  }

  const progress = new OcrProgress(targets.map((t) => t.fileName));
  const client = new MineruClient(token, String(getPref("apiBase") ?? ""));
  let failureText: string | null = null;

  try {
    progress.setHeadline(getString("progress-reading"));
    const files: MineruFileInput[] = [];
    for (let index = 0; index < targets.length; index++) {
      progress.handle.throwIfCancelled();
      const target = targets[index];
      progress.setLine(index, getString("progress-reading-file"), "default", 5);
      const bytes = await IOUtils.read(target.filePath);
      files.push({
        name: target.fileName,
        dataId: target.dataId,
        bytes,
      });
    }

    progress.setHeadline(getString("progress-uploading"));
    const batch = await client.createBatchUpload(files, readParseOptions());
    for (let index = 0; index < files.length; index++) {
      progress.handle.throwIfCancelled();
      progress.setLine(
        index,
        `${formatBytes(files[index].bytes.length)} — ${getString("progress-uploading-file")}`,
        "default",
        10,
      );
      await client.uploadFile(batch.uploadUrls[index], files[index].bytes);
      progress.setLine(index, getString("progress-queued"), "default", 20);
    }

    progress.setHeadline(getString("progress-parsing"));
    const results = await client.waitForBatch(batch.batchId, {
      intervalMs: Math.max(2, Number(getPref("pollIntervalSec")) || 5) * 1000,
      timeoutMs: Math.max(1, Number(getPref("taskTimeoutMin")) || 30) * 60_000,
      isCancelled: () => progress.handle.cancelRequested,
      onTick: (tickResults) => progress.applyResults(targets, tickResults),
    });

    progress.setHeadline(getString("progress-saving"));
    const imageMode = String(
      getPref("mdImageMode") ?? "folder",
    ) as MarkdownImageMode;
    for (let index = 0; index < targets.length; index++) {
      progress.handle.throwIfCancelled();
      const target = targets[index];
      const result = findResultFor(target, results);
      if (!result) {
        progress.setLine(index, getString("error-no-result"), "fail", 100);
        summary.failed++;
        continue;
      }
      if (result.state === "failed") {
        progress.setLine(
          index,
          result.errMsg || getString("error-task-failed"),
          "fail",
          100,
        );
        summary.failed++;
        continue;
      }
      try {
        await saveResult(client, target, result, imageMode);
        progress.setLine(index, getString("progress-done"), "success", 100);
        summary.succeeded++;
      } catch (error) {
        Zotero.logError(error as Error);
        progress.setLine(index, describeError(error), "fail", 100);
        summary.failed++;
      }
    }

    progress.setHeadline(
      getString("progress-summary", {
        args: {
          succeeded: summary.succeeded,
          failed: summary.failed,
          skipped: skipped.length,
        },
      }),
    );
  } catch (error) {
    if (progress.handle.cancelRequested) {
      summary.cancelled = targets.length - summary.succeeded - summary.failed;
      Zotero.debug(
        `[ZotMD] Run cancelled by the user: ${summary.cancelled} of ${targets.length} file(s) not processed`,
      );
    } else {
      Zotero.logError(error as Error);
      failureText = describeError(error);
      progress.setHeadline(failureText);
    }
  }
  progress.finish();

  notifyOutcome(summary, failureText);

  if (skipped.length) {
    for (const item of skipped) {
      Zotero.debug(`[ZotMD] Skipped "${item.label}": ${item.reason}`);
    }
  }
  return summary;
}

/** Download a result archive, unpack it and attach the Markdown to the item. */
async function saveResult(
  client: MineruClient,
  target: OcrTarget,
  result: MineruResult,
  imageMode: MarkdownImageMode,
): Promise<void> {
  if (!result.fullZipUrl) {
    throw new Error(getString("error-no-result"));
  }
  const zipBytes = await client.downloadZip(result.fullZipUrl);

  const workDir = PathUtils.join(
    PathUtils.tempDir,
    `zotmd-result-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await IOUtils.makeDirectory(workDir, {
    createAncestors: true,
    ignoreExisting: true,
  });

  try {
    const entries = await extractZipToDirectory(zipBytes, workDir);
    const markdownEntry =
      entries.find((entry) => entry === "full.md") ??
      entries.find((entry) => entry.toLowerCase().endsWith(".md"));
    if (!markdownEntry) {
      throw new Error(getString("error-no-markdown"));
    }
    const markdown = await IOUtils.readUTF8(
      PathUtils.join(workDir, ...markdownEntry.split("/")),
    );

    const images = new Map<string, Uint8Array>();
    for (const entry of entries) {
      if (!isImageEntry(entry)) {
        continue;
      }
      images.set(
        entry,
        await IOUtils.read(PathUtils.join(workDir, ...entry.split("/"))),
      );
    }

    const parentTitle =
      (target.parentItem.getField("title") as string) || target.fileName;
    await createMarkdownAttachment({
      parentItem: target.parentItem,
      markdown,
      images,
      mode: imageMode,
      title: getString("attachment-title", { args: { title: parentTitle } }),
    });
  } finally {
    await IOUtils.remove(workDir, { recursive: true, ignoreAbsent: true });
  }
}

/** Work out which items can be OCR'd and which file to send for each. */
export async function collectTargets(items: Zotero.Item[]): Promise<{
  targets: OcrTarget[];
  skipped: SkippedItem[];
}> {
  const targets: OcrTarget[] = [];
  const skipped: SkippedItem[] = [];
  const seenPaths = new Set<string>();

  for (const item of items) {
    const label =
      (item.getField("title") as string) || item.attachmentFilename || "item";
    const parentItem = resolveParentItem(item);
    if (!parentItem) {
      skipped.push({ label, reason: "no-parent" });
      continue;
    }
    const attachment = item.isAttachment()
      ? item
      : await pickSourceAttachment(item);
    if (!attachment || !attachment.isFileAttachment()) {
      skipped.push({ label, reason: "no-file" });
      continue;
    }
    const filePath = await attachment.getFilePathAsync();
    if (!filePath) {
      skipped.push({ label, reason: "file-missing" });
      continue;
    }
    if (!isSupportedFile(filePath)) {
      skipped.push({ label, reason: "unsupported" });
      continue;
    }
    if (seenPaths.has(filePath)) {
      skipped.push({ label, reason: "duplicate" });
      continue;
    }
    seenPaths.add(filePath);
    targets.push({
      parentItem,
      filePath,
      fileName: PathUtils.filename(filePath),
      dataId: attachment.key,
    });
  }

  return { targets, skipped };
}

/**
 * Attachments belong to a regular item; a standalone attachment has nowhere to
 * hang a child attachment, so it is skipped.
 */
function resolveParentItem(item: Zotero.Item): Zotero.Item | null {
  if (!item.isAttachment()) {
    return item;
  }
  const parentID = item.parentItemID;
  if (!parentID) {
    return null;
  }
  return Zotero.Items.get(parentID) || null;
}

/** Prefer the item's PDF, falling back to any other file MinerU can parse. */
async function pickSourceAttachment(
  item: Zotero.Item,
): Promise<Zotero.Item | null> {
  const attachments = item
    .getAttachments()
    .map((id) => Zotero.Items.get(id))
    .filter(
      (attachment): attachment is Zotero.Item =>
        !!attachment && attachment.isFileAttachment(),
    );
  if (!attachments.length) {
    return null;
  }
  const usable: Zotero.Item[] = [];
  for (const attachment of attachments) {
    const path = await attachment.getFilePathAsync();
    if (path && isSupportedFile(path)) {
      usable.push(attachment);
    }
  }
  if (!usable.length) {
    return null;
  }
  return usable.find((attachment) => attachment.isPDFAttachment()) ?? usable[0];
}

function findResultFor(
  target: OcrTarget,
  results: MineruResult[],
): MineruResult | undefined {
  return (
    results.find((result) => result.dataId === target.dataId) ??
    results.find((result) => result.fileName === target.fileName)
  );
}

function readParseOptions(): MineruParseOptions {
  return {
    modelVersion: String(getPref("modelVersion") ?? "vlm"),
    language: String(getPref("language") ?? "ch"),
    isOcr: Boolean(getPref("isOcr")),
    enableFormula: Boolean(getPref("enableFormula")),
    enableTable: Boolean(getPref("enableTable")),
    pageRanges: String(getPref("pageRanges") ?? "").trim() || undefined,
  };
}

function isSupportedFile(path: string): boolean {
  return SUPPORTED_FILE_EXTENSIONS.has(extensionOf(path));
}

function isImageEntry(entry: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(entry));
}

function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function describeError(error: unknown): string {
  if (error instanceof MineruApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function notify(text: string, type: string, header: string): void {
  new ztoolkit.ProgressWindow(header, {
    closeOnClick: true,
    closeTime: 8000,
  })
    .createLine({ text, type, progress: 100 })
    .show();
}

/** Progress window with one line per file, plus a headline for the overall step. */
class OcrProgress {
  readonly handle = new RunHandle();
  private window: InstanceType<ZToolkit["ProgressWindow"]>;

  constructor(fileNames: string[]) {
    this.window = new ztoolkit.ProgressWindow(getString("progress-header"), {
      closeOnClick: true,
      // Negative close time means "stay until dismissed".
      closeTime: -1,
    });
    fileNames.forEach((name, index) => {
      this.window.createLine({
        idx: index,
        text: name,
        type: "default",
        progress: 0,
      });
    });
    this.window.show();
    // `win` is the underlying Zotero.ProgressWindow; `closeOnClick` makes any
    // click close it, and the wrapper turns that into a cancel request.
    this.handle.attach((this.window as any).win);
    this.window.addDescription(getString("progress-cancel-hint"));
  }

  setHeadline(text: string): void {
    if (!this.handle.windowAlive) return;
    this.window.changeHeadline(text);
  }

  setLine(index: number, text: string, type: string, progress: number): void {
    if (!this.handle.windowAlive) return;
    this.window.changeLine({ idx: index, text, type, progress });
  }

  finish(): void {
    // Settle before arming the auto-close timer, so the timer firing later is
    // not mistaken for a cancellation.
    this.handle.settle();
    if (!this.handle.windowAlive) return;
    this.window.startCloseTimer(10_000);
  }

  /** Map MinerU's per-file progress onto the matching progress line. */
  applyResults(targets: OcrTarget[], results: MineruResult[]): void {
    targets.forEach((target, index) => {
      const result = findResultFor(target, results);
      if (!result) {
        return;
      }
      if (result.state === "failed") {
        this.setLine(
          index,
          result.errMsg || getString("error-task-failed"),
          "fail",
          100,
        );
        return;
      }
      if (result.state === "done") {
        this.setLine(index, getString("progress-parsed"), "default", 90);
        return;
      }
      const pages =
        result.totalPages && result.totalPages > 0
          ? Math.round(((result.extractedPages ?? 0) / result.totalPages) * 100)
          : undefined;
      this.setLine(
        index,
        `${getString(`progress-state-${result.state}`)}${formatPageProgress(result)}`,
        "default",
        Math.max(20, Math.min(90, pages ?? 20)),
      );
    });
  }
}

function formatPageProgress(result: MineruResult): string {
  if (!result.totalPages) {
    return "";
  }
  return ` (${result.extractedPages ?? 0}/${result.totalPages})`;
}

/**
 * Post a desktop notification with the final outcome of a run, unless the user
 * turned notifications off. The progress window may already be gone (the user
 * cancelled by closing it), which is exactly when this matters most.
 */
function notifyOutcome(
  summary: OcrRunSummary,
  failureText: string | null,
): void {
  if (!getPref("notifyOnComplete")) {
    return;
  }
  const body = summary.cancelled
    ? getString("progress-cancelled", {
        args: { saved: summary.succeeded, remaining: summary.cancelled },
      })
    : (failureText ??
      getString("progress-summary", {
        args: {
          succeeded: summary.succeeded,
          failed: summary.failed,
          skipped: summary.skipped.length,
        },
      }));
  notifyDesktop(getString("progress-header"), body);
}
