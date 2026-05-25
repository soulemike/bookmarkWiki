export interface NativeHostFile {
  relativePath: string;
  content: string;
  sha256: string;
}

export interface NativeHostRequest {
  requestId: string;
  action: "write_kb" | "git_commit" | "status";
  targetPath?: string;
  files?: NativeHostFile[];
}

export interface NativeHostResponse {
  requestId: string;
  ok: boolean;
  writtenFiles?: string[];
  commitHash?: string;
  errorCode?: string;
  message?: string;
}
