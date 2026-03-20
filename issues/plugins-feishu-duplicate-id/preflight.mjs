import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function readOpenClawConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function resolveOpenClawRootFromPath(filePath) {
  try {
    const real = fs.realpathSync(filePath);
    const stat = fs.statSync(real);
    if (!stat.isFile()) return null;

    const base = path.basename(real);
    if (base === "openclaw.mjs") {
      return path.dirname(real);
    }

    if (base === "openclaw") {
      return path.resolve(path.dirname(real), "..", "lib", "node_modules", "openclaw");
    }
  } catch {
    return null;
  }

  return null;
}

function resolveBundledOpenClawRoot(context = {}) {
  // 这里必须优先相信 runner 已经解析好的 `context.openclawRoot`。
  //
  // 原来的实现直接读 `process.env` 并回退到本机 PATH / Node 安装目录。
  // 这会导致测试在“本机装了 openclaw”时被偶然救活，但在 GitHub runner
  // 这种干净环境里却找不到 bundled `feishu`，从而出现本地通过、CI 失败。
  //
  // 因此，这里把优先级明确为：
  // 1. 调用方传入的 `context.openclawRoot`
  // 2. 当前进程环境中的显式覆盖
  // 3. 仅作为最后兜底的自动探测
  const contextRoot = context.openclawRoot;
  if (contextRoot && pathExists(path.join(contextRoot, "extensions", "feishu", "index.ts"))) {
    return contextRoot;
  }

  const override = context.env?.OPENCLAW_GUARDIAN_OPENCLAW_ROOT || process.env.OPENCLAW_GUARDIAN_OPENCLAW_ROOT;
  if (override && pathExists(path.join(override, "extensions", "feishu", "index.ts"))) {
    return override;
  }

  const fromArgv = resolveOpenClawRootFromPath(process.argv[1] || "");
  if (fromArgv) return fromArgv;

  const fromPath = spawnSync("bash", ["-lc", "type -P openclaw"], {
    encoding: "utf8",
  });
  if (fromPath.status === 0) {
    const candidate = resolveOpenClawRootFromPath(fromPath.stdout.trim());
    if (candidate) return candidate;
  }

  try {
    const versionRoot = path.resolve(process.execPath, "..", "..");
    const candidate = path.join(versionRoot, "lib", "node_modules", "openclaw");
    if (pathExists(path.join(candidate, "openclaw.mjs"))) {
      return candidate;
    }
  } catch {
    // 继续返回 null。
  }

  return null;
}

export function inspectState(context) {
  const openclawHome = context.openclawHome || path.join(os.homedir(), ".openclaw");
  const configPath = path.join(openclawHome, "openclaw.json");
  const externalFeishuDir = path.join(openclawHome, "extensions", "feishu");
  const backupRoot = path.join(openclawHome, ".extensions-backup");
  const config = readOpenClawConfig(configPath);
  const plugins = config.plugins && typeof config.plugins === "object" ? config.plugins : {};
  const bundledOpenClawRoot = resolveBundledOpenClawRoot(context);
  const bundledFeishuIndex = bundledOpenClawRoot
    ? path.join(bundledOpenClawRoot, "extensions", "feishu", "index.ts")
    : null;

  return {
    openclawHome,
    configPath,
    backupRoot,
    externalFeishuDir,
    externalFeishuExists: pathExists(externalFeishuDir),
    bundledOpenClawRoot,
    bundledFeishuExists: bundledFeishuIndex ? pathExists(bundledFeishuIndex) : false,
    bundledFeishuIndex,
    allowConfigured: Array.isArray(plugins.allow) && plugins.allow.length > 0,
    installsFeishu:
      !!plugins.installs &&
      typeof plugins.installs === "object" &&
      Object.prototype.hasOwnProperty.call(plugins.installs, "feishu"),
  };
}

function buildFindings(state, t) {
  if (!state.bundledFeishuExists) {
    return [];
  }

  if (!state.externalFeishuExists && !state.installsFeishu) {
    return [];
  }

  const details = [];
  if (state.externalFeishuExists) {
    details.push(t("preflight.detail.externalDir", { path: state.externalFeishuDir }));
  }
  if (state.installsFeishu) {
    details.push(t("preflight.detail.installRef"));
  }
  if (!state.allowConfigured) {
    details.push(t("preflight.detail.allowMissing"));
  }

  return [
    {
      code: "plugins.feishu_duplicate_id",
      severity: "warning",
      summary: t("preflight.summary"),
      detail: details.join(" "),
      suggestions: [
        t("suggestion.doctor"),
        t("suggestion.repair"),
      ],
    },
  ];
}

export async function runPreflight(context) {
  const state = inspectState(context);

  context.log("preflight_state", {
    externalFeishuExists: state.externalFeishuExists,
    installsFeishu: state.installsFeishu,
    allowConfigured: state.allowConfigured,
    bundledFeishuExists: state.bundledFeishuExists,
  });

  return buildFindings(state, context.t);
}
