import type { AuditLogEntry } from "../models/audit-log.js";
import type { BookmarkQueueItem } from "../models/bookmark.js";
import { DEFAULT_TAXONOMY, type BookmarkTaxonomy } from "../models/taxonomy.js";

export interface UserSettings {
  routeNormalBookmarks: boolean;
  provider: "rule-based" | "openai-compatible" | "openai-chatgpt-oauth";
  strictMode: boolean;
  enableAutoMove: boolean;
  reviewThreshold: number;
  autoMoveThreshold: number;
  excludedDomains: string[];
  allowPageTextExtraction: boolean;
  enableNativeHostSync: boolean;
  nativeHostTargetPath: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  routeNormalBookmarks: false,
  provider: "rule-based",
  strictMode: true,
  enableAutoMove: false,
  reviewThreshold: 0.7,
  autoMoveThreshold: 0.9,
  excludedDomains: [],
  allowPageTextExtraction: false,
  enableNativeHostSync: false,
  nativeHostTargetPath: ""
};

export interface OpenAICompatibleProviderConfig {
  provider: "openai-compatible";
  base_url: string;
  model: string;
  api_key?: string;
  temperature: number;
  max_tokens: number;
  timeout_seconds: number;
  retry_count: number;
}

export interface OpenAIChatGptOAuthProviderConfig {
  provider: "openai-chatgpt-oauth";
  base_url: string;
  model: string;
  client_id: string;
  authorization_url: string;
  token_url: string;
  scopes: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  temperature: number;
  max_tokens: number;
  timeout_seconds: number;
  retry_count: number;
}

export type ProviderConfig = OpenAICompatibleProviderConfig | OpenAIChatGptOAuthProviderConfig;

const keys = {
  queue: "queueItems",
  audit: "auditLog",
  taxonomy: "taxonomy",
  settings: "settings",
  providerConfig: "providerConfig"
};

async function getLocal<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get(key);
  return (result[key] as T | undefined) ?? fallback;
}

async function setLocal<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export const storage = {
  async getQueue(): Promise<BookmarkQueueItem[]> {
    return getLocal(keys.queue, [] as BookmarkQueueItem[]);
  },
  async saveQueue(queue: BookmarkQueueItem[]): Promise<void> {
    await setLocal(keys.queue, queue);
  },
  async upsertQueueItem(item: BookmarkQueueItem): Promise<void> {
    const queue = await this.getQueue();
    const index = queue.findIndex((existing) => existing.id === item.id || existing.normalizedUrl === item.normalizedUrl);
    if (index >= 0) queue[index] = { ...queue[index], ...item, updatedAt: new Date().toISOString() };
    else queue.push(item);
    await this.saveQueue(queue);
  },
  async getAuditLog(): Promise<AuditLogEntry[]> {
    return getLocal(keys.audit, [] as AuditLogEntry[]);
  },
  async appendAudit(entry: AuditLogEntry): Promise<void> {
    const audit = await this.getAuditLog();
    audit.push(entry);
    await setLocal(keys.audit, audit);
  },
  async getTaxonomy(): Promise<BookmarkTaxonomy> {
    return getLocal(keys.taxonomy, DEFAULT_TAXONOMY);
  },
  async saveTaxonomy(taxonomy: BookmarkTaxonomy): Promise<void> {
    await setLocal(keys.taxonomy, taxonomy);
  },
  async getSettings(): Promise<UserSettings> {
    const saved = await getLocal<Partial<UserSettings>>(keys.settings, {});
    return { ...DEFAULT_SETTINGS, ...saved };
  },
  async saveSettings(settings: UserSettings): Promise<void> {
    await setLocal(keys.settings, settings);
  },
  async getProviderConfig(): Promise<ProviderConfig | undefined> {
    return getLocal<ProviderConfig | undefined>(keys.providerConfig, undefined);
  },
  async saveProviderConfig(config: ProviderConfig): Promise<void> {
    await setLocal(keys.providerConfig, config);
  }
};
