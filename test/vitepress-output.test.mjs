import assert from "node:assert/strict";
import test from "node:test";
import { vitePressServerUrl } from "./support/vitepress-output.mjs";

test("VitePress readiness recognizes its URL when terminal styling wraps the port", () => {
  const colored = "  \x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://127.0.0.1:\x1b[1m39195\x1b[22m/\x1b[39m\n";
  assert.equal(vitePressServerUrl(colored), "http://127.0.0.1:39195");
  assert.equal(vitePressServerUrl("Local: http://localhost:5173/docs/"), "http://localhost:5173");
  assert.equal(vitePressServerUrl("vitepress 2.0.0-alpha.19"), undefined);
});
