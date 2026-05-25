import test from "node:test";
import assert from "node:assert/strict";
import { authorizationHeader, normalizeHttpFailure, providerOriginPattern, readProviderError, validateProviderBaseUrl } from "../../dist/src/providers/openai-compatible.js";

test("OpenAI-compatible 429 insufficient_quota is surfaced as non-retryable quota detail", async () => {
  const response = new Response(JSON.stringify({
    error: {
      message: "You exceeded your current quota, please check your plan and billing details.",
      type: "insufficient_quota",
      code: "insufficient_quota"
    }
  }), { status: 429 });

  const message = await readProviderError(response);
  const failure = normalizeHttpFailure(429, message);

  assert.equal(failure.ok, false);
  assert.equal(failure.code, "rate_limited");
  assert.equal(failure.retryable, false);
  assert.match(failure.message, /quota/i);
  assert.match(failure.message, /billing/i);
  assert.match(failure.message, /code=insufficient_quota/);
});

test("OpenAI-compatible 429 rate_limit_exceeded remains retryable", async () => {
  const response = new Response(JSON.stringify({
    error: {
      message: "Rate limit reached for requests.",
      type: "rate_limit_error",
      code: "rate_limit_exceeded"
    }
  }), { status: 429 });

  const message = await readProviderError(response);
  const failure = normalizeHttpFailure(429, message);

  assert.equal(failure.ok, false);
  assert.equal(failure.code, "rate_limited");
  assert.equal(failure.retryable, true);
  assert.match(failure.message, /rate limit reached/i);
  assert.match(failure.message, /code=rate_limit_exceeded/);
});

test("OpenAI-compatible auth failures include provider details", () => {
  const failure = normalizeHttpFailure(401, "Incorrect API key provided. type=invalid_request_error code=invalid_api_key");

  assert.equal(failure.ok, false);
  assert.equal(failure.code, "auth_failed");
  assert.equal(failure.retryable, false);
  assert.match(failure.message, /incorrect api key/i);
});

test("OpenAI-compatible authorization header accepts pasted Bearer tokens", () => {
  assert.equal(authorizationHeader("Bearer eyJhbGciOi..."), "Bearer eyJhbGciOi...");
  assert.equal(authorizationHeader("  sk-proj-example  "), "Bearer sk-proj-example");
});

test("OpenAI-compatible base URL validation allows https and loopback local bridges", () => {
  assert.equal(validateProviderBaseUrl("https://api.openai.com/v1"), undefined);
  assert.equal(validateProviderBaseUrl("http://localhost:11434/v1"), undefined);
  assert.equal(validateProviderBaseUrl("http://127.0.0.1:1234/v1"), undefined);
  assert.equal(providerOriginPattern("http://127.0.0.1:1234/v1"), "http://127.0.0.1:1234/*");
});

test("OpenAI-compatible base URL validation rejects unsafe provider URLs", () => {
  assert.match(validateProviderBaseUrl("http://example.com/v1") ?? "", /Plain HTTP/);
  assert.match(validateProviderBaseUrl("file:///tmp/provider") ?? "", /https/);
  assert.match(validateProviderBaseUrl("not a url") ?? "", /valid URL/);
  assert.equal(providerOriginPattern("http://example.com/v1"), undefined);
});
