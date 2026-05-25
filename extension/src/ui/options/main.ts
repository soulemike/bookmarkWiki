import type { ProviderConfig, UserSettings } from "../../background/storage.js";
import type { BookmarkTaxonomy } from "../../models/taxonomy.js";
import { OPENAI_CHATGPT_CODEX_BASE_URL, OPENAI_CHATGPT_DEVICE_CALLBACK_URL, OPENAI_CHATGPT_OAUTH_CLIENT_ID, type DeviceAuthorizationSession, validateOAuthConnectConfig } from "../../providers/openai-chatgpt-oauth.js";
import { providerOriginPattern, validateProviderBaseUrl } from "../../providers/openai-compatible.js";

const app = document.querySelector<HTMLDivElement>("#app")!;

type SettingsResponse = { settings: UserSettings; taxonomy: BookmarkTaxonomy; providerConfig?: ProviderConfig };
type HostPermissionRequest = { origins: string[] };
type OAuthStartResponse = { ok: true; session: DeviceAuthorizationSession } | { ok: false; message: string };
type OAuthPollResponse = { ok: true; status: "pending" } | { ok: true; status: "connected"; expires_at?: string } | { ok: false; message: string };
type ChromePermissionsApi = {
  request(permissions: HostPermissionRequest): Promise<boolean>;
};

async function send<T>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

async function load(): Promise<void> {
  const { settings, providerConfig: savedProviderConfig } = await send<SettingsResponse>({ type: "settings:get" });
  const openAICompatibleConfig = savedProviderConfig?.provider === "openai-compatible" ? savedProviderConfig : undefined;
  const chatGptOAuthConfig = savedProviderConfig?.provider === "openai-chatgpt-oauth" ? savedProviderConfig : undefined;
  app.innerHTML = `
    <h1>Bookmark Queue Agent Options</h1>
    <form id="settings-form">
      <label><input name="routeNormalBookmarks" type="checkbox" ${settings.routeNormalBookmarks ? "checked" : ""}> Route normal bookmarks to queue</label>
      <label><input name="enableAutoMove" type="checkbox" ${settings.enableAutoMove ? "checked" : ""}> Enable auto-move for high confidence</label>
      <label>Review threshold <input name="reviewThreshold" type="number" min="0" max="1" step="0.01" value="${settings.reviewThreshold}"></label>
      <label>Auto-move threshold <input name="autoMoveThreshold" type="number" min="0" max="1" step="0.01" value="${settings.autoMoveThreshold}"></label>
      <p class="hint">A bookmark only auto-moves when auto-move is enabled and confidence is at or above the auto-move threshold. The default is 0.90.</p>
      <label><input name="allowPageTextExtraction" type="checkbox" ${settings.allowPageTextExtraction ? "checked" : ""}> Allow page text extraction</label>
      <section class="provider-note" aria-label="Native host sync settings">
        <strong>Windows-first native host sync</strong>
        <p>Set this up once to let the extension write approved bookmarks to a local folder on your PC.</p>
        <ol class="setup-steps">
          <li>Copy this extension's ID from <code>chrome://extensions</code>.</li>
          <li>Open PowerShell in the repo's <code>native-host</code> folder and run <code>.\\install-windows.ps1 -Browser Chrome -ExtensionId &lt;extension-id&gt;</code>.</li>
          <li>Click <strong>Test connection</strong>. If it succeeds, choose a folder and turn on local file sync.</li>
        </ol>
        <label><input name="enableNativeHostSync" type="checkbox" ${settings.enableNativeHostSync ? "checked" : ""}> Enable local file sync for approved bookmarks</label>
        <label>Folder to write files to <input name="nativeHostTargetPath" value="${escapeAttribute(settings.nativeHostTargetPath)}" placeholder="C:\\Users\\you\\Documents\\BookmarkWiki"></label>
        <button id="test-native-host" type="button">Test connection</button>
      </section>
      <label>Provider
        <select name="provider">
          <option value="rule-based" ${settings.provider === "rule-based" ? "selected" : ""}>No-AI rule based</option>
          <option value="openai-compatible" ${settings.provider === "openai-compatible" ? "selected" : ""}>OpenAI-compatible API / local bridge</option>
          <option value="openai-chatgpt-oauth" ${settings.provider === "openai-chatgpt-oauth" ? "selected" : ""}>OpenAI ChatGPT OAuth</option>
        </select>
      </label>
      <section class="provider-note" aria-label="Provider authentication note">
        <strong>Supported OpenAI-compatible authentication</strong>
        <p>Use an OpenAI Platform API project key, a token for a local OpenAI-compatible bridge, or OpenAI ChatGPT OAuth via device authorization. ChatGPT/Codex browser cookies, copied session tokens, and account web sessions are not used as credentials.</p>
        <p>Local bridges must expose an OpenAI-compatible <code>/chat/completions</code> endpoint. Plain HTTP is allowed only for localhost or 127.0.0.1.</p>
      </section>
      <label>Base URL <input name="base_url" value="${escapeAttribute(defaultBaseUrl(settings.provider, savedProviderConfig))}"></label>
      <label>Model <input name="model" value="${escapeAttribute(savedProviderConfig?.model ?? "gpt-5.5")}"></label>
      <label>API project key or compatible bearer token <input name="api_key" type="password" placeholder="Stored in chrome.storage.local only; leave blank to keep saved key"></label>
      <section class="provider-note" aria-label="ChatGPT OAuth settings">
        <strong>ChatGPT OAuth settings</strong>
        <p>This provider uses OpenAI's device authorization flow with public client <code>${OPENAI_CHATGPT_OAUTH_CLIENT_ID}</code>. Click connect, approve the shown code in the opened OpenAI tab, then return here after the connection completes. No client ID, redirect URI, or endpoint setup is required.</p>
        <p class="hint">Token exchange uses <code>${OPENAI_CHATGPT_DEVICE_CALLBACK_URL}</code> internally, avoiding Chrome extension redirect URI allowlisting.</p>
        <p class="hint">${chatGptOAuthConfig?.access_token ? `OAuth connected${chatGptOAuthConfig.expires_at ? ` until ${chatGptOAuthConfig.expires_at}` : ""}.` : "OAuth is not connected yet."}</p>
      </section>
      <label>Excluded domains <input name="excludedDomains" value="${escapeAttribute(settings.excludedDomains.join(", "))}"></label>
      <div class="actions">
        <button name="action" value="save">Save</button>
        <button name="action" value="connect-oauth">Save and connect ChatGPT OAuth</button>
        <button name="action" value="disconnect-oauth">Disconnect ChatGPT OAuth</button>
      </div>
    </form>`;
  document.querySelector<HTMLFormElement>("#settings-form")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event instanceof SubmitEvent && event.submitter instanceof HTMLButtonElement ? event.submitter.value : "save";
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const nextSettings: UserSettings = {
      ...settings,
      routeNormalBookmarks: data.get("routeNormalBookmarks") === "on",
      enableAutoMove: data.get("enableAutoMove") === "on",
      reviewThreshold: clampUnitInterval(Number(data.get("reviewThreshold")), settings.reviewThreshold),
      autoMoveThreshold: clampUnitInterval(Number(data.get("autoMoveThreshold")), settings.autoMoveThreshold),
      allowPageTextExtraction: data.get("allowPageTextExtraction") === "on",
      enableNativeHostSync: data.get("enableNativeHostSync") === "on",
      nativeHostTargetPath: String(data.get("nativeHostTargetPath") ?? "").trim(),
      provider: data.get("provider") as UserSettings["provider"],
      excludedDomains: String(data.get("excludedDomains") ?? "").split(",").map((domain) => domain.trim()).filter(Boolean)
    };
    clearStatus();
    const providerConfig = buildProviderConfig(data, savedProviderConfig, openAICompatibleConfig);
    const configError = validateProviderConfig(providerConfig);
    if (configError) {
      showStatus(configError, "error");
      return;
    }
    if (nextSettings.provider !== "rule-based" && !(await requestProviderPermissions(providerConfig))) {
      showStatus("Chrome host permission is required for the configured provider origin before saving.", "error");
      return;
    }
    await send({ type: "settings:save", settings: nextSettings, providerConfig });
    if (submitter === "connect-oauth") {
      if (providerConfig.provider !== "openai-chatgpt-oauth") {
        showStatus("Select OpenAI ChatGPT OAuth before connecting.", "error");
        return;
      }
      await connectChatGptOAuth(providerConfig);
      return;
    }
    if (submitter === "disconnect-oauth") {
      await send({ type: "oauth:disconnect" });
      showStatus("ChatGPT OAuth disconnected.", "saved");
      return;
    }
    showStatus("Saved.", "saved");
  });
  document.querySelector<HTMLButtonElement>("#test-native-host")!.addEventListener("click", async () => {
    clearStatus();
    const result = await send<{ ok: boolean; message: string }>({ type: "native-host:status" });
    showStatus(result.message, result.ok ? "saved" : "error");
  });
}

async function connectChatGptOAuth(providerConfig: Extract<ProviderConfig, { provider: "openai-chatgpt-oauth" }>): Promise<void> {
  const started = await send<OAuthStartResponse>({ type: "oauth:start", providerConfig });
  if (!started.ok) {
    showStatus(started.message, "error");
    return;
  }
  window.open(started.session.verification_url, "_blank", "noopener");
  showStatus(`Approve code ${started.session.user_code} in the opened OpenAI tab. Waiting for approval...`, "saved");
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const response = await send<OAuthPollResponse>({ type: "oauth:poll", providerConfig, session: started.session });
    if (!response.ok) {
      showStatus(response.message, "error");
      return;
    }
    if (response.status === "connected") {
      showStatus(`OAuth connected${response.expires_at ? ` until ${response.expires_at}` : ""}.`, "saved");
      return;
    }
    await sleep(started.session.interval_ms);
  }
  showStatus("OpenAI device authorization timed out before approval completed.", "error");
}

void load();

function clampUnitInterval(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

async function requestProviderPermissions(config: ProviderConfig): Promise<boolean> {
  const origins = providerOrigins(config);
  if (origins.length === 0) return false;
  const permissionsApi = (chrome as typeof chrome & { permissions: ChromePermissionsApi }).permissions;
  return permissionsApi.request({ origins });
}

function buildProviderConfig(data: FormData, savedProviderConfig: ProviderConfig | undefined, openAICompatibleConfig: ProviderConfig | undefined): ProviderConfig {
  const selectedProvider = data.get("provider");
  const baseConfig = {
    base_url: selectedProvider === "openai-chatgpt-oauth" ? OPENAI_CHATGPT_CODEX_BASE_URL : String(data.get("base_url") ?? "").trim(),
    model: String(data.get("model") ?? "").trim(),
    temperature: 0.1,
    max_tokens: 1200,
    timeout_seconds: 30,
    retry_count: 1
  };
  if (selectedProvider === "openai-chatgpt-oauth") {
    const canReuseTokens = savedProviderConfig?.provider === "openai-chatgpt-oauth"
      && savedProviderConfig.base_url === baseConfig.base_url
      && !hasLegacyOAuthMetadata(savedProviderConfig);
    return {
      provider: "openai-chatgpt-oauth",
      ...baseConfig,
      access_token: canReuseTokens ? savedProviderConfig.access_token : undefined,
      refresh_token: canReuseTokens ? savedProviderConfig.refresh_token : undefined,
      expires_at: canReuseTokens ? savedProviderConfig.expires_at : undefined
    };
  }
  const apiKey = String(data.get("api_key") || "");
  return {
    provider: "openai-compatible",
    ...baseConfig,
    api_key: apiKey || (openAICompatibleConfig?.provider === "openai-compatible" ? openAICompatibleConfig.api_key : undefined)
  };
}

function defaultBaseUrl(provider: UserSettings["provider"], savedProviderConfig: ProviderConfig | undefined): string {
  if (provider === "openai-chatgpt-oauth") return OPENAI_CHATGPT_CODEX_BASE_URL;
  return savedProviderConfig?.base_url ?? "https://api.openai.com/v1";
}

function validateProviderConfig(config: ProviderConfig): string | undefined {
  if (config.provider === "openai-chatgpt-oauth") return validateOAuthConnectConfig(config);
  return validateProviderBaseUrl(config.base_url);
}

function providerOrigins(config: ProviderConfig): string[] {
  const origins = [providerOriginPattern(config.base_url)].filter((origin): origin is string => Boolean(origin));
  return origins;
}

function hasLegacyOAuthMetadata(config: ProviderConfig): boolean {
  const value = config as unknown as Record<string, unknown>;
  return ["client_id", "authorization_url", "token_url", "scopes"].some((field) => field in value);
}

function showStatus(message: string, className: "saved" | "error"): void {
  clearStatus();
  const status = document.createElement("p");
  status.className = className;
  status.textContent = message;
  app.append(status);
}

function clearStatus(): void {
  document.querySelectorAll(".saved, .error").forEach((element) => element.remove());
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
