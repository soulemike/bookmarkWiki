import { mkdir, readdir, stat } from "node:fs/promises";
import { once } from "node:events";
import { spawn } from "node:child_process";

const sourceDirectory = "dist";
const packageDirectory = "package";
const archivePath = `${packageDirectory}/bookmark-queue-agent-extension.zip`;
const pythonZipScript = String.raw`
import pathlib
import sys
import zipfile

output_path = pathlib.Path(sys.argv[1])
root_directory = pathlib.Path(sys.argv[2])
paths = [pathlib.Path(line.strip()) for line in sys.stdin if line.strip()]

with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for path in paths:
        archive.write(path, path.relative_to(root_directory).as_posix())
`;

await mkdir(packageDirectory, { recursive: true });

const files = await listFiles(sourceDirectory);
if (files.length === 0) throw new Error("Cannot package extension: dist contains no files");

await createZipWithPython(archivePath, sourceDirectory, files);

const archiveStat = await stat(archivePath);
if (!archiveStat.isFile() || archiveStat.size === 0) throw new Error(`Created archive is empty: ${archivePath}`);

console.log(`Packaged ${files.length} files into ${archivePath} (${archiveStat.size} bytes)`);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return listFiles(path);
    return path;
  }));
  return files.flat().sort();
}

async function createZipWithPython(outputPath, rootDirectory, paths) {
  const child = spawn("python3", ["-c", pythonZipScript, outputPath, rootDirectory], {
    stdio: ["pipe", "inherit", "inherit"]
  });

  for (const path of paths) child.stdin.write(`${path}\n`);
  child.stdin.end();

  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`python3 zip packaging failed with exit code ${code}`);
}
