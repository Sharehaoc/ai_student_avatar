import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";


const LOCAL_NETWORK = "student-ai-avatar-local";

function commandForPlatform(command) {
  return process.platform === "win32" && command === "pnpm" ? "pnpm.cmd" : command;
}

function runCommand(command, args, { quiet = false } = {}) {
  const result = spawnSync(commandForPlatform(command), args, {
    env: process.env,
    stdio: quiet ? "ignore" : "inherit",
  });
  if (result.error) return 1;
  return result.status ?? 1;
}

function requireSupabaseProject(workdir, source) {
  if (!existsSync(join(workdir, "supabase", "config.toml"))) {
    throw new Error(
      `${source} 指向不存在的 Supabase 專案：${workdir}。請修正或刪除 .local/supabase-workdir。`,
    );
  }
  return workdir;
}

export function configuredWorkdir(
  projectRoot = process.cwd(),
  environment = process.env,
) {
  if (environment.SUPABASE_WORKDIR) {
    return requireSupabaseProject(
      resolve(environment.SUPABASE_WORKDIR),
      "SUPABASE_WORKDIR",
    );
  }
  const marker = join(projectRoot, ".local", "supabase-workdir");
  if (existsSync(marker)) {
    const saved = readFileSync(marker, "utf8").trim();
    if (saved) {
      return requireSupabaseProject(resolve(saved), ".local/supabase-workdir");
    }
  }
  return requireSupabaseProject(resolve(projectRoot), "目前專案");
}

function localProjectId(workdir) {
  const config = readFileSync(join(workdir, "supabase", "config.toml"), "utf8");
  const match = /^project_id\s*=\s*"([a-zA-Z0-9_.-]+)"\s*$/m.exec(config);
  if (!match) throw new Error("找不到 supabase/config.toml 的 project_id。");
  return match[1];
}

function requireSuccess(exitCode, message) {
  if (exitCode !== 0) throw new Error(message);
}

function supabaseArguments(args, workdir) {
  return resolve(workdir) !== resolve(process.cwd())
    ? ["--workdir", workdir, ...args]
    : args;
}

export function runLocalEnvironment(action, run = runCommand, workdir = process.cwd()) {
  if (action === "start") {
    requireSuccess(
      run("docker", ["info"], { quiet: true }),
      "Docker Desktop 尚未啟動，請開啟後再重試。",
    );
    const networkExists = run(
      "docker",
      ["network", "inspect", LOCAL_NETWORK],
      { quiet: true },
    ) === 0;
    if (!networkExists) {
      requireSuccess(
        run("docker", [
          "network",
          "create",
          "-o",
          "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
          LOCAL_NETWORK,
        ], { quiet: true }),
        "無法建立本機 Docker 安全網路。",
      );
    }
    requireSuccess(
      run("pnpm", ["exec", "supabase", ...supabaseArguments([
        "start",
        "--network-id",
        LOCAL_NETWORK,
      ], workdir)], { quiet: true }),
      "本機 Supabase 啟動失敗，請查看上方錯誤訊息。",
    );
    return;
  }

  if (action === "status") {
    requireSuccess(
      run("docker", ["info"], { quiet: true }),
      "Docker Desktop 尚未啟動，請開啟後再重試。",
    );
    requireSuccess(
      run("docker", [
        "ps",
        "--filter",
        `label=com.supabase.cli.project=${localProjectId(workdir)}`,
        "--format",
        String.raw`table {{.Names}}\t{{.Status}}\t{{.Ports}}`,
      ]),
      "無法讀取本機 Supabase 容器狀態。",
    );
    return;
  }

  if (action === "stop") {
    requireSuccess(
      run("pnpm", ["exec", "supabase", ...supabaseArguments(["stop"], workdir)]),
      "無法安全停止本機 Supabase。",
    );
    return;
  }

  throw new Error(`不支援的本機環境指令：${action ?? ""}`);
}

function printFailure(error) {
  const message = error instanceof Error ? error.message : "本機環境指令執行失敗。";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const action = process.argv[2];
    runLocalEnvironment(action, runCommand, configuredWorkdir());
    if (action === "start") {
      process.stdout.write(
        "本機 Supabase 已啟動。請執行 pnpm local:status 檢查健康狀態與實際連接埠綁定。\n",
      );
    }
    if (action === "status") {
      process.stdout.write(
        "若 Ports 顯示 0.0.0.0 或 [::]，Docker Desktop 可能讓同一網路裝置連入；請勿在不受信任的網路使用。\n",
      );
    }
  } catch (error) {
    printFailure(error);
  }
}
