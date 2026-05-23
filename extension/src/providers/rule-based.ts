import type { ProviderConfig } from "../background/storage.js";
import type { ClassificationInput, ClassificationResult } from "../models/classification.js";
import { DEFAULT_TAXONOMY, type BookmarkTaxonomy } from "../models/taxonomy.js";
import { domainFromUrl } from "../utils/normalize-url.js";
import type { AIProvider, ProviderResult } from "./types.js";

export class RuleBasedProvider implements AIProvider {
  id = "rule-based";
  name = "No-AI Rule-Based Classifier";

  constructor(private taxonomy: BookmarkTaxonomy = DEFAULT_TAXONOMY) {}

  async validateConfig(_config: ProviderConfig): Promise<ProviderResult<{ model: string }>> {
    return { ok: true, value: { model: "rule-based" } };
  }

  async classifyBookmark(input: ClassificationInput): Promise<ProviderResult<ClassificationResult>> {
    const title = input.title || input.url;
    const domain = domainFromUrl(input.url);
    const haystack = `${input.url} ${title} ${input.visibleText ?? ""}`.toLowerCase();
    const sortedRules = [...this.taxonomy.rules].sort((a, b) => a.priority - b.priority);
    const rule = sortedRules.find((candidate) => {
      const matchesDomain = candidate.match.domains?.some((ruleDomain) => domain === ruleDomain || domain.endsWith(`.${ruleDomain}`));
      const matchesTitle = candidate.match.titleKeywords?.some((keyword) => haystack.includes(keyword.toLowerCase()));
      const matchesUrl = candidate.match.urlPatterns?.some((pattern) => new RegExp(pattern).test(input.url));
      const matchesContent = candidate.match.contentKeywords?.some((keyword) => haystack.includes(keyword.toLowerCase()));
      return matchesDomain || matchesTitle || matchesUrl || matchesContent;
    });
    const target = rule?.action.targetFolder ?? this.taxonomy.defaultRoot + "/Reference";
    const source = rule?.action.titlePrefix ?? sourceName(domain);
    return {
      ok: true,
      value: {
        url: input.url,
        original_title: title,
        descriptive_title: `${source}: ${cleanTitle(title, domain)}`.slice(0, 140),
        summary: `Bookmark from ${domain} classified with deterministic local rules.`,
        target_folder: target,
        tags: [...new Set([domain.split(".").at(-2) ?? domain, ...(rule?.action.tags ?? [])])],
        content_type: domain === "github.com" ? "repository" : "reference",
        audience: "unknown",
        confidence: rule ? 0.82 : 0.62,
        recommended_action: rule ? "move" : "hold",
        reason: rule ? `Matched rule: ${rule.name}.` : "No rule matched with enough confidence."
      }
    };
  }

  async summarizeBookmark(): Promise<ProviderResult<{ summary: string }>> {
    return { ok: true, value: { summary: "Rule-based summaries use bookmark title and URL only." } };
  }
}

function sourceName(domain: string): string {
  if (domain === "github.com") return "GitHub";
  return domain.split(".").filter(Boolean).slice(-2, -1)[0]?.replace(/^./, (c) => c.toUpperCase()) ?? domain;
}

function cleanTitle(title: string, domain: string): string {
  return title.replace(new RegExp(`\\s*[|—-]\\s*${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*$`, "i"), "").trim() || domain;
}
