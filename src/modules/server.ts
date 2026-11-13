/**
 * Local HTTP endpoint, in the style of Better BibTeX.
 *
 * Zotero's built-in HTTP server (127.0.0.1:23119) lets plugins register
 * endpoints, so scripts can drive the plugin exactly as the item menu does:
 * progress window, cancellation, desktop notification and attachment naming
 * are all the shared `runOcrForItems` code path.
 *
 *     curl -X POST http://127.0.0.1:23119/zotmd/convert \
 *       -H "Content-Type: application/json" \
 *       -d '{"itemKeys": ["ABCD1234"]}'
 *
 * The response is the run summary as JSON, plus the keys that matched no
 * (non-deleted) item. The connection stays open until the run finishes, which
 * can take minutes; the run can still be cancelled from the UI meanwhile.
 */

import { getPref } from "../utils/prefs";
import { runOcrForItems } from "./ocrTask";

export const ENDPOINT_PATH = "/zotmd/convert";

/** One HTTP-triggered run at a time; a concurrent one gets a 409. */
let running = false;

/** A request as Zotero's server hands it to a single-argument `init`. */
interface ConvertRequest {
  method: string;
  data: unknown;
}

/**
 * The endpoint body. `init.length <= 1` makes Zotero's server use the
 * promise style: it awaits our return value and sends it as
 * `[code, contentType, body]`.
 */
async function handleRequest(
  options: ConvertRequest | string,
): Promise<[number, string, string]> {
  if (running) {
    return json(409, { error: "An OCR run is already in progress" });
  }

  const keys = readItemKeys(options);
  if (!keys) {
    return json(400, {
      error: 'Expected a JSON body like {"itemKeys": ["ABCD1234"]}',
    });
  }

  const { items, missing } = resolveItemKeys(keys);
  if (!items.length) {
    return json(400, { error: "No matching items", missing });
  }

  if (!String(getPref("apiToken") ?? "").trim()) {
    return json(400, { error: "No MinerU API token configured" });
  }

  running = true;
  try {
    const summary = await runOcrForItems(items);
    return json(200, { ...summary, missing });
  } catch (error) {
    Zotero.logError(error as Error);
    return json(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
  }
}

/**
 * Pull the parsed JSON body out of the request. Normally `options` is the
 * request object and Zotero has already parsed `data` for us because of
 * `supportedDataTypes`; the string branch covers being called the legacy way
 * with the raw body, so the endpoint works under either dispatch.
 */
function readItemKeys(options: ConvertRequest | string): string[] | null {
  let body: unknown;
  if (typeof options === "string") {
    try {
      body = JSON.parse(options);
    } catch {
      return null;
    }
  } else {
    body = options?.data;
  }
  const keys = (body as { itemKeys?: unknown } | null)?.itemKeys;
  if (!Array.isArray(keys) || !keys.length) {
    return null;
  }
  const normalized = keys.filter(
    (key): key is string => typeof key === "string" && key.trim().length > 0,
  );
  if (!normalized.length) {
    return null;
  }
  return normalized;
}

/**
 * Resolve item keys to items, searching every accessible library (keys are
 * only unique within a library). Deleted items count as missing.
 */
function resolveItemKeys(keys: string[]): {
  items: Zotero.Item[];
  missing: string[];
} {
  const libraryIDs = Zotero.Libraries.getAll().map((lib) => lib.libraryID);
  const items: Zotero.Item[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const rawKey of keys) {
    const key = rawKey.trim().toUpperCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    let item: Zotero.Item | false = false;
    for (const libraryID of libraryIDs) {
      const found = Zotero.Items.getByLibraryAndKey(libraryID, key);
      if (found && !found.deleted) {
        item = found;
        break;
      }
    }
    if (item) {
      items.push(item);
    } else {
      missing.push(key);
    }
  }

  return { items, missing };
}

function json(code: number, body: unknown): [number, string, string] {
  return [code, "application/json", JSON.stringify(body)];
}

export function registerServerEndpoint(): void {
  const endpoint: _ZoteroTypes.Server.Endpoint = {
    supportedMethods: ["POST"],
    supportedDataTypes: ["application/json"],
    init: handleRequest,
  };
  // zotero-types models endpoint values as the class constructor rather than
  // the instance shape, so the record needs one honest cast.
  const endpoints = Zotero.Server.Endpoints as unknown as Record<
    string,
    _ZoteroTypes.Server.Endpoint | undefined
  >;
  endpoints[ENDPOINT_PATH] = endpoint;
}

export function unregisterServerEndpoint(): void {
  const endpoints = Zotero.Server.Endpoints as unknown as Record<
    string,
    _ZoteroTypes.Server.Endpoint | undefined
  >;
  delete endpoints[ENDPOINT_PATH];
}
