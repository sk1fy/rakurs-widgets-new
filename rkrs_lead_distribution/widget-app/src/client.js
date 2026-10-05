export class APIError extends Error {
  constructor(status, message, unknown = false) {
    super(message);
    this.status = status;
    this.unknown = unknown;
  }
}
export function createClient(widget, base) {
  const requests = new Map();
  let disposed = false;
  function call(path, body) {
    if (disposed) return Promise.reject(new APIError(0, "Экран закрыт"));
    return new Promise((resolve, reject) => {
      if (typeof widget.$authorizedAjax !== "function") {
        reject(new APIError(401, "Авторизация amoCRM недоступна"));
        return;
      }
      let request,
        settled = false;
      const finish = () => {
        settled = true;
        clearTimeout(timer);
        requests.delete(request);
      };
      const timer = setTimeout(() => {
        finish();
        request?.abort?.();
        reject(
          new APIError(
            0,
            body?.write
              ? "Результат действия неизвестен. Проверьте состояние; запрос не повторяется автоматически."
              : "Сервер не ответил",
            !!body?.write,
          ),
        );
      }, 12000);
      try {
        request = widget.$authorizedAjax({
          url: base + path,
          type: body ? "POST" : "GET",
          dataType: "json",
          contentType: "application/json",
          data: body ? JSON.stringify(body) : undefined,
          timeout: 11000,
        });
        requests.set(request, () => {
          if (settled) return;
          finish();
          request.abort?.();
          reject(new APIError(0, "Экран закрыт", !!body?.write));
        });
        request.done((data, _status, xhr) => {
          if (settled) return;
          finish();
          if (disposed) return reject(new APIError(0, "Экран закрыт"));
          resolve({ data, status: xhr?.status || 200 });
        });
        request.fail((xhr) => {
          if (settled) return;
          finish();
          const status = xhr?.status || 0;
          reject(
            new APIError(
              status,
              xhr?.responseJSON?.error?.message ||
                {
                  401: "Войдите в amoCRM повторно",
                  403: "Нет прав для этого действия",
                  409: "Настройки изменены другим пользователем. Черновик сохранён",
                  503: "TeamOS временно недоступен",
                }[status] ||
                "Не удалось выполнить запрос",
              !!body?.write && (!status || status >= 500),
            ),
          );
        });
      } catch (error) {
        finish();
        reject(new APIError(0, error.message, !!body?.write));
      }
    });
  }
  return {
    bootstrap: () => call("/bootstrap"),
    runtime: (body) => call("/runtime", body),
    destroy() {
      disposed = true;
      for (const cancel of [...requests.values()]) cancel();
      requests.clear();
    },
  };
}
