import { assert } from "chai";
import { config } from "../package.json";

function attachmentApi(): any {
  return (Zotero as any)[config.addonInstance].api.attachment;
}

describe("attachment helpers", function () {
  let markdown: string;
  let images: Map<string, Uint8Array>;

  beforeEach(function () {
    markdown = [
      "# Title",
      "",
      "Some text.",
      "",
      "![Figure 1](images/fig1.png)",
      "",
      "![Figure 2](./images/fig2.jpg)",
      "",
      "![External](https://example.com/remote.png)",
      "",
    ].join("\n");

    images = new Map<string, Uint8Array>([
      ["images/fig1.png", new Uint8Array([1, 2, 3])],
      ["images/fig2.jpg", new Uint8Array([4, 5])],
    ]);
  });

  it("leaves relative links untouched in folder mode", function () {
    assert.equal(
      attachmentApi().rewriteImageLinks(markdown, images, "folder"),
      markdown,
    );
  });

  it("inlines known images as data URIs in base64 mode", function () {
    const result = attachmentApi().rewriteImageLinks(
      markdown,
      images,
      "base64",
    );
    assert.include(result, "![Figure 1](data:image/png;base64,AQID)");
    assert.include(result, "![Figure 2](data:image/jpeg;base64,BAU=)");
  });

  it("leaves images it does not own alone in base64 mode", function () {
    const result = attachmentApi().rewriteImageLinks(
      markdown,
      images,
      "base64",
    );
    assert.include(result, "![External](https://example.com/remote.png)");
  });

  it("removes known image references in none mode", function () {
    const result = attachmentApi().rewriteImageLinks(markdown, images, "none");
    assert.notInclude(result, "fig1.png");
    assert.notInclude(result, "fig2.jpg");
    assert.include(result, "![External](https://example.com/remote.png)");
  });

  it("never touches absolute, protocol-relative or data URIs", function () {
    const external = [
      "![a](https://example.com/y.png)",
      "![b](//cdn.example.com/x.png)",
      "![c](data:image/png;base64,AAA)",
      "",
    ].join("\n");
    for (const mode of ["base64", "none"] as const) {
      assert.equal(
        attachmentApi().rewriteImageLinks(external, images, mode),
        external,
        `mode=${mode} modified a non-archive reference`,
      );
    }
  });

  it("resolves references by file name when the directory differs", function () {
    const result = attachmentApi().rewriteImageLinks(
      "![](other/dir/fig1.png)",
      images,
      "base64",
    );
    assert.equal(result, "![](data:image/png;base64,AQID)");
  });

  it("sanitizes titles into usable file names", function () {
    const sanitize = attachmentApi().sanitizeFileBaseName;
    assert.equal(sanitize('A/B: "C"?'), "A_B_ _C__");
    assert.equal(sanitize("   "), "OCR result");
    assert.equal(sanitize("."), "OCR result");
    assert.equal(sanitize("x".repeat(500)).length, 100);
  });
});
