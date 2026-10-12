import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const chromiumEntry = fileURLToPath(import.meta.resolve("@sparticuz/chromium"));
const binDir = join(dirname(dirname(dirname(chromiumEntry))), "bin");
const publicDir = join(projectRoot, "public");
const archive = join(publicDir, "chromium-pack.tar");

if (!existsSync(binDir)) throw new Error(`Chromium files missing: ${binDir}`);
mkdirSync(publicDir, { recursive: true });
const result = spawnSync("tar", ["-cf", archive, "-C", binDir, "."], { stdio: "inherit" });
if (result.status !== 0) throw new Error("Could not package Chromium for PDF export");
console.log(`Chromium archive ready: ${archive}`);
