/**
 * Thin XMLHttpRequest wrapper.
 *
 * `Zotero.HTTP.request` is deliberately avoided here: whenever a request carries
 * a body it force-sets `Content-Type: application/x-www-form-urlencoded`
 * (see chrome/content/zotero/xpcom/http.js), and that header invalidates the
 * signature on the Aliyun OSS upload URLs MinerU hands out. Going through raw
 * XHR lets the upload request go out with no Content-Type at all, and it also
 * avoids Zotero's automatic 5xx retry/backoff, which would fight our own
 * progress reporting.
 */

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  body?: Uint8Array | string | null;
  responseType?: "text" | "arraybuffer";
  /** Omit or pass 0 for no timeout. */
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  responseURL: string;
  text: string;
  buffer: ArrayBuffer | null;
  /** Parsed `text` when it is valid JSON, otherwise null. */
  json: any;
}

export function httpRequest(
  method: string,
  url: string,
  options: HttpRequestOptions = {},
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    try {
      xhr.open(method, url, true);
    } catch (e) {
      reject(new Error(`Invalid request URL: ${method} ${url}`));
      return;
    }
    // Don't let certificate/auth dialogs steal focus from the library window.
    xhr.mozBackgroundRequest = true;
    xhr.responseType = options.responseType ?? "text";
    if (options.timeoutMs) {
      xhr.timeout = options.timeoutMs;
    }
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      xhr.setRequestHeader(name, value);
    }
    xhr.onload = () => {
      const buffer = xhr.response instanceof ArrayBuffer ? xhr.response : null;
      const text =
        typeof xhr.response === "string"
          ? xhr.response
          : buffer
            ? new TextDecoder().decode(buffer)
            : "";
      let json: any = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }
      resolve({
        status: xhr.status,
        statusText: xhr.statusText,
        responseURL: xhr.responseURL,
        text,
        buffer,
        json,
      });
    };
    xhr.onerror = () => reject(new Error(`Network error: ${method} ${url}`));
    xhr.ontimeout = () =>
      reject(
        new Error(
          `Request timed out after ${options.timeoutMs} ms: ${method} ${url}`,
        ),
      );
    xhr.onabort = () => reject(new Error(`Request aborted: ${method} ${url}`));
    xhr.send(options.body ?? null);
  });
}
