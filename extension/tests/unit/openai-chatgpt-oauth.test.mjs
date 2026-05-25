import test from "node:test";
import assert from "node:assert/strict";
import {
  OpenAIChatGptOAuthProvider,
  OPENAI_CHATGPT_DEVICE_APPROVAL_URL,
  OPENAI_CHATGPT_DEVICE_CALLBACK_URL,
  OPENAI_CHATGPT_DEVICE_TOKEN_URL,
  OPENAI_CHATGPT_DEVICE_USER_CODE_URL,
  OPENAI_CHATGPT_OAUTH_CLIENT_ID,
  OPENAI_CHATGPT_OAUTH_TOKEN_URL,
  deviceAuthorizationUrl,
  disconnectChatGptOAuth,
  pollChatGptOAuthDeviceAuthorization,
  startChatGptOAuthDeviceAuthorization,
  validateOAuthConnectConfig
} from "../../dist/src/providers/openai-chatgpt-oauth.js";

const config = {
  provider: "openai-chatgpt-oauth",
  base_url: "https://api.openai.com/v1",
  model: "gpt-5.5",
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_at: "2099-01-01T00:00:00.000Z",
  temperature: 0.1,
  max_tokens: 1200,
  timeout_seconds: 30,
  retry_count: 1
};

test("ChatGPT OAuth device authorization URL carries the user code", () => {
  const url = new URL(deviceAuthorizationUrl("ABCD-EFGH"));

  assert.equal(url.origin + url.pathname, OPENAI_CHATGPT_DEVICE_APPROVAL_URL);
  assert.equal(url.searchParams.get("user_code"), "ABCD-EFGH");
});

test("ChatGPT OAuth config validation only requires provider API base URL and model", () => {
  assert.equal(validateOAuthConnectConfig(config), undefined);
  assert.match(validateOAuthConnectConfig({ ...config, base_url: "http://example.test/v1" }) ?? "", /Plain HTTP/);
  assert.match(validateOAuthConnectConfig({ ...config, model: "" }) ?? "", /Model is required/i);
});

test("ChatGPT OAuth disconnect removes stored token material only", () => {
  const disconnected = disconnectChatGptOAuth(config);

  assert.equal(disconnected.provider, "openai-chatgpt-oauth");
  assert.equal("access_token" in disconnected, false);
  assert.equal("refresh_token" in disconnected, false);
  assert.equal("expires_at" in disconnected, false);
});

test("ChatGPT OAuth refuses legacy manually configured OAuth token metadata", async () => {
  const provider = new OpenAIChatGptOAuthProvider({
    ...config,
    client_id: "legacy-client",
    authorization_url: "https://legacy.example/authorize",
    token_url: "https://legacy.example/token",
    scopes: "openid"
  });

  const result = await provider.classifyBookmark({ url: "https://example.com", title: "Example", taxonomyFolders: ["/Bookmarks Bar/Work"] });

  assert.equal(result.ok, false);
  assert.equal(result.code, "auth_failed");
  assert.match(result.message, /reconnect/i);
});

test("ChatGPT OAuth refresh preserves existing refresh token when endpoint omits replacement", async () => {
  const originalFetch = globalThis.fetch;
  let updatedConfig;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (String(url).endsWith("/oauth/token")) {
      return new Response(JSON.stringify({ access_token: "new-access-token", expires_in: 3600 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            url: "https://example.com",
            original_title: "Example",
            descriptive_title: "Example classified",
            summary: "Summary",
            target_folder: "/Bookmarks Bar/Work",
            tags: ["example"],
            content_type: "reference",
            audience: "general",
            confidence: 0.8,
            recommended_action: "needs_review",
            reason: "Matched test taxonomy."
          })
        }
      }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const provider = new OpenAIChatGptOAuthProvider({ ...config, expires_at: "2000-01-01T00:00:00.000Z" }, async (nextConfig) => { updatedConfig = nextConfig; });
    const result = await provider.classifyBookmark({ url: "https://example.com", title: "Example", taxonomyFolders: ["/Bookmarks Bar/Work"] });

    assert.equal(result.ok, true);
    assert.equal(updatedConfig.refresh_token, "refresh-token");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, OPENAI_CHATGPT_OAUTH_TOKEN_URL);
    assert.equal(calls[1].options.headers.Authorization, "Bearer new-access-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ChatGPT OAuth device flow starts, polls, and exchanges approved code", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === OPENAI_CHATGPT_DEVICE_USER_CODE_URL) {
      return new Response(JSON.stringify({ device_auth_id: "device-1", user_code: "ABCD-EFGH", interval: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === OPENAI_CHATGPT_DEVICE_TOKEN_URL) {
      return new Response(JSON.stringify({ authorization_code: "auth-code", code_verifier: "verifier" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === OPENAI_CHATGPT_OAUTH_TOKEN_URL) {
      const body = options.body;
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("code"), "auth-code");
      assert.equal(body.get("redirect_uri"), OPENAI_CHATGPT_DEVICE_CALLBACK_URL);
      assert.equal(body.get("client_id"), OPENAI_CHATGPT_OAUTH_CLIENT_ID);
      assert.equal(body.get("code_verifier"), "verifier");
      return new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 3600 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const session = await startChatGptOAuthDeviceAuthorization();
    const pollResult = await pollChatGptOAuthDeviceAuthorization({ ...config, access_token: undefined, refresh_token: undefined, expires_at: undefined }, session);

    assert.equal(session.device_auth_id, "device-1");
    assert.equal(session.user_code, "ABCD-EFGH");
    assert.equal(new URL(session.verification_url).searchParams.get("user_code"), "ABCD-EFGH");
    assert.equal(pollResult.status, "connected");
    assert.equal(pollResult.config.access_token, "access");
    assert.equal(pollResult.config.refresh_token, "refresh");
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
