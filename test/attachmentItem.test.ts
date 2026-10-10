import { assert } from "chai";
import { config } from "../package.json";

function attachmentApi(): any {
  return (Zotero as any)[config.addonInstance].api.attachment;
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

describe("markdown attachment creation", function () {
  this.timeout(30000);

  const createdItemIDs: number[] = [];

  after(async function () {
    for (const id of createdItemIDs.reverse()) {
      try {
        const item = Zotero.Items.get(id);
        if (item) {
          await item.eraseTx();
        }
      } catch (error) {
        Zotero.debug(`[ZotMD test] cleanup failed for item ${id}: ${error}`);
      }
    }
  });

  async function makeParentItem(title: string): Promise<Zotero.Item> {
    const item = new Zotero.Item("journalArticle");
    item.libraryID = Zotero.Libraries.userLibraryID;
    item.setField("title", title);
    await item.saveTx();
    createdItemIDs.push(item.id);
    return item;
  }

  it("stores the markdown and writes images beside it in folder mode", async function () {
    const parent = await makeParentItem("ZotMD test — folder mode");
    const markdown = "# Title\n\n![](images/fig1.png)\n";

    const attachment = await attachmentApi().createMarkdownAttachment({
      parentItem: parent,
      markdown,
      images: new Map([["images/fig1.png", PNG_BYTES]]),
      mode: "folder",
      title: "ZotMD test (Markdown)",
    });
    createdItemIDs.push(attachment.id);

    assert.equal(attachment.parentItemID, parent.id);
    assert.isTrue(attachment.isFileAttachment());

    const filePath = await attachment.getFilePathAsync();
    assert.isString(filePath);
    assert.equal(await IOUtils.readUTF8(filePath as string), markdown);

    // The relative link must resolve to a real file next to the markdown.
    const imagePath = PathUtils.join(
      PathUtils.parent(filePath as string)!,
      "images",
      "fig1.png",
    );
    assert.deepEqual(
      Array.from(await IOUtils.read(imagePath)),
      Array.from(PNG_BYTES),
      "image was not written beside the markdown",
    );
  });

  it("inlines images and writes no extra files in base64 mode", async function () {
    const parent = await makeParentItem("ZotMD test — base64 mode");

    const attachment = await attachmentApi().createMarkdownAttachment({
      parentItem: parent,
      markdown: "![](images/fig1.png)\n",
      images: new Map([["images/fig1.png", PNG_BYTES]]),
      mode: "base64",
      title: "ZotMD test (Markdown)",
    });
    createdItemIDs.push(attachment.id);

    const filePath = (await attachment.getFilePathAsync()) as string;
    const contents = await IOUtils.readUTF8(filePath);
    assert.include(contents, "data:image/png;base64,");
    assert.isFalse(
      await IOUtils.exists(
        PathUtils.join(PathUtils.parent(filePath)!, "images", "fig1.png"),
      ),
      "base64 mode should not leave an images directory behind",
    );
  });

  it("names the stored file after the attachment title", async function () {
    const parent = await makeParentItem("ZotMD test — naming");
    const attachment = await attachmentApi().createMarkdownAttachment({
      parentItem: parent,
      markdown: "# x\n",
      images: new Map(),
      mode: "folder",
      title: 'A/B: "weird" title?',
    });
    createdItemIDs.push(attachment.id);

    const filePath = (await attachment.getFilePathAsync()) as string;
    assert.equal(PathUtils.filename(filePath), "A_B_ _weird_ title_.md");
  });
});
