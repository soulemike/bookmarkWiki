const ROOT_ALIASES = new Map([
  ["Bookmarks Bar", "bookmarks_bar"],
  ["Other Bookmarks", "other_bookmarks"],
  ["Mobile Bookmarks", "mobile_bookmarks"]
]);

export type RootName = "bookmarks_bar" | "other_bookmarks" | "mobile_bookmarks" | "configured_root";

export function parseFolderPath(path: string): string[] {
  if (!path.startsWith("/")) throw new Error("Folder path must be absolute");
  const parts = path.split("/").filter(Boolean).map((part) => part.trim());
  if (parts.length === 0) throw new Error("Folder path must include a root");
  if (parts.some((part) => part.length === 0 || part.includes("\\"))) throw new Error("Folder path contains invalid segments");
  return parts;
}

export function isRootedFolderPath(path: string): boolean {
  try {
    parseFolderPath(path);
    return true;
  } catch {
    return false;
  }
}

export function rootNameForPath(path: string): RootName {
  const [root] = parseFolderPath(path);
  return (ROOT_ALIASES.get(root) as RootName | undefined) ?? "configured_root";
}

export function joinFolderPath(parts: string[]): string {
  return `/${parts.filter(Boolean).join("/")}`;
}
