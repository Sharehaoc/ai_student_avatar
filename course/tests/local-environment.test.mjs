import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  configuredWorkdir,
  runLocalEnvironment,
} from "../tools/local-environment.mjs";


function recordingRunner(exitCodes = new Map()) {
  const calls = [];
  const options = [];
  return {
    calls,
    options,
    run(command, args, runOptions = {}) {
      const key = [command, ...args].join(" ");
      calls.push(key);
      options.push(runOptions);
      return exitCodes.get(key) ?? 0;
    },
  };
}

test("start 會依官方建議請求 localhost Docker 網路，再啟動 Supabase", () => {
  const runner = recordingRunner(new Map([
    ["docker network inspect student-ai-avatar-local", 1],
  ]));

  runLocalEnvironment("start", runner.run);

  assert.deepEqual(runner.calls, [
    "docker info",
    "docker network inspect student-ai-avatar-local",
    "docker network create -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 student-ai-avatar-local",
    "pnpm exec supabase start --network-id student-ai-avatar-local",
  ]);
  assert.deepEqual(runner.options.at(-1), { quiet: true });
});

test("start 會沿用已存在的 localhost Docker 網路", () => {
  const runner = recordingRunner();

  runLocalEnvironment("start", runner.run);

  assert.deepEqual(runner.calls, [
    "docker info",
    "docker network inspect student-ai-avatar-local",
    "pnpm exec supabase start --network-id student-ai-avatar-local",
  ]);
});

test("Docker 沒有啟動時會停止，不會繼續啟動 Supabase", () => {
  const runner = recordingRunner(new Map([["docker info", 1]]));

  assert.throws(
    () => runLocalEnvironment("start", runner.run),
    /Docker Desktop 尚未啟動/,
  );
  assert.deepEqual(runner.calls, ["docker info"]);
});

test("status 只顯示容器健康與實際 Ports，不印出本機金鑰", () => {
  const statusRunner = recordingRunner();

  runLocalEnvironment("status", statusRunner.run);

  assert.deepEqual(statusRunner.calls, [
    "docker info",
    "docker ps --filter label=com.supabase.cli.project=student-ai-avatar-course --format table {{.Names}}\\t{{.Status}}\\t{{.Ports}}",
  ]);
});

test("stop 透過專案內 Supabase CLI 安全停止且保留資料", () => {
  const runner = recordingRunner();

  runLocalEnvironment("stop", runner.run);

  assert.deepEqual(runner.calls, ["pnpm exec supabase stop"]);
});

test("既有本機專案可用 workdir 原地管理，不會另開空白資料庫", () => {
  const runner = recordingRunner();

  runLocalEnvironment("stop", runner.run, "/tmp/existing-student-project");

  assert.deepEqual(runner.calls, [
    "pnpm exec supabase --workdir /tmp/existing-student-project stop",
  ]);
});

test("workdir marker 指向遺失的暫存目錄時明確停止，不會誤開空白資料庫", () => {
  const root = mkdtempSync(join(tmpdir(), "student-ai-avatar-workdir-"));
  try {
    mkdirSync(join(root, ".local"));
    writeFileSync(
      join(root, ".local", "supabase-workdir"),
      "/tmp/already-removed-student-ai-avatar\n",
    );

    assert.throws(
      () => configuredWorkdir(root, {}),
      /指向不存在的 Supabase 專案/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workdir marker 可指向專案內持久化 runtime", () => {
  const root = mkdtempSync(join(tmpdir(), "student-ai-avatar-workdir-"));
  try {
    const runtime = join(root, ".local", "supabase-runtime");
    mkdirSync(join(runtime, "supabase"), { recursive: true });
    writeFileSync(join(runtime, "supabase", "config.toml"), 'project_id = "local"\n');
    writeFileSync(join(root, ".local", "supabase-workdir"), `${runtime}\n`);

    assert.equal(configuredWorkdir(root, {}), runtime);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
