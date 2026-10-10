import { assert } from "chai";
import { config } from "../package.json";

function zipApi(): any {
  return (Zotero as any)[config.addonInstance].api.zip;
}

function tempPath(prefix: string): string {
  return PathUtils.join(
    PathUtils.tempDir,
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

describe("zip extraction", function () {
  this.timeout(30000);

  it("round-trips a nested directory", async function () {
    const sourceDir = tempPath("zotmd-src");
    const destDir = tempPath("zotmd-dest");
    const zipPath = tempPath("zotmd");
    const markdown = "# Title\n\n![Figure](images/fig1.png)\n";
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

    try {
      await IOUtils.makeDirectory(PathUtils.join(sourceDir, "images"), {
        createAncestors: true,
        ignoreExisting: true,
      });
      await IOUtils.writeUTF8(PathUtils.join(sourceDir, "full.md"), markdown);
      await IOUtils.write(
        PathUtils.join(sourceDir, "images", "fig1.png"),
        imageBytes,
      );

      const created = await Zotero.File.zipDirectory(sourceDir, zipPath, null);
      assert.isNotFalse(created, "failed to build the fixture zip");

      await IOUtils.makeDirectory(destDir, {
        createAncestors: true,
        ignoreExisting: true,
      });
      const entries = await zipApi().extractZipToDirectory(
        await IOUtils.read(zipPath),
        destDir,
      );

      assert.includeMembers(entries, ["full.md", "images/fig1.png"]);
      assert.equal(
        await IOUtils.readUTF8(PathUtils.join(destDir, "full.md")),
        markdown,
      );
      assert.deepEqual(
        Array.from(
          await IOUtils.read(PathUtils.join(destDir, "images", "fig1.png")),
        ),
        Array.from(imageBytes),
      );
    } finally {
      await IOUtils.remove(sourceDir, { recursive: true, ignoreAbsent: true });
      await IOUtils.remove(destDir, { recursive: true, ignoreAbsent: true });
      await IOUtils.remove(zipPath, { ignoreAbsent: true });
    }
  });

  it("rejects entry names that would escape the destination directory", function () {
    const sanitize = zipApi().sanitizeEntryName;
    assert.isNull(sanitize("../escape.txt"));
    assert.isNull(sanitize("images/../../escape.txt"));
    assert.isNull(sanitize("/etc/passwd"));
    assert.isNull(sanitize("C:/Windows/system32/evil.dll"));
    assert.isNull(sanitize(""));
    assert.isNull(sanitize("./"));
    assert.isNull(sanitize("images//fig.png"));

    assert.equal(sanitize("full.md"), "full.md");
    assert.equal(sanitize("./images/fig1.png"), "images/fig1.png");
    assert.equal(sanitize("images\\fig1.png"), "images/fig1.png");
  });
});
