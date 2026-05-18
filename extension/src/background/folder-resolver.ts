import { joinFolderPath, parseFolderPath, rootNameForPath, type RootName } from "../utils/folder-path.js";

export interface ResolvedFolder {
  path: string;
  chromeBookmarkId: string;
  root: RootName;
}

export type FolderResolveResult =
  | { ok: true; folder: ResolvedFolder }
  | { ok: false; code: "invalid_path" | "missing_folder" | "ambiguous_folder"; message: string };

const ROOT_ID_TO_NAME: Record<string, string> = {
  "1": "Bookmarks Bar",
  "2": "Other Bookmarks",
  "3": "Mobile Bookmarks"
};

export class FolderResolver {
  private cache = new Map<string, chrome.bookmarks.BookmarkTreeNode[]>();

  async refresh(): Promise<void> {
    this.cache.clear();
    const tree = await chrome.bookmarks.getTree();
    const visit = (node: chrome.bookmarks.BookmarkTreeNode, ancestors: string[]): void => {
      if (node.url) return;
      const label = ROOT_ID_TO_NAME[node.id] ?? node.title;
      const path = joinFolderPath([...ancestors, label]);
      const existing = this.cache.get(path) ?? [];
      existing.push(node);
      this.cache.set(path, existing);
      for (const child of node.children ?? []) visit(child, [...ancestors, label]);
    };
    for (const root of tree) for (const child of root.children ?? []) visit(child, []);
  }

  async resolve(path: string): Promise<FolderResolveResult> {
    try {
      parseFolderPath(path);
    } catch (error) {
      return { ok: false, code: "invalid_path", message: error instanceof Error ? error.message : "Invalid folder path" };
    }
    if (this.cache.size === 0) await this.refresh();
    const matches = this.cache.get(path) ?? [];
    if (matches.length === 0) return { ok: false, code: "missing_folder", message: `Folder not found: ${path}` };
    if (matches.length > 1) return { ok: false, code: "ambiguous_folder", message: `Multiple folders match: ${path}` };
    return { ok: true, folder: { path, chromeBookmarkId: matches[0].id, root: rootNameForPath(path) } };
  }

  async canResolve(path: string): Promise<boolean> {
    const result = await this.resolve(path);
    return result.ok;
  }
}
