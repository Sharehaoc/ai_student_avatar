import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";


export function findLocalEnvFile(startDirectory: string): string | undefined {
  let directory = resolve(startDirectory);
  for (let level = 0; level <= 5; level += 1) {
    const candidate = join(directory, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return undefined;
}

export function loadLocalEnvFile(startDirectory = process.cwd()): string | undefined {
  const path = findLocalEnvFile(startDirectory);
  if (path) process.loadEnvFile(path);
  return path;
}
