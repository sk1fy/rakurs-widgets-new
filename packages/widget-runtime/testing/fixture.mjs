// Developer-only entry point. Never import it from a production runtime.
// No fetch/XHR: unmatched fixture requests fail closed instead of reaching CRM.
export function createSDKFixture({
  accountId = "777", userId = "42", entityId = "501", handle,
  delayMs = 0, manual = false,
} = {}) {
  const requests = [];
  const pending = new Set();
  let disposed = false;
  const context = { accountId: String(accountId), userId: String(userId), entityId: String(entityId) };
  const amoCRM = {
    constant(key) {
      if (key === "account") return { id: context.accountId };
      if (key === "user") return { id: context.userId };
      return undefined;
    },
    data: { current_card: { id: context.entityId } },
  };
  function $authorizedAjax(options) {
    const done = [], fail = [];
    let outcome, timer;
    const record = {
      options: { ...options },
      context: { ...context },
      body: options.data === undefined ? undefined : JSON.parse(options.data),
      aborted: false,
      resolve(data, status = 200) { settle({ ok: true, data, status }); },
      reject(status = 503, message) { settle({ ok: false, status, message }); },
    };
    function invoke(fn) {
      if (outcome.ok) fn(outcome.data, "success", { status: outcome.status });
      else fn({ status: outcome.status, responseJSON: outcome.message ? { error: { message: outcome.message } } : undefined });
    }
    function settle(result) {
      if (outcome) return;
      outcome = result;
      clearTimeout(timer);
      pending.delete(record);
      for (const fn of result.ok ? done : fail) invoke(fn);
    }
    const deferred = {
      done(fn) { done.push(fn); if (outcome?.ok) invoke(fn); return deferred; },
      fail(fn) { fail.push(fn); if (outcome && !outcome.ok) invoke(fn); return deferred; },
      abort() { record.aborted = true; record.reject(0, "Fixture request aborted"); },
    };
    record.abort = deferred.abort;
    requests.push(record);
    pending.add(record);
    if (disposed) record.reject(0, "Fixture disposed");
    else if (!manual) timer = setTimeout(async () => {
      try {
        const result = await handle?.(record);
        if (result === undefined) record.reject(404, "No fixture matches this request");
        else if ((result.status ?? 200) >= 400) record.reject(result.status, result.message);
        else record.resolve(result.data, result.status ?? 200);
      } catch (error) { record.reject(500, error.message); }
    }, delayMs);
    return deferred;
  }
  return {
    amoCRM, requests, $authorizedAjax,
    setIdentity(next) {
      for (const key of ["accountId", "userId", "entityId"])
        if (next[key] !== undefined) context[key] = String(next[key]);
      amoCRM.data.current_card.id = context.entityId;
    },
    createWidget(Constructor, { renderTemplate = () => {} } = {}) {
      const widget = new Constructor();
      widget.$authorizedAjax = $authorizedAjax;
      widget.render_template = renderTemplate;
      return widget;
    },
    destroy() {
      disposed = true;
      for (const request of [...pending]) request.abort();
    },
  };
}
