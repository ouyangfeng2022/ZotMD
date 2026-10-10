/**
 * Turns a MinerU result into a Markdown child attachment on a Zotero item.
 *
 * MinerU zips contain `full.md` plus an `images/` tree that the Markdown
 * references relatively. Three ways of dealing with those images are supported:
 *
 *  - `folder` (default): the `.md` goes in as a stored attachment and the images
 *    are written next to it inside the same Zotero storage directory, so the
 *    relative links in the Markdown keep working. The Markdown itself stays
 *    small and easy to read or edit.
 *  - `base64`: images are inlined as `data:` URIs, producing one self-contained
 *    file. Portable, but the file gets large.
 *  - `none`: image references are dropped, leaving text only.
 */

export type MarkdownImageMode = "folder" | "base64" | "none";

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
};

const IMAGE_REFERENCE_PATTERN =
  /!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g;

export interface MarkdownAttachmentInput {
  /** Item the attachment is added to (usually the bibliographic item). */
  parentItem: Zotero.Item;
  markdown: string;
  /** Map of zip-relative path (e.g. `images/fig1.jpg`) to file contents. */
  images: Map<string, Uint8Array>;
  mode: MarkdownImageMode;
  /** Attachment title; also drives the stored file name. */
  title: string;
}

/**
 * Create the Markdown attachment.
 * @returns the newly created attachment item.
 */
export async function createMarkdownAttachment(
  input: MarkdownAttachmentInput,
): Promise<Zotero.Item> {
  const { parentItem, images, mode, title } = input;
  const markdown = rewriteImageLinks(input.markdown, images, mode);

  const tempDir = PathUtils.join(
    PathUtils.tempDir,
    `zotmd-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await IOUtils.makeDirectory(tempDir, {
    createAncestors: true,
    ignoreExisting: true,
  });

  try {
    const fileBaseName = sanitizeFileBaseName(title);
    const markdownPath = PathUtils.join(tempDir, `${fileBaseName}.md`);
    await IOUtils.writeUTF8(markdownPath, markdown);

    const attachment = await Zotero.Attachments.importFromFile({
      file: markdownPath,
      parentItemID: parentItem.id,
      title,
      fileBaseName,
      contentType: "text/markdown",
    });

    if (mode === "folder" && images.size) {
      await writeImagesBesideAttachment(attachment, images);
    }
    return attachment;
  } finally {
    await IOUtils.remove(tempDir, { recursive: true, ignoreAbsent: true });
  }
}

/**
 * Copy images into the attachment's own storage directory, mirroring the paths
 * the Markdown already uses. Zotero stores single-file attachments as
 * `storage/<KEY>/<file>`, so a sibling `images/` directory resolves correctly.
 */
async function writeImagesBesideAttachment(
  attachment: Zotero.Item,
  images: Map<string, Uint8Array>,
): Promise<void> {
  const storageDir = Zotero.Attachments.getStorageDirectory(attachment).path;
  for (const [relativePath, bytes] of images) {
    const safePath = sanitizeRelativePath(relativePath);
    if (!safePath) {
      Zotero.debug(`[ZotMD] Skipping unsafe image path: ${relativePath}`);
      continue;
    }
    const targetPath = PathUtils.join(storageDir, ...safePath.split("/"));
    const parentDir = PathUtils.parent(targetPath);
    if (parentDir) {
      await IOUtils.makeDirectory(parentDir, {
        createAncestors: true,
        ignoreExisting: true,
      });
    }
    await IOUtils.write(targetPath, bytes);
  }
}

/** Apply the configured image handling to a Markdown document. */
export function rewriteImageLinks(
  markdown: string,
  images: Map<string, Uint8Array>,
  mode: MarkdownImageMode,
): string {
  if (mode === "folder" || !images.size) {
    return markdown;
  }
  return markdown.replace(
    IMAGE_REFERENCE_PATTERN,
    (match, altText: string, angleRef?: string, plainRef?: string) => {
      const reference = angleRef || plainRef;
      const image = reference ? resolveImage(reference, images) : undefined;
      if (!image) {
        // Not one of the extracted images — leave the link untouched.
        return match;
      }
      if (mode === "none") {
        return "";
      }
      const mime = mimeTypeFor(reference!);
      return `![${altText}](data:${mime};base64,${toBase64(image)})`;
    },
  );
}

/**
 * Find the image a Markdown reference points at. MinerU writes plain relative
 * paths, but tolerate `./` prefixes, URL encoding and stray backslashes.
 */
function resolveImage(
  reference: string,
  images: Map<string, Uint8Array>,
): Uint8Array | undefined {
  // Absolute URLs (`https:`, `data:`, protocol-relative) never name a file in
  // the result archive, and they must not be run through path helpers.
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith("//")) {
    return undefined;
  }
  const candidates = new Set<string>();
  let decoded = reference;
  try {
    decoded = decodeURIComponent(reference);
  } catch {
    // Malformed escapes; fall back to the raw reference.
  }
  for (const value of [reference, decoded]) {
    const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
    candidates.add(normalized);
    const segments = normalized.split("/");
    if (segments.length > 1) {
      candidates.add(segments.slice(1).join("/"));
    }
    candidates.add(segments[segments.length - 1]);
  }
  for (const candidate of candidates) {
    const image = images.get(candidate);
    if (image) {
      return image;
    }
  }
  // Last resort: match on file name alone.
  const wanted = fileNameOf(decoded);
  if (wanted) {
    for (const [path, image] of images) {
      if (fileNameOf(path) === wanted) {
        return image;
      }
    }
  }
  return undefined;
}

/**
 * Basename of a path, without going through `PathUtils.filename`, which throws
 * on anything that is not a real filesystem path.
 */
function fileNameOf(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const separator = normalized.lastIndexOf("/");
  return separator === -1 ? normalized : normalized.slice(separator + 1);
}

function mimeTypeFor(reference: string): string {
  const name = reference.split("?")[0];
  const extension = name.includes(".")
    ? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
    : "";
  return IMAGE_MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

function toBase64(bytes: Uint8Array): string {
  // Chunked to avoid blowing the argument limit of String.fromCharCode.
  const CHUNK_SIZE = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + CHUNK_SIZE),
    );
  }
  return btoa(binary);
}

/** Strip characters that are illegal in file names and cap the length. */
export function sanitizeFileBaseName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex -- control characters are exactly what we are stripping
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .trim();
  const truncated = cleaned.slice(0, 100).trim();
  return truncated || "OCR result";
}

/** Reject absolute paths and `..` traversal in zip-relative image paths. */
function sanitizeRelativePath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    return null;
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === ".." || segment === "")) {
    return null;
  }
  return segments.join("/");
}
