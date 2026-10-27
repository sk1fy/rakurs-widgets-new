// Ошибки источников. Коды amocrm-pro сохраняются как есть, чтобы экран
// различал «нет доступа», «ссылка недействительна», «временно недоступно».

export type ApiErrorCode =
  | "invalid_argument"
  | "management_session_expired"
  | "unauthenticated"
  | "permission_denied"
  | "not_found"
  | "conflict"
  | "unavailable"
  | "deadline_exceeded"
  | "resource_exhausted"
  | "reauth_required"
  | "internal"
  | "network"
  | "aborted";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly requestId: string | null;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(init: { code: ApiErrorCode; message: string; status?: number; requestId?: string | null; retryable?: boolean; retryAfterSeconds?: number | null }) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status ?? 0;
    this.requestId = init.requestId ?? null;
    this.retryable = init.retryable ?? false;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }
}

const KNOWN: ApiErrorCode[] = [
  "invalid_argument", "unauthenticated", "permission_denied", "not_found", "conflict",
  "unavailable", "deadline_exceeded", "resource_exhausted", "reauth_required", "internal",
];

/** Человеческое описание для экрана ошибки; технические детали — в requestId. */
export function describeError(error: unknown): { title: string; hint: string; retryable: boolean; requestId: string | null } {
  if (!(error instanceof ApiError)) {
    return { title: "Не удалось загрузить данные", hint: "Неожиданная ошибка интерфейса.", retryable: true, requestId: null };
  }
  const base = { retryable: error.retryable, requestId: error.requestId };
  switch (error.code) {
    case "management_session_expired":
      return { ...base, retryable: false, title: "Войдите в настройки из amoCRM", hint: "Сессия администратора завершилась. В виджете «Контроль активности 2.0» откройте «Настройки виджета → Общие настройки аккаунта»." };
    case "unauthenticated":
    case "not_found":
      return { ...base, title: "Ссылка на панель недействительна", hint: "Ссылку могли перевыпустить или панель отключили. Запросите новую ссылку у администратора." };
    case "permission_denied":
      return { ...base, title: "Нет доступа к панели", hint: "Ключ просмотра не даёт доступа к этим данным." };
    case "reauth_required":
      return { ...base, title: "Требуется повторная авторизация amoCRM", hint: "Интеграция потеряла доступ к аккаунту. Администратору нужно переподключить её." };
    case "resource_exhausted":
      return { ...base, title: "Слишком много запросов", hint: error.retryAfterSeconds ? `Повторите через ${error.retryAfterSeconds} с.` : "Повторите чуть позже." };
    case "unavailable":
    case "deadline_exceeded":
      return { ...base, title: "Источник временно недоступен", hint: "amocrm-pro не ответил вовремя. Данные можно запросить повторно." };
    case "invalid_argument":
      return { ...base, title: "Некорректный запрос", hint: "Период или параметры вне допустимых границ." };
    case "network":
      return { ...base, title: "Нет соединения", hint: "Проверьте сеть и повторите." };
    default:
      return { ...base, title: "Ошибка источника данных", hint: "Повторите позже или сообщите request id." };
  }
}

export async function errorFromResponse(response: Response): Promise<ApiError> {
  const retryAfter = Number(response.headers.get("Retry-After"));
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const err = (body as { error?: { code?: string; message?: string; request_id?: string; retryable?: boolean } } | null)?.error;
  const code = KNOWN.includes(err?.code as ApiErrorCode) ? (err?.code as ApiErrorCode) : response.status === 429 ? "resource_exhausted" : response.status >= 500 ? "unavailable" : "internal";
  return new ApiError({
    code,
    message: err?.message || `HTTP ${response.status}`,
    status: response.status,
    requestId: err?.request_id ?? response.headers.get("X-Request-Id"),
    retryable: err?.retryable ?? (response.status === 429 || response.status >= 500),
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  });
}
