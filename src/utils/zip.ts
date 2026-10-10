import { getComponents } from "./xpcom";

/**
 * ZIP extraction via Gecko's built-in nsIZipReader.
 *
 * MinerU returns parse results as a zip (`full.md` plus an `images/` tree), and
 * this lets us unpack it without shipping a JS inflate implementation.
 */

const ZIP_READER_CONTRACT_ID = "@mozilla.org/libjar/zip-reader;1";

/**
 * Reject absolute paths and `..` traversal, normalise to forward slashes.
 * @returns the safe entry name, or null if the entry must be skipped.
 */
export function sanitizeEntryName(name: string): string | null {
  const normalized = name.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    return null;
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "")) {
    return null;
  }
  return parts.join("/");
}

/**
 * Extract every file in `zipBytes` into `destDir`, preserving relative paths.
 * @returns the list of extracted entry names, relative to `destDir`.
 */
export async function extractZipToDirectory(
  zipBytes: Uint8Array,
  destDir: string,
): Promise<string[]> {
  const tmpZipPath = PathUtils.join(
    PathUtils.tempDir,
    `zotmd-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`,
  );
  await IOUtils.write(tmpZipPath, zipBytes);

  const Components = getComponents();
  const reader = Components.classes[ZIP_READER_CONTRACT_ID].createInstance(
    Components.interfaces.nsIZipReader,
  );
  const extracted: string[] = [];
  try {
    reader.open(Zotero.File.pathToFile(tmpZipPath));
    const entries = reader.findEntries("*");
    while (entries.hasMore()) {
      const rawName = entries.getNext();
      if (rawName.endsWith("/")) {
        continue;
      }
      const relativeName = sanitizeEntryName(rawName);
      if (!relativeName) {
        Zotero.debug(`[ZotMD] Skipping unsafe zip entry: ${rawName}`);
        continue;
      }
      const targetPath = PathUtils.join(destDir, ...relativeName.split("/"));
      const parentDir = PathUtils.parent(targetPath);
      if (parentDir) {
        await IOUtils.makeDirectory(parentDir, {
          createAncestors: true,
          ignoreExisting: true,
        });
      }
      reader.extract(rawName, Zotero.File.pathToFile(targetPath));
      extracted.push(relativeName);
    }
  } finally {
    try {
      reader.close();
    } catch {
      // Reader may never have opened; nothing to release.
    }
    await IOUtils.remove(tmpZipPath, { ignoreAbsent: true });
  }
  return extracted;
}
