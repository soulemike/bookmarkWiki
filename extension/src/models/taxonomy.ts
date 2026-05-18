export interface ClassificationRule {
  id: string;
  name: string;
  priority: number;
  match: {
    domains?: string[];
    urlPatterns?: string[];
    titleKeywords?: string[];
    contentKeywords?: string[];
  };
  action: {
    targetFolder: string;
    tags?: string[];
    titlePrefix?: string;
  };
}

export interface TaxonomyFolder {
  path: string;
  chromeBookmarkId?: string;
  description: string;
  aliases?: string[];
  includeKeywords?: string[];
  excludeKeywords?: string[];
  examples?: string[];
}

export interface BookmarkTaxonomy {
  version: string;
  defaultRoot: string;
  folders: TaxonomyFolder[];
  rules: ClassificationRule[];
}

export const DEFAULT_TAXONOMY: BookmarkTaxonomy = {
  version: "1.0.0",
  defaultRoot: "/Bookmarks Bar",
  folders: [
    { path: "/Bookmarks Bar/Work", description: "Work-related resources", includeKeywords: ["docs", "reference", "microsoft", "github"] },
    { path: "/Bookmarks Bar/Personal", description: "Personal bookmarks" },
    { path: "/Bookmarks Bar/Reference", description: "General reference material", includeKeywords: ["wikipedia", "reference", "guide"] }
  ],
  rules: [
    { id: "github-work", name: "GitHub repositories", priority: 10, match: { domains: ["github.com"] }, action: { targetFolder: "/Bookmarks Bar/Work", tags: ["github", "repository"], titlePrefix: "GitHub" } },
    { id: "docs-reference", name: "Documentation", priority: 20, match: { titleKeywords: ["docs", "documentation", "reference", "guide"] }, action: { targetFolder: "/Bookmarks Bar/Reference", tags: ["documentation"] } }
  ]
};
