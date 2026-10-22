import { createAuthorizedClient } from "../../../packages/widget-runtime/index.mjs";
export { APIError } from "../../../packages/widget-runtime/index.mjs";

export function createClient(widget, base) {
  const client = createAuthorizedClient(widget, base, {
    messages: { 503: "TeamOS временно недоступен" },
  });
  return {
    bootstrap: () => client.request("/bootstrap"),
    runtime: (body) => client.request("/runtime", { body, write: !!body?.write }),
    destroy: () => client.destroy(),
  };
}
