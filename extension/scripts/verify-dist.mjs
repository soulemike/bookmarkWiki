import { readdir, stat } from "node:fs/promises";

const requiredFiles = [
  "dist/manifest.json",
  "dist/sidepanel.html",
  "dist/options.html",
  "dist/src/background/service-worker.js",
  "dist/src/background/bookmark-manager.js",
  "dist/src/background/queue-processor.js",
  "dist/src/background/classifier.js",
  "dist/src/ui/sidepanel/main.js",
  "dist/src/ui/sidepanel/style.css",
  "dist/src/ui/options/main.js",
  "dist/src/ui/options/style.css"
];

const missing = [];

for (const file of requiredFiles) {
  try {
    const fileStat = await stat(file);
    if (!fileStat.isFile() || fileStat.size === 0) missing.push(file);
  } catch {
    missing.push(file);
  }
}

if (missing.length > 0) {
  throw new Error(`extension/dist is missing required artifact files:\n${missing.map((file) => `- ${file}`).join("\n")}`);
}

const files = await listFiles("dist");
if (files.length === 0) throw new Error("extension/dist contains no files");

console.log(`Verified extension/dist artifact with ${files.length} files:`);
for (const file of files) console.log(`- ${file}`);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return listFiles(path);
    return path;
  }));
  return files.flat().sort();
}
