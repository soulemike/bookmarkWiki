import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIChatGptOAuthProvider, buildAuthorizationUrl, disconnectChatGptOAuth, parseAuthorizationCode, validateOAuthConnectConfig } from "../../dist/src/providers/openai-chatgpt-oauth.js";

const config = {
  provider: "openai-chatgpt-oauth",
  base_url: "https://api.openai.com/v1",
  model: "gpt-5.5",
  client_id: "client-123",
  authorization_url: "https://auth.example.test/oauth/authorize",
  token_url: "https://auth.example.test/oauth/token",
  scopes: "openid profile email",
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_at: "2099-01-01T00:00:00.000Z",
  temperature: 0.1,
  max_tokens: 1200,
  timeout_seconds: 30,
  retry_count: 1
};

test("ChatGPT OAuth authorization URL uses authorization code with PKCE S256", () => {
  const url = new URL(buildAuthorizationUrl(config, "https://extension.example/callback", "challenge", "state-123"));

  assert.equal(url.origin, "https://auth.example.test");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "client-123");
  assert.equal(url.searchParams.get("redirect_uri"), "https://extension.example/callback");
  assert.equal(url.searchParams.get("scope"), "openid profile email");
  assert.equal(url.searchParams.get("code_challenge"), "challenge");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "state-123");
});

test("ChatGPT OAuth redirect parser validates state before returning code", () => {
  assert.equal(parseAuthorizationCode("https://extension.example/callback?code=abc&state=state-123", "state-123"), "abc");
  assert.throws(() => parseAuthorizationCode("https://extension.example/callback?code=abc&state=wrong", "state-123"), /state mismatch/i);
  assert.throws(() => parseAuthorizationCode("https://extension.example/callback?error=access_denied&state=state-123", "state-123"), /access_denied/i);
});

test("ChatGPT OAuth config validation requires secure OAuth endpoints", () => {
  assert.equal(validateOAuthConnectConfig(config), undefined);
  assert.match(validateOAuthConnectConfig({ ...config, authorization_url: "http://auth.example.test/oauth/authorize" }) ?? "", /https/);
  assert.match(validateOAuthConnectConfig({ ...config, client_id: "" }) ?? "", /client ID/i);
});

test("ChatGPT OAuth disconnect removes stored token material only", () => {
  const disconnected = disconnectChatGptOAuth(config);

  assert.equal(disconnected.provider, "openai-chatgpt-oauth");
  assert.equal(disconnected.client_id, "client-123");
  assert.equal("access_token" in disconnected, false);
  assert.equal("refresh_token" in disconnected, false);
  assert.equal("expires_at" in disconnected, false);
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
    assert.equal(calls[1].options.headers.Authorization, "Bearer new-access-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
