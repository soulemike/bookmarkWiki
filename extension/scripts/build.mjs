import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
execFileSync("tsc", ["-p", "tsconfig.json"], { stdio: "inherit" });
await cp("public/manifest.json", "dist/manifest.json");
for (const page of ["sidepanel", "options"]) {
  const html = await readFile(`src/ui/${page}/index.html`, "utf8");
  await writeFile(`dist/${page}.html`, html.replace("./main.ts", `./src/ui/${page}/main.js`));
  await cp(`src/ui/${page}/style.css`, `dist/src/ui/${page}/style.css`);
}
