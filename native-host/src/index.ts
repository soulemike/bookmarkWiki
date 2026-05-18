export interface NativeHostRequest {
  requestId: string;
  action: "write_kb" | "git_commit" | "status";
  targetPath?: string;
  files?: Array<{ relativePath: string; content: string; sha256: string }>;
}

export interface NativeHostResponse {
  requestId: string;
  ok: boolean;
  writtenFiles?: string[];
  commitHash?: string;
  errorCode?: string;
  message?: string;
}

export function status(requestId: string): NativeHostResponse {
  return { requestId, ok: true, message: "Native host placeholder for MVP 4." };
}
