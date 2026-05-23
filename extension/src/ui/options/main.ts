import type { BookmarkTaxonomy } from "../../models/taxonomy.js";
import type { ProviderConfig, UserSettings } from "../../background/storage.js";

const app = document.querySelector<HTMLDivElement>("#app")!;

type SettingsResponse = { settings: UserSettings; taxonomy: BookmarkTaxonomy; providerConfig?: ProviderConfig };

async function send<T>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

async function load(): Promise<void> {
  const { settings, providerConfig: savedProviderConfig } = await send<SettingsResponse>({ type: "settings:get" });
  app.innerHTML = `
    <h1>Bookmark Queue Agent Options</h1>
    <form id="settings-form">
      <label><input name="routeNormalBookmarks" type="checkbox" ${settings.routeNormalBookmarks ? "checked" : ""}> Route normal bookmarks to queue</label>
      <label><input name="enableAutoMove" type="checkbox" ${settings.enableAutoMove ? "checked" : ""}> Enable auto-move for high confidence</label>
      <label><input name="allowPageTextExtraction" type="checkbox" ${settings.allowPageTextExtraction ? "checked" : ""}> Allow page text extraction</label>
      <label>Provider
        <select name="provider">
          <option value="rule-based" ${settings.provider === "rule-based" ? "selected" : ""}>No-AI rule based</option>
          <option value="openai-compatible" ${settings.provider === "openai-compatible" ? "selected" : ""}>OpenAI-compatible</option>
        </select>
      </label>
      <section class="provider-note" aria-label="Provider authentication note">
        <strong>OpenAI API authentication</strong>
        <p>OpenAI API calls use API project keys or compatible bearer tokens. ChatGPT subscriptions and OpenAI account sign-in/OIDC sessions do not grant third-party API access for this extension.</p>
      </section>
      <label>Base URL <input name="base_url" value="${savedProviderConfig?.base_url ?? "https://api.openai.com/v1"}"></label>
      <label>Model <input name="model" value="${savedProviderConfig?.model ?? "gpt-5.5"}"></label>
      <label>API project key or compatible bearer token <input name="api_key" type="password" placeholder="Stored in chrome.storage.local only; leave blank to keep saved key"></label>
      <label>Excluded domains <input name="excludedDomains" value="${settings.excludedDomains.join(", ")}"></label>
      <button>Save</button>
    </form>`;
  document.querySelector<HTMLFormElement>("#settings-form")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const nextSettings: UserSettings = {
      ...settings,
      routeNormalBookmarks: data.get("routeNormalBookmarks") === "on",
      enableAutoMove: data.get("enableAutoMove") === "on",
      allowPageTextExtraction: data.get("allowPageTextExtraction") === "on",
      provider: data.get("provider") as UserSettings["provider"],
      excludedDomains: String(data.get("excludedDomains") ?? "").split(",").map((domain) => domain.trim()).filter(Boolean)
    };
    const apiKey = String(data.get("api_key") || "");
    const providerConfig: ProviderConfig = {
      provider: "openai-compatible",
      base_url: String(data.get("base_url")),
      model: String(data.get("model")),
      api_key: apiKey || savedProviderConfig?.api_key,
      temperature: 0.1,
      max_tokens: 1200,
      timeout_seconds: 30,
      retry_count: 1
    };
    await send({ type: "settings:save", settings: nextSettings, providerConfig });
    app.insertAdjacentHTML("beforeend", "<p class='saved'>Saved.</p>");
  });
}

void load();
