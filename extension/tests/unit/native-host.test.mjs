import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeNativeMessages, encodeNativeMessage, handleRequest, validateWritableFile } from "../../../native-host/src/index.mjs";

test("native host writes hashed files under the target path", async () => {
  const targetPath = await mkdtemp(join(tmpdir(), "bookmark-host-"));
  try {
    const content = "# Example\n";
    const response = await handleRequest({
      requestId: "request-1",
      action: "write_kb",
      targetPath,
      files: [{ relativePath: "bookmarks/example.md", content, sha256: sha256(content) }]
    });

    assert.equal(response.ok, true);
    assert.deepEqual(response.writtenFiles, ["bookmarks/example.md"]);
    assert.equal(await readFile(join(targetPath, "bookmarks", "example.md"), "utf8"), content);
  } finally {
    await rm(targetPath, { recursive: true, force: true });
  }
});

test("native host rejects path traversal and reserved Windows filenames", () => {
  const targetPath = join(tmpdir(), "bookmark-host-target");
  const traversal = validateWritableFile(targetPath, { relativePath: "../escape.md", content: "x", sha256: sha256("x") });
  const reserved = validateWritableFile(targetPath, { relativePath: "bookmarks/CON.md", content: "x", sha256: sha256("x") });

  assert.equal(traversal.ok, false);
  assert.equal(traversal.errorCode, "path_traversal");
  assert.equal(reserved.ok, false);
  assert.equal(reserved.errorCode, "windows_path_invalid");
});

test("native host rejects existing symlink parents under the target path", async () => {
  const targetPath = await mkdtemp(join(tmpdir(), "bookmark-host-"));
  const outsidePath = await mkdtemp(join(tmpdir(), "bookmark-host-outside-"));
  try {
    await symlink(outsidePath, join(targetPath, "bookmarks"), "dir");
    const response = await handleRequest({
      requestId: "request-1",
      action: "write_kb",
      targetPath,
      files: [{ relativePath: "bookmarks/example.md", content: "x", sha256: sha256("x") }]
    });

    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "unsafe_reparse_point");
  } finally {
    await rm(targetPath, { recursive: true, force: true });
    await rm(outsidePath, { recursive: true, force: true });
  }
});

test("native host rejects target paths below existing symlink ancestors", async () => {
  const parentPath = await mkdtemp(join(tmpdir(), "bookmark-host-parent-"));
  const outsidePath = await mkdtemp(join(tmpdir(), "bookmark-host-outside-"));
  try {
    await symlink(outsidePath, join(parentPath, "link"), "dir");
    const response = await handleRequest({
      requestId: "request-1",
      action: "write_kb",
      targetPath: join(parentPath, "link", "new-root"),
      files: [{ relativePath: "bookmarks/example.md", content: "x", sha256: sha256("x") }]
    });

    assert.equal(response.ok, false);
    assert.equal(response.errorCode, "unsafe_reparse_point");
  } finally {
    await rm(parentPath, { recursive: true, force: true });
    await rm(outsidePath, { recursive: true, force: true });
  }
});

test("native message codec uses a little-endian length prefix", async () => {
  const encoded = encodeNativeMessage({ requestId: "request-1", action: "status" });

  assert.equal(encoded.readUInt32LE(0), encoded.length - 4);
  assert.deepEqual(await decodeNativeMessages(encoded), [{ requestId: "request-1", action: "status" }]);
});

test("native host responds to one framed message before stdin closes", async () => {
  const child = spawn(process.execPath, ["../../../native-host/src/index.mjs"], { cwd: new URL(".", import.meta.url), stdio: ["pipe", "pipe", "pipe"] });
  const output = [];
  const errors = [];
  child.stdout.on("data", (chunk) => output.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
  child.stdin.write(encodeNativeMessage({ requestId: "request-1", action: "status" }));

  const response = await waitForNativeResponse(output);
  child.kill();

  assert.equal(response.requestId, "request-1");
  assert.equal(response.ok, true);
  assert.equal(Buffer.concat(errors).toString("utf8"), "");
});

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function waitForNativeResponse(chunks) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 2000) {
    const buffer = Buffer.concat(chunks);
    if (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (buffer.length >= length + 4) return JSON.parse(buffer.subarray(4, length + 4).toString("utf8"));
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for native host response.");
}
