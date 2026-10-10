/**
 * MinerU "precise parse" API client.
 * @see https://mineru.net/apiManage/docs
 *
 * Flow: request signed upload URLs -> PUT the files -> poll the batch until
 * every file reaches a terminal state -> download each result zip.
 */

import { httpRequest, HttpResponse } from "../utils/http";

const DEFAULT_BASE_URL = "https://mineru.net";
const REQUEST_TIMEOUT_MS = 60_000;

export interface MineruFileInput {
  /** File name sent to MinerU; the extension decides how it is parsed. */
  name: string;
  /** Opaque id echoed back in the results. Restricted to [A-Za-z0-9_.-], max 128 chars. */
  dataId: string;
  bytes: Uint8Array;
}

export interface MineruParseOptions {
  /** "pipeline" | "vlm" | "MinerU-HTML" */
  modelVersion?: string;
  /** "ch" | "ch_server" | "en" | "japan" | "korean" | "chinese_cht" | ... */
  language?: string;
  isOcr?: boolean;
  enableFormula?: boolean;
  enableTable?: boolean;
  /** Per-file page selection, e.g. "2,4-6" or "2--2". */
  pageRanges?: string;
}

export type MineruState =
  | "waiting-file"
  | "pending"
  | "running"
  | "converting"
  | "done"
  | "failed";

export interface MineruResult {
  fileName: string;
  dataId?: string;
  state: MineruState;
  errMsg?: string;
  fullZipUrl?: string;
  extractedPages?: number;
  totalPages?: number;
}

export interface MineruBatch {
  batchId: string;
  uploadUrls: string[];
}

export class MineruApiError extends Error {
  code?: number | string;
  traceId?: string;

  constructor(message: string, code?: number | string, traceId?: string) {
    super(message);
    this.name = "MineruApiError";
    this.code = code;
    this.traceId = traceId;
  }
}

export class MineruClient {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(token: string, baseUrl: string = DEFAULT_BASE_URL) {
    this.token = token.trim();
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  }

  /**
   * Ask MinerU for signed upload URLs. The parse task is submitted automatically
   * once every returned URL has received its file, so there is no separate
   * "start" call.
   */
  async createBatchUpload(
    files: MineruFileInput[],
    options: MineruParseOptions = {},
  ): Promise<MineruBatch> {
    if (!files.length) {
      throw new MineruApiError("No files to submit");
    }
    const body: Record<string, any> = {
      files: files.map((file) => {
        const entry: Record<string, any> = {
          name: file.name,
          data_id: file.dataId,
        };
        if (typeof options.isOcr === "boolean") {
          entry.is_ocr = options.isOcr;
        }
        if (options.pageRanges) {
          entry.page_ranges = options.pageRanges;
        }
        return entry;
      }),
    };
    if (options.modelVersion) {
      body.model_version = options.modelVersion;
    }
    if (options.language) {
      body.language = options.language;
    }
    if (typeof options.enableFormula === "boolean") {
      body.enable_formula = options.enableFormula;
    }
    if (typeof options.enableTable === "boolean") {
      body.enable_table = options.enableTable;
    }

    const data = await this.postJson("/api/v4/file-urls/batch", body);
    const uploadUrls: string[] = data?.file_urls ?? [];
    const batchId: string = data?.batch_id ?? "";
    if (!batchId || uploadUrls.length !== files.length) {
      throw new MineruApiError(
        `MinerU returned ${uploadUrls.length} upload URL(s) for ${files.length} file(s)`,
      );
    }
    return { batchId, uploadUrls };
  }

  /**
   * Upload one file to its signed URL.
   *
   * The OSS signature is computed over an empty Content-Type, so this request
   * must not carry that header — which is why it goes through `httpRequest`
   * rather than `Zotero.HTTP.request`.
   */
  async uploadFile(url: string, bytes: Uint8Array): Promise<void> {
    const response = await httpRequest("PUT", url, { body: bytes });
    if (response.status < 200 || response.status >= 300) {
      throw new MineruApiError(
        `Upload failed with HTTP ${response.status} ${response.statusText}`,
        response.status,
      );
    }
  }

  /**
   * Lightweight credential probe for the settings pane.
   *
   * Requesting a task id that cannot exist comes back as `-60012` when the
   * token is accepted, and as `A0202`/`A0211` when it is not, so this costs no
   * parsing quota.
   */
  async verifyToken(): Promise<void> {
    const response = await httpRequest(
      "GET",
      `${this.baseUrl}/api/v4/extract/task/00000000-0000-0000-0000-000000000000`,
      {
        headers: { Authorization: `Bearer ${this.token}` },
        timeoutMs: REQUEST_TIMEOUT_MS,
      },
    );
    const payload = response.json;
    if (!payload) {
      throw new MineruApiError(
        `Unexpected response from MinerU (HTTP ${response.status})`,
        response.status,
      );
    }
    // Any structured answer other than a token complaint means the token works.
    const code = errorCodeOf(payload);
    if (code === 0 || String(code) === "-60012") {
      return;
    }
    throw new MineruApiError(
      describeErrorCode(code, payload.msg),
      code ?? response.status,
      traceIdOf(payload),
    );
  }

  async getBatchResults(batchId: string): Promise<MineruResult[]> {
    const data = await this.getJson(
      `/api/v4/extract-results/batch/${encodeURIComponent(batchId)}`,
    );
    return (data?.extract_result ?? []).map(
      (entry: any): MineruResult => ({
        fileName: entry.file_name ?? "",
        dataId: entry.data_id,
        state: entry.state,
        errMsg: entry.err_msg || undefined,
        fullZipUrl: entry.full_zip_url || undefined,
        extractedPages: entry.extract_progress?.extracted_pages,
        totalPages: entry.extract_progress?.total_pages,
      }),
    );
  }

  /**
   * Poll until every file in the batch is `done` or `failed`.
   * @param onTick called after each poll with the latest results.
   */
  async waitForBatch(
    batchId: string,
    options: {
      intervalMs: number;
      timeoutMs: number;
      onTick?: (results: MineruResult[]) => void;
      isCancelled?: () => boolean;
    },
  ): Promise<MineruResult[]> {
    const deadline = Date.now() + options.timeoutMs;
    for (;;) {
      const results = await this.getBatchResults(batchId);
      options.onTick?.(results);
      const settled = results.every(
        (result) => result.state === "done" || result.state === "failed",
      );
      if (settled && results.length) {
        return results;
      }
      if (Date.now() >= deadline) {
        throw new MineruApiError(
          `Timed out waiting for MinerU after ${Math.round(
            options.timeoutMs / 60000,
          )} minute(s)`,
        );
      }
      if (options.isCancelled?.()) {
        throw new MineruApiError("Cancelled");
      }
      await Zotero.Promise.delay(options.intervalMs);
    }
  }

  /**
   * Download a result zip from MinerU's CDN. The URL is public and short-lived,
   * so the API token is intentionally not attached to this request.
   */
  async downloadZip(url: string): Promise<Uint8Array> {
    const response = await httpRequest("GET", url, {
      responseType: "arraybuffer",
    });
    if (response.status < 200 || response.status >= 300 || !response.buffer) {
      throw new MineruApiError(
        `Failed to download result zip: HTTP ${response.status}`,
        response.status,
      );
    }
    return new Uint8Array(response.buffer);
  }

  private async postJson(path: string, body: unknown): Promise<any> {
    const response = await httpRequest("POST", `${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    return parseResponse(response);
  }

  private async getJson(path: string): Promise<any> {
    const response = await httpRequest("GET", `${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    return parseResponse(response);
  }
}

/**
 * Unwrap a MinerU response body, throwing a `MineruApiError` for anything that
 * is not a success.
 */
export function parseResponse(response: HttpResponse): any {
  const payload = response.json;
  if (!payload) {
    // The gateway answers with a bare text body when the token is missing.
    const detail = response.text.trim().slice(0, 200);
    throw new MineruApiError(
      detail
        ? `MinerU rejected the request (HTTP ${response.status}): ${detail}`
        : `MinerU returned a non-JSON response (HTTP ${response.status})`,
      response.status,
    );
  }
  const code = errorCodeOf(payload);
  const succeeded =
    code === 0 ||
    (code == null && payload.success !== false && response.status < 400);
  if (!succeeded) {
    throw new MineruApiError(
      describeErrorCode(code, payload.msg),
      code ?? response.status,
      traceIdOf(payload),
    );
  }
  return payload.data;
}

/**
 * Error code from a MinerU response.
 *
 * The documented API returns `code`/`trace_id`, but the gateway in front of it
 * returns `msgCode`/`traceId` (and an HTTP 401) for authentication failures, so
 * both spellings have to be understood.
 */
function errorCodeOf(payload: any): number | string | undefined {
  return payload.code ?? payload.msgCode;
}

function traceIdOf(payload: any): string | undefined {
  return payload.trace_id ?? payload.traceId;
}

/** Turn MinerU's numeric/string codes into something a human can act on. */
function describeErrorCode(
  code: number | string | undefined,
  msg?: string,
): string {
  const known: Record<string, string> = {
    A0202: "API token is invalid — check it in ZotMD settings",
    A0211: "API token has expired — generate a new one on mineru.net",
    "-60005": "File exceeds MinerU's size limit (200 MB)",
    "-60006": "File exceeds MinerU's page limit (200 pages)",
    "-60012": "Task not found",
    "-60018": "Daily parsing quota exceeded",
    "-60022": "MinerU could not read the file",
  };
  const hint = code == null ? undefined : known[String(code)];
  const base =
    msg && code != null
      ? `${msg} (code ${code})`
      : (msg ??
        (code != null ? `MinerU error code ${code}` : "MinerU request failed"));
  return hint ? `${base} — ${hint}` : base;
}
