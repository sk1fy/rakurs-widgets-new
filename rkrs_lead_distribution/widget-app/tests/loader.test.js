import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
test("late bundle does not mount after destroy; same settings context reopened in new target", async () => {
  const d = new JSDOM('<div id="one"></div><div id="two"></div>', {
    runScripts: "outside-only",
  });
  let Constructor,
    resolve,
    mounted = 0;
  d.window.define = (_deps, fn) => (Constructor = fn());
  d.window.require = (_deps, fn) => (resolve = fn);
  d.window.AMOCRM = {
    constant: (key) => ({ id: key === "account" ? 1 : 2 }),
    data: { current_card: { id: 10 } },
  };
  d.window.eval(readFileSync("../widget/script.js", "utf8"));
  const w = new Constructor();
  w.callbacks.settings(d.window.document.querySelector("#one"));
  w.callbacks.destroy();
  resolve({
    mount() {
      mounted++;
    },
    destroy() {},
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(mounted, 0);
  w.callbacks.settings(d.window.document.querySelector("#one"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(mounted, 1);
  w.callbacks.settings(d.window.document.querySelector("#two"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(mounted, 2);
  assert(d.window.document.querySelector("#two").children.length);
  w.callbacks.destroy();
  d.window.close();
});

test("failed AMD load is forgotten and next settings callback retries", async () => {
  const d = new JSDOM('<div id="target"></div>', {
    runScripts: "outside-only",
  });
  let Constructor,
    failure,
    success,
    calls = 0,
    forgotten = 0,
    mounts = 0;
  d.window.define = (_deps, fn) => (Constructor = fn());
  d.window.require = (_deps, ok, fail) => {
    calls++;
    success = ok;
    failure = fail;
  };
  d.window.require.undef = () => forgotten++;
  d.window.AMOCRM = {
    constant: (key) => ({ id: key === "account" ? 1 : 2 }),
    data: { current_card: false },
  };
  d.window.eval(readFileSync("../widget/script.js", "utf8"));
  const w = new Constructor();
  const target = d.window.document.getElementById("target");
  w.callbacks.settings(target);
  failure(new Error("offline"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(forgotten, 1);
  w.callbacks.settings(target);
  assert.equal(calls, 2);
  success({
    mount() {
      mounts++;
    },
    destroy() {},
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(mounts, 1);
  w.callbacks.destroy();
  d.window.close();
});
