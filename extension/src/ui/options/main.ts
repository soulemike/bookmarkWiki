import type { BookmarkTaxonomy } from "../../models/taxonomy.js";
import type { ProviderConfig, UserSettings } from "../../background/storage.js";

const app = document.querySelector<HTMLDivElement>("#app")!;

type SettingsResponse = { settings: UserSettings; taxonomy: BookmarkTaxonomy; providerConfig?: ProviderConfig };

async function send<T>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

async function load(): Promise<void> {
  const { settings, providerConfig } = await send<SettingsResponse>({ type: "settings:get" });
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
      <label>Base URL <input name="base_url" value="${providerConfig?.base_url ?? "https://api.openai.com/v1"}"></label>
      <label>Model <input name="model" value="${providerConfig?.model ?? "gpt-5.5"}"></label>
      <label>API key <input name="api_key" type="password" placeholder="Stored in chrome.storage.local only"></label>
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
    const providerConfig: ProviderConfig = {
      provider: "openai-compatible",
      base_url: String(data.get("base_url")),
      model: String(data.get("model")),
      api_key: String(data.get("api_key") || "") || undefined,
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
