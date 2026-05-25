#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, parse, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;
const HOST_DESCRIPTION = "Bookmark Queue Agent Native Host";

export async function handleRequest(request) {
  const requestId = typeof request?.requestId === "string" && request.requestId ? request.requestId : cryptoRandomId();
  if (!isObject(request)) return errorResponse(requestId, "invalid_request", "Request must be a JSON object.");
  if (request.action === "status") return { requestId, ok: true, message: `${HOST_DESCRIPTION} is available.` };
  if (request.action === "write_kb") return writeKnowledgeBase(requestId, request);
  if (request.action === "git_commit") return errorResponse(requestId, "unsupported_action", "Git commit automation is not implemented by this native host yet.");
  return errorResponse(requestId, "unsupported_action", `Unsupported native host action: ${String(request.action)}`);
}

export async function writeKnowledgeBase(requestId, request) {
  if (typeof request.targetPath !== "string" || request.targetPath.trim() === "") {
    return errorResponse(requestId, "missing_target_path", "targetPath is required for write_kb.");
  }
  if (!Array.isArray(request.files) || request.files.length === 0) {
    return errorResponse(requestId, "missing_files", "write_kb requires at least one file.");
  }

  const targetRoot = resolve(request.targetPath);
  const preparedFiles = [];
  for (const file of request.files) {
    const validation = validateWritableFile(targetRoot, file);
    if (!validation.ok) return errorResponse(requestId, validation.errorCode, validation.message);
    preparedFiles.push(validation.file);
  }

  const writtenFiles = [];
  const temporaryFiles = [];
  try {
    const targetSafety = await assertSafeTargetPath(targetRoot);
    if (!targetSafety.ok) return errorResponse(requestId, targetSafety.errorCode, targetSafety.message);
    await mkdir(targetRoot, { recursive: true });
    const createdTargetSafety = await assertSafeExistingParents(targetRoot, targetRoot);
    if (!createdTargetSafety.ok) return errorResponse(requestId, createdTargetSafety.errorCode, createdTargetSafety.message);
    for (const file of preparedFiles) {
      const parentSafety = await assertSafeExistingParents(targetRoot, dirname(file.absolutePath));
      if (!parentSafety.ok) return errorResponse(requestId, parentSafety.errorCode, parentSafety.message);
      await mkdir(dirname(file.absolutePath), { recursive: true });
      const temporaryPath = `${file.absolutePath}.tmp-${process.pid}-${Date.now()}`;
      temporaryFiles.push(temporaryPath);
      await writeFile(temporaryPath, file.content, "utf8");
      await rename(temporaryPath, file.absolutePath);
      writtenFiles.push(file.relativePath);
    }
    return { requestId, ok: true, writtenFiles, message: `Wrote ${writtenFiles.length} file(s).` };
  } catch (error) {
    await Promise.allSettled(temporaryFiles.map((file) => rm(file, { force: true })));
    return errorResponse(requestId, "filesystem_write_failed", error instanceof Error ? error.message : "Filesystem write failed.");
  }
}

export function validateWritableFile(targetRoot, file) {
  if (!isObject(file)) return invalid("invalid_file", "Each file entry must be an object.");
  if (typeof file.relativePath !== "string" || file.relativePath.trim() === "") return invalid("invalid_relative_path", "File relativePath is required.");
  if (typeof file.content !== "string") return invalid("invalid_content", `File ${file.relativePath} content must be a string.`);
  if (typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(file.sha256)) return invalid("invalid_sha256", `File ${file.relativePath} sha256 must be a lowercase hex SHA-256 digest.`);

  const normalizedRelativePath = file.relativePath.replaceAll("\\", "/");
  if (normalizedRelativePath.startsWith("/") || /^[A-Za-z]:\//u.test(normalizedRelativePath)) return invalid("absolute_path", `File ${file.relativePath} must be relative.`);
  const segments = normalizedRelativePath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return invalid("path_traversal", `File ${file.relativePath} contains an unsafe path segment.`);
  for (const segment of segments) {
    const segmentError = validateWindowsPathSegment(segment);
    if (segmentError) return invalid("windows_path_invalid", `File ${file.relativePath} is not Windows-safe: ${segmentError}`);
  }

  const contentHash = createHash("sha256").update(file.content, "utf8").digest("hex");
  if (contentHash !== file.sha256) return invalid("sha256_mismatch", `File ${file.relativePath} content does not match sha256.`);

  const absolutePath = resolve(targetRoot, ...segments);
  if (!isPathInside(targetRoot, absolutePath)) return invalid("path_traversal", `File ${file.relativePath} escapes targetPath.`);
  return { ok: true, file: { relativePath: normalizedRelativePath, absolutePath, content: file.content } };
}

export function encodeNativeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export async function decodeNativeMessages(input) {
  const messages = [];
  let offset = 0;
  while (offset < input.length) {
    if (input.length - offset < 4) throw new Error("Incomplete native-message length prefix.");
    const messageLength = input.readUInt32LE(offset);
    offset += 4;
    if (messageLength > MAX_MESSAGE_BYTES) throw new Error(`Native message exceeds ${MAX_MESSAGE_BYTES} bytes.`);
    if (input.length - offset < messageLength) throw new Error("Incomplete native-message payload.");
    messages.push(JSON.parse(input.subarray(offset, offset + messageLength).toString("utf8")));
    offset += messageLength;
  }
  return messages;
}

export async function readOneNativeMessage(input = process.stdin) {
  let buffer = Buffer.alloc(0);
  let expectedLength;
  for await (const chunk of input) {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    if (expectedLength === undefined && buffer.length >= 4) {
      expectedLength = buffer.readUInt32LE(0);
      if (expectedLength > MAX_MESSAGE_BYTES) throw new Error(`Native message exceeds ${MAX_MESSAGE_BYTES} bytes.`);
    }
    if (expectedLength !== undefined && buffer.length >= expectedLength + 4) {
      return JSON.parse(buffer.subarray(4, expectedLength + 4).toString("utf8"));
    }
  }
  throw new Error("Incomplete native-message payload.");
}

async function assertSafeTargetPath(targetRoot) {
  const resolvedTarget = resolve(targetRoot);
  const root = parse(resolvedTarget).root;
  const segments = resolvedTarget.slice(root.length).split(sep).filter(Boolean);
  let currentPath = root;
  for (const segment of segments) {
    currentPath = resolve(currentPath, segment);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) return invalid("unsafe_reparse_point", `Existing path ${currentPath} is a symlink or reparse point.`);
      await realpath(currentPath);
    } catch (error) {
      if (isNotFoundError(error)) return { ok: true };
      return invalid("filesystem_stat_failed", error instanceof Error ? error.message : "Unable to inspect target path.");
    }
  }
  return { ok: true };
}

async function assertSafeExistingParents(targetRoot, parentPath) {
  const resolvedRoot = resolve(targetRoot);
  let canonicalRoot;
  try {
    const rootStats = await lstat(resolvedRoot);
    if (rootStats.isSymbolicLink()) return invalid("unsafe_reparse_point", `Target path ${resolvedRoot} is a symlink or reparse point.`);
    canonicalRoot = await realpath(resolvedRoot);
  } catch (error) {
    if (!isNotFoundError(error)) return invalid("filesystem_stat_failed", error instanceof Error ? error.message : "Unable to inspect target path.");
    canonicalRoot = resolvedRoot;
  }

  const relativeParent = resolve(parentPath).slice(resolvedRoot.length).split(sep).filter(Boolean);
  let currentPath = resolvedRoot;
  for (const segment of relativeParent) {
    currentPath = resolve(currentPath, segment);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) return invalid("unsafe_reparse_point", `Existing path ${currentPath} is a symlink or reparse point.`);
      const canonicalCurrent = await realpath(currentPath);
      if (!isPathInside(canonicalRoot, canonicalCurrent)) return invalid("path_traversal", `Existing path ${currentPath} escapes targetPath.`);
    } catch (error) {
      if (isNotFoundError(error)) return { ok: true };
      return invalid("filesystem_stat_failed", error instanceof Error ? error.message : "Unable to inspect target path.");
    }
  }
  return { ok: true };
}

function validateWindowsPathSegment(segment) {
  if (/[<>:"|?*\u0000-\u001F]/u.test(segment)) return `segment '${segment}' contains a reserved character`;
  if (/[ .]$/u.test(segment)) return `segment '${segment}' ends with a space or period`;
  const baseName = segment.split(".")[0]?.toUpperCase();
  if (["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"].includes(baseName ?? "")) return `segment '${segment}' is a reserved Windows device name`;
  return undefined;
}

function isPathInside(root, child) {
  const normalizedRoot = resolve(root);
  const normalizedChild = resolve(child);
  return normalizedChild === normalizedRoot || normalizedChild.startsWith(`${normalizedRoot}${sep}`);
}

function isNotFoundError(error) {
  return isObject(error) && error.code === "ENOENT";
}

function invalid(errorCode, message) {
  return { ok: false, errorCode, message };
}

function errorResponse(requestId, errorCode, message) {
  return { requestId, ok: false, errorCode, message };
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cryptoRandomId() {
  return createHash("sha256").update(`${process.pid}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 16);
}

async function main() {
  try {
    process.stdout.write(encodeNativeMessage(await handleRequest(await readOneNativeMessage())));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.stdout.write(encodeNativeMessage(errorResponse("unknown", "native_host_failure", error instanceof Error ? error.message : "Native host failure.")));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
