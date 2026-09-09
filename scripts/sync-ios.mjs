import { existsSync } from "node:fs";
import { rm, symlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeDir = path.join(root, "ios", "App");
const namedProject = path.join(nativeDir, "KidLoop.xcodeproj");
const compatibilityProject = path.join(nativeDir, "App.xcodeproj");

if (!existsSync(namedProject)) {
  throw new Error("ios/App/KidLoop.xcodeproj is missing");
}

await rm(compatibilityProject, { recursive: true, force: true });
await symlink("KidLoop.xcodeproj", compatibilityProject, "dir");

try {
  await new Promise((resolve, reject) => {
    const child = spawn("npx", ["cap", "sync", "ios"], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Capacitor sync failed with code ${code}`)));
  });
} finally {
  await rm(compatibilityProject, { recursive: true, force: true });
}

await import("./check-ios-capabilities.mjs");
