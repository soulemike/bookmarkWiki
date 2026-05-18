import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl } from "../../dist/src/utils/normalize-url.js";

test("normalizeUrl lowercases, removes defaults, fragments, tracking params, and sorts", () => {
  assert.equal(normalizeUrl("HTTPS://Example.COM:443/path?b=2&utm_source=x&a=1#section"), "https://example.com/path?a=1&b=2");
});

test("normalizeUrl preserves protocol and can keep fragments", () => {
  assert.equal(normalizeUrl("http://Example.com:80/?z=9&gclid=bad&a=1"), "http://example.com/?a=1&z=9");
  assert.equal(normalizeUrl("https://example.com/page#part", { keepFragment: true }), "https://example.com/page#part");
});
