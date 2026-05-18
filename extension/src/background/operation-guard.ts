export interface OperationGuard {
  operationId: string;
  chromeBookmarkId: string;
  action: "create" | "move" | "update";
  createdAt: string;
  expiresAt: string;
}

const guards = new Map<string, OperationGuard>();
const STORAGE_KEY = "operationGuards";
const DEFAULT_TTL_MS = 60_000;

function guardKey(bookmarkId: string, action?: string): string {
  return `${bookmarkId}:${action ?? "*"}`;
}

export class OperationGuardManager {
  async hydrate(): Promise<void> {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    for (const guard of (stored[STORAGE_KEY] as OperationGuard[] | undefined) ?? []) {
      if (new Date(guard.expiresAt).getTime() > Date.now()) guards.set(guardKey(guard.chromeBookmarkId, guard.action), guard);
    }
  }

  async add(chromeBookmarkId: string, action: OperationGuard["action"], ttlMs = DEFAULT_TTL_MS): Promise<OperationGuard> {
    const now = Date.now();
    const guard: OperationGuard = {
      operationId: crypto.randomUUID(),
      chromeBookmarkId,
      action,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString()
    };
    guards.set(guardKey(chromeBookmarkId, action), guard);
    await this.persist();
    return guard;
  }

  matches(chromeBookmarkId: string, action?: OperationGuard["action"]): boolean {
    this.prune();
    if (action) return guards.has(guardKey(chromeBookmarkId, action));
    return ["create", "move", "update"].some((candidate) => guards.has(guardKey(chromeBookmarkId, candidate)));
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, guard] of guards) {
      if (new Date(guard.expiresAt).getTime() <= now) guards.delete(key);
    }
  }

  private async persist(): Promise<void> {
    this.prune();
    await chrome.storage.local.set({ [STORAGE_KEY]: [...guards.values()] });
  }
}
