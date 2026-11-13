import { assert } from "chai";
import { config } from "../package.json";

/** The plugin instance lives on Zotero under its addonInstance name. */
function plugin(): any {
  return (Zotero as any)[config.addonInstance];
}

const ENDPOINT_PATH = "/zotmd/convert";

// `any`: init's declared union type (event style vs promise style) makes
// calling it from tests noisy; the assertions below are all runtime checks.
function endpoint(): any {
  const registered = (Zotero.Server.Endpoints as Record<string, any>)[
    ENDPOINT_PATH
  ];
  assert.isDefined(
    registered,
    `${ENDPOINT_PATH} was not registered on Zotero.Server.Endpoints`,
  );
  return registered;
}

/** Call the endpoint the way Zotero's server does for a POST JSON request. */
async function post(data: unknown): Promise<[number, string, string]> {
  return endpoint().init({ method: "POST", data });
}

describe("server endpoint", function () {
  it("should register /zotmd/convert as a JSON POST endpoint", function () {
    assert.include(endpoint().supportedMethods, "POST");
    assert.include(endpoint().supportedDataTypes, "application/json");
    assert.isFunction(endpoint().init);
  });

  it("should reject a body without itemKeys", async function () {
    const [code, , body] = await post({});
    assert.equal(code, 400);
    assert.include(body, "itemKeys");
  });

  it("should reject a non-array itemKeys", async function () {
    const [code] = await post({ itemKeys: "ABCD1234" });
    assert.equal(code, 400);
  });

  it("should reject an empty itemKeys array", async function () {
    const [code] = await post({ itemKeys: [] });
    assert.equal(code, 400);
  });

  it("should report unknown keys as missing instead of running", async function () {
    const key = "NOPE0000";
    const [code, contentType, body] = await post({ itemKeys: [key] });
    assert.equal(code, 400);
    assert.equal(contentType, "application/json");
    assert.include(JSON.parse(body).missing, key);
  });

  it("should expose the server module on the plugin api", function () {
    assert.isFunction(plugin().api.server.registerServerEndpoint);
    assert.equal(plugin().api.server.ENDPOINT_PATH, ENDPOINT_PATH);
  });
});
