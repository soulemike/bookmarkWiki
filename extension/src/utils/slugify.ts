const RESERVED_NAMES = new Set(["con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"]);

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/[^a-z0-9._ -]/g, "")
    .replace(/[._ -]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  const safe = slug || "bookmark";
  return RESERVED_NAMES.has(safe) ? `${safe}-bookmark` : safe;
}
