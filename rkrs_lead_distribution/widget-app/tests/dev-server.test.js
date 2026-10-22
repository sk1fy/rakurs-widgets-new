import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

test("preview dev server serves the shared SDK fixture outside the widget-app root", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({
    root,
    server: { host: "127.0.0.1", port: 0, strictPort: true },
    logLevel: "error",
  });
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const response = await fetch(`${origin}/src/preview.js`);
    assert.equal(response.status, 200);
    const preview = await response.text();
    const importedPath = preview.match(/from\s+["']([^"']*\/widget-runtime\/testing\/fixture\.mjs[^"']*)["']/)?.[1];
    assert.ok(importedPath, "preview must import the shared SDK fixture");
    const fixture = await fetch(new URL(importedPath, origin));
    assert.equal(fixture.status, 200, "the shared module must not be blocked by server.fs restrictions");
    assert.match(await fixture.text(), /function createSDKFixture/);
  } finally {
    await server.close();
  }
});
