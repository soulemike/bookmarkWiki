import type { BookmarkQueueItem } from "../models/bookmark.js";
import type { ClassificationInput, ClassificationResult } from "../models/classification.js";
import { validateClassificationResult } from "../models/classification.js";
import { OpenAICompatibleProvider } from "../providers/openai-compatible.js";
import { RuleBasedProvider } from "../providers/rule-based.js";
import type { AIProvider, ProviderResult } from "../providers/types.js";
import { domainFromUrl } from "../utils/normalize-url.js";
import { FolderResolver } from "./folder-resolver.js";
import { storage, type UserSettings } from "./storage.js";

export class ClassificationOrchestrator {
  constructor(private folderResolver = new FolderResolver()) {}

  async classify(item: BookmarkQueueItem, pageText?: string): Promise<ProviderResult<ClassificationResult>> {
    const [settings, taxonomy, providerConfig] = await Promise.all([storage.getSettings(), storage.getTaxonomy(), storage.getProviderConfig()]);
    if (settings.excludedDomains.includes(domainFromUrl(item.url))) {
      return { ok: false, code: "invalid_config", message: "Domain is excluded from classification", retryable: false };
    }
    const provider: AIProvider = settings.provider === "openai-compatible" && providerConfig
      ? new OpenAICompatibleProvider(providerConfig)
      : new RuleBasedProvider(taxonomy);
    const input: ClassificationInput = {
      url: item.url,
      title: item.originalTitle,
      visibleText: settings.allowPageTextExtraction ? pageText : undefined,
      taxonomyFolders: taxonomy.folders.map((folder) => folder.path)
    };
    const result = await provider.classifyBookmark(input);
    if (!result.ok) return result;
    const validation = validateClassificationResult(result.value);
    if (!validation.ok) return { ok: false, code: "schema_validation_failed", message: validation.errors.join("; "), retryable: false };
    const folderDecision = await this.validateFolder(validation.value, settings);
    if (!folderDecision.ok) return folderDecision;
    return { ok: true, value: validation.value };
  }

  private async validateFolder(result: ClassificationResult, settings: UserSettings): Promise<ProviderResult<void>> {
    if (!result.target_folder) return { ok: true, value: undefined };
    const resolved = await this.folderResolver.resolve(result.target_folder);
    if (!resolved.ok && settings.strictMode) {
      return { ok: false, code: "schema_validation_failed", message: resolved.message, retryable: false };
    }
    return { ok: true, value: undefined };
  }
}
