import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHttpFailure, readProviderError } from "../../dist/src/providers/openai-compatible.js";

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
