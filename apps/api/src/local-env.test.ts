import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { findLocalEnvFile, loadLocalEnvFile } from "./local-env.js";


const cleanupDirectories: string[] = [];

afterEach(() => {
  for (const directory of cleanupDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  delete process.env.CODEX_LOCAL_ENV_PROBE;
});

describe("local env loader", () => {
  it("finds the assembled root .env from the API package directory", () => {
    const root = mkdtempSync(join(tmpdir(), "flying-eagle-env-"));
    cleanupDirectories.push(root);
    const apiDirectory = join(root, "apps", "api");
    mkdirSync(apiDirectory, { recursive: true });
    const envPath = join(root, ".env");
    writeFileSync(envPath, "CODEX_LOCAL_ENV_PROBE=loaded\n");

    expect(findLocalEnvFile(apiDirectory)).toBe(envPath);
    expect(loadLocalEnvFile(apiDirectory)).toBe(envPath);
    expect(process.env.CODEX_LOCAL_ENV_PROBE).toBe("loaded");
  });

  it("does not overwrite deployment environment variables", () => {
    const root = mkdtempSync(join(tmpdir(), "flying-eagle-env-"));
    cleanupDirectories.push(root);
    writeFileSync(join(root, ".env"), "CODEX_LOCAL_ENV_PROBE=local-file\n");
    process.env.CODEX_LOCAL_ENV_PROBE = "deployment-secret";

    loadLocalEnvFile(root);

    expect(process.env.CODEX_LOCAL_ENV_PROBE).toBe("deployment-secret");
  });
});
