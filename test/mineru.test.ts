import { assert } from "chai";
import { config } from "../package.json";
import type { MineruApiError as MineruApiErrorType } from "../src/modules/mineru";
import type { HttpResponse } from "../src/utils/http";

/**
 * The plugin's own classes have to be reached through `Zotero.ZotMD` — importing
 * them here would bundle a second copy, and `instanceof` would then be false.
 * `import type` is erased at build time, so it only supplies the shape.
 */
function mineruApi(): {
  parseResponse: (response: HttpResponse) => any;
  MineruApiError: new (
    message: string,
    code?: number | string,
    traceId?: string,
  ) => MineruApiErrorType;
} {
  return (Zotero as any)[config.addonInstance].api.mineru;
}

/** Build the shape `httpRequest` hands to `parseResponse`. */
function response(status: number, body: string): HttpResponse {
  let json: any = null;
  if (body) {
    try {
      json = JSON.parse(body);
    } catch {
      json = null;
    }
  }
  return {
    status,
    statusText: "",
    responseURL: "",
    text: body,
    buffer: null,
    json,
  };
}

describe("mineru response parsing", function () {
  it("returns data for the documented success shape", function () {
    const data = mineruApi().parseResponse(
      response(
        200,
        '{"code":0,"msg":"ok","data":{"batch_id":"b1"},"trace_id":"t"}',
      ),
    );
    assert.deepEqual(data, { batch_id: "b1" });
  });

  it("treats a code-less 200 with data as success", function () {
    const data = mineruApi().parseResponse(
      response(200, '{"data":{"task_id":"x"}}'),
    );
    assert.deepEqual(data, { task_id: "x" });
  });

  it("reports the gateway auth failure with an actionable hint", function () {
    const error = capture(() =>
      mineruApi().parseResponse(
        response(
          401,
          '{"traceId":"abc","msgCode":"A0202","msg":"user authenticate failed","data":null,"success":false,"total":0}',
        ),
      ),
    );
    assert.instanceOf(error, mineruApi().MineruApiError);
    assert.equal(error.code, "A0202");
    assert.equal(error.traceId, "abc");
    assert.include(error.message, "user authenticate failed");
    assert.include(error.message, "API token is invalid");
  });

  it("explains documented numeric error codes", function () {
    const error = capture(() =>
      mineruApi().parseResponse(
        response(200, '{"code":-60006,"msg":"page limit"}'),
      ),
    );
    assert.equal(error.code, -60006);
    assert.include(error.message, "page limit");
    assert.include(error.message, "page limit (200 pages)");
  });

  it("surfaces a non-JSON body instead of swallowing it", function () {
    const error = capture(() =>
      mineruApi().parseResponse(response(401, "login required")),
    );
    assert.include(error.message, "login required");
    assert.include(error.message, "401");
  });

  it("honours an explicit success:false even with HTTP 200", function () {
    const error = capture(() =>
      mineruApi().parseResponse(
        response(200, '{"success":false,"msg":"nope"}'),
      ),
    );
    assert.include(error.message, "nope");
  });

  it("never reports an undefined error code", function () {
    const error = capture(() =>
      mineruApi().parseResponse(response(500, '{"msg":"boom"}')),
    );
    assert.notInclude(error.message, "undefined");
  });
});

function capture(fn: () => unknown): any {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}
