export class APIError extends Error {
  constructor(status, message, unknown = false) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.unknown = unknown;
  }
}

const messages = {
  401: "Войдите в amoCRM повторно",
  403: "Нет прав для этого действия",
  409: "Настройки изменены другим пользователем. Черновик сохранён",
  503: "Сервис временно недоступен",
};

function safePath(path) {
  if (typeof path !== "string" || /[\\\s#]/.test(path)) return false;
  try {
    const decoded = decodeURIComponent(path.split("?")[0]);
    return /^\/(?!\/)/.test(decoded) && !/[\\\s]/.test(decoded)
      && !decoded.split("/").some(part => part === ".." || part === ".");
  } catch { return false; }
}

// The amoCRM SDK supplies authorization. This adapter never stores tokens,
// synthesizes account/user headers or retries a possibly completed mutation.
export function createAuthorizedClient(widget, baseUrl, options = {}) {
  if (typeof baseUrl !== "string" || /[\\\s]/.test(baseUrl)) throw new TypeError("Expected an API URL");
  if (!/^\/(?!\/)/.test(baseUrl)) {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw new TypeError("Expected an HTTPS API URL without credentials, query or fragment");
  } else if (/[?#\\]/.test(baseUrl) || !safePath(baseUrl)) {
    throw new TypeError("Expected an absolute API path without query or fragment");
  }
  const base = baseUrl.replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? 12000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new TypeError("Expected a positive timeoutMs");
  const requests = new Set();
  let disposed = false;

  function request(path, { body, write, headers, method = body === undefined ? "GET" : "POST" } = {}) {
    if (disposed) return Promise.reject(new APIError(0, "Экран закрыт"));
    if (!safePath(path))
      return Promise.reject(new TypeError("Expected an API-relative path"));
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method))
      return Promise.reject(new TypeError("Unsupported HTTP method"));
    // Callers may supply only routing expectations, never SDK authorization or tenant identity.
    const safeHeaders = {};
    for (const [name, value] of Object.entries(headers || {})) {
      if (!["X-Routing-Epoch", "X-Installation-Generation"].includes(name) ||
          !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
        return Promise.reject(new TypeError("Unsupported routing expectation header"));
      safeHeaders[name] = String(value);
    }
    // POST is conservatively a mutation; read-only POST must opt out explicitly.
    const mutation = (write !== false && method !== "GET") || write === true;
    if (typeof widget?.$authorizedAjax !== "function")
      return Promise.reject(new APIError(401, "Авторизация amoCRM недоступна"));
    let data;
    try { data = body === undefined ? undefined : JSON.stringify(body); }
    catch (error) { return Promise.reject(new APIError(0, error.message)); }
    return new Promise((resolve, reject) => {
      let xhr, settled = false;
      const finish = () => {
        if (settled) return false;
        settled = true;
        clearTimeout(timer);
        requests.delete(cancel);
        return true;
      };
      const abort = () => { try { xhr?.abort?.(); } catch { /* promise still settles */ } };
      const cancel = () => {
        if (!finish()) return;
        abort();
        reject(new APIError(0, "Экран закрыт", mutation));
      };
      const timer = setTimeout(() => {
        if (!finish()) return;
        abort();
        reject(new APIError(0, mutation
          ? "Результат действия неизвестен. Проверьте состояние; запрос не повторяется автоматически."
          : "Сервер не ответил", mutation));
      }, timeoutMs);
      requests.add(cancel);
      try {
        xhr = widget.$authorizedAjax({
          url: base + path,
          type: method,
          headers: Object.keys(safeHeaders).length ? safeHeaders : undefined,
          dataType: "json",
          contentType: "application/json",
          data,
          timeout: Math.max(1, timeoutMs - Math.min(1000, timeoutMs / 10)),
        });
        // The SDK can synchronously re-enter lifecycle code during dispatch.
        if (settled) { abort(); return; }
        xhr.done((result, _status, response) => {
          if (!finish()) return;
          resolve({ data: result, status: response?.status || 200 });
        });
        xhr.fail((response) => {
          if (!finish()) return;
          const status = response?.status || 0;
          reject(new APIError(status,
            response?.responseJSON?.error?.message || options.messages?.[status] || messages[status] || "Не удалось выполнить запрос",
            mutation && (!status || status >= 500)));
        });
      } catch (error) {
        if (!finish()) return;
        abort();
        reject(new APIError(0, error.message, mutation));
      }
    });
  }
  return {
    request,
    destroy() {
      disposed = true;
      for (const cancel of [...requests]) cancel();
    },
  };
}
