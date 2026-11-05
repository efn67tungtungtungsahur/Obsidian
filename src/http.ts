import { requestUrl } from "obsidian";

export type ConnectionMode = "auto" | "stream" | "compat";

/** Set once the web view's fetch has failed in "auto" mode; later requests go straight to compat. */
let fetchUnavailable = false;

/**
 * fetch for the Anthropic SDK client.
 *
 * - "stream": the web view's fetch, so answers appear word by word.
 * - "compat": Obsidian's requestUrl, which uses the native HTTP stack (no CORS restrictions in
 *   the mobile apps) but delivers the whole response at once.
 * - "auto": fetch first; if the web view refuses the request (a TypeError, e.g. CORS on
 *   Android/iOS), switch to requestUrl for this and all later requests.
 */
export function createFetch(mode: ConnectionMode) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (mode === "compat" || (mode === "auto" && fetchUnavailable)) return compatFetch(input, init);
    try {
      return await globalThis.fetch(input, init);
    } catch (err) {
      if (mode === "auto" && err instanceof TypeError && !init?.signal?.aborted) {
        fetchUnavailable = true;
        return compatFetch(input, init);
      }
      throw err;
    }
  };
}

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

async function compatFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => {
    headers[key] = value;
  });

  const body = init?.body;
  if (body != null && typeof body !== "string" && !(body instanceof ArrayBuffer)) {
    throw new TypeError("Request body type not supported in compatibility mode");
  }

  const signal = init?.signal ?? undefined;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const request = requestUrl({ url, method: init?.method ?? "GET", headers, body: body ?? undefined, throw: false });
  // requestUrl cannot be cancelled; on abort, stop waiting for it.
  const res = signal
    ? await Promise.race([
        request,
        new Promise<never>((_, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }),
        ),
      ])
    : await request;

  return new Response(NULL_BODY_STATUS.has(res.status) ? null : res.arrayBuffer, { status: res.status, headers: res.headers });
}
