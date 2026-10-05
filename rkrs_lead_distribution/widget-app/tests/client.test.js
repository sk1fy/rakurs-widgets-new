import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "../src/client.js";
test("uses SDK auth without claimed scope or tokens; uncertain mutation never auto retries", async () => {
  let calls = 0,
    options;
  const widget = {
    $authorizedAjax(o) {
      calls++;
      options = o;
      const r = {
        done() {
          return r;
        },
        fail(fn) {
          queueMicrotask(() => fn({ status: 503 }));
          return r;
        },
        abort() {},
      };
      return r;
    },
  };
  const client = createClient(
    widget,
    "https://api.test/api/v1/widget/distribution",
  );
  await assert.rejects(
    client.runtime({
      kind: "rule",
      write: true,
      requestId: "same",
      payload: {},
    }),
    (e) => e.unknown,
  );
  assert.equal(calls, 1);
  assert(!options.headers);
  assert.equal(JSON.parse(options.data).requestId, "same");
  client.destroy();
});

test("destroy settles and clears timers even when SDK abort has no callback", async () => {
  let aborted = 0;
  const widget = {
    $authorizedAjax() {
      const r = {
        done() {
          return r;
        },
        fail() {
          return r;
        },
        abort() {
          aborted++;
        },
      };
      return r;
    },
  };
  const client = createClient(widget, "https://api.test");
  const pending = client.bootstrap();
  client.destroy();
  await assert.rejects(pending, (e) => e.message === "Экран закрыт");
  assert.equal(aborted, 1);
});
