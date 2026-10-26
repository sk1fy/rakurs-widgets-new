import { ApiError, errorFromResponse } from "./errors";

export interface RequestOptions {
  bearer?: string;
  signal?: AbortSignal;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  if (options.bearer) headers.Authorization = `Bearer ${options.bearer}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch (cause) {
    if (options.signal?.aborted) throw new ApiError({ code: "aborted", message: "aborted" });
    throw new ApiError({ code: "network", message: cause instanceof Error ? cause.message : "network error", retryable: true });
  }
  if (!response.ok) throw await errorFromResponse(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Ограничитель параллельности для пачек запросов (карточки звонков и т.п.). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
