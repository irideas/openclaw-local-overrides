// `openclaw models auth login --provider openai-codex` 的 OAuth 登录流程中，
// 浏览器授权成功后，还会在 CLI 进程里执行一次 `code -> token` 交换。
//
// 这一步最终会走到 `openclaw` 依赖里的裸 `fetch(TOKEN_URL, ...)`。
// 如果当前进程没有提前安装基于环境变量的代理 dispatcher，
// 那么即使外层 shell 已经设置了 `HTTP_PROXY` / `HTTPS_PROXY`，
// 这条 `fetch(...)` 也可能没有按预期走代理出口，进而触发：
// `403 unsupported_country_region_territory`
//
// 这个 preload 文件的职责就是：
// 在 `openclaw` 主程序真正开始执行前，尽早把 Node 全局 `fetch`
// 对应的 dispatcher 切换成 `EnvHttpProxyAgent`。
//
// 这样后续业务代码里即使仍然写的是裸 `fetch(...)`，
// 也会继承当前 shell 中的 `HTTP_PROXY` / `HTTPS_PROXY` 设置。
//
// 这个文件属于正式交付逻辑，因此不放在 `.debug/` 下，而是放到：
// `<OPENCLAW_HOME>/local-overrides/openai-codex-auth-proxy/`

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// 根据当前文件位置反推出 `OPENCLAW_HOME`。
// 当前文件应位于：
// `<OPENCLAW_HOME>/local-overrides/openai-codex-auth-proxy/env-proxy-preload.mjs`
//
// 这样做的目的，是避免在代码里写死任何机器相关的绝对路径。
const CURRENT_FILE = fileURLToPath(import.meta.url);
const CURRENT_DIR = path.dirname(CURRENT_FILE);
const OPENCLAW_HOME = path.resolve(CURRENT_DIR, "..", "..");

// 默认日志写到正式日志目录，而不是调试目录。
// 这里同样基于 `OPENCLAW_HOME` 动态推导，避免泄露本地用户名或目录结构。
const DEFAULT_LOG = path.join(
  OPENCLAW_HOME,
  "logs",
  "local-overrides",
  "openai-codex-auth-proxy.log",
);

function log(event, data = {}) {
  const logPath = process.env.OPENCLAW_PROXY_PRELOAD_LOG_PATH || DEFAULT_LOG;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    source: "env-proxy-preload",
    event,
    ...data,
  });
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${line}\n`, "utf8");
  } catch {
    // 日志写入失败不应阻断主流程。
  }
}

function normalize(value) {
  // 把空值、空白串统一归一成 `null`，便于后续判断。
  const text = String(value || "").trim();
  return text || null;
}

function commandLooksLikeCodexLogin(argv) {
  // preload 会先于主程序执行，因此此时已经可以读取 `process.argv`。
  // 这里故意只匹配非常具体的目标命令，避免误伤其他 `openclaw` 用法。
  const args = argv.slice(2);
  const joined = args.join(" ");
  if (!joined.includes("models") || !joined.includes("auth") || !joined.includes("login")) {
    return false;
  }
  const providerFlagIndex = args.findIndex((value) => value === "--provider");
  if (providerFlagIndex !== -1) {
    return args[providerFlagIndex + 1] === "openai-codex";
  }
  return args.some((value) => value === "--provider=openai-codex");
}

function resolveEffectiveProxy() {
  // 这里只读取最常见、也和本问题直接相关的 HTTP(S) 代理环境变量。
  // `ALL_PROXY` 不在这次正式方案里使用，以避免与既有 shell 残留配置混淆。
  return (
    normalize(process.env.https_proxy) ||
    normalize(process.env.HTTPS_PROXY) ||
    normalize(process.env.http_proxy) ||
    normalize(process.env.HTTP_PROXY)
  );
}

function resolveOpenClawRoot() {
  // 这里优先尝试定位“当前正在执行的 openclaw 安装目录”，
  // 再从那个目录中 import 它自带的 `undici`。
  //
  // 这样做有两个好处：
  // 1. 避免误用系统上其他版本的 `undici`
  // 2. 避免未来 Node / npm / nvm 多版本并存时发生依赖错配

  // 调试时允许通过环境变量显式覆盖。
  const override = normalize(process.env.OPENCLAW_PROXY_PRELOAD_OPENCLAW_ROOT);
  if (override) return override;

  // 常见情况下，`process.argv[1]` 会是 `openclaw` shim 或 `openclaw.mjs`。
  const arg1 = process.argv[1];
  if (arg1) {
    try {
      const real = fs.realpathSync(arg1);
      const stat = fs.statSync(real);
      if (stat.isFile()) {
        const base = path.basename(real);
        if (base === "openclaw.mjs") return path.dirname(real);
        if (base === "openclaw") {
          return path.resolve(path.dirname(real), "..", "lib", "node_modules", "openclaw");
        }
      }
    } catch {
      // 如果这一层推导失败，再走兜底逻辑。
    }
  }

  try {
    // 常见的全局安装场景下，`process.execPath` 会指向：
    // `<node-prefix>/bin/node`
    // 因此可以往上回退两层，再拼出全局包目录。
    const versionRoot = path.resolve(process.execPath, "..", "..");
    const candidate = path.join(versionRoot, "lib", "node_modules", "openclaw");
    if (fs.existsSync(path.join(candidate, "openclaw.mjs"))) return candidate;
  } catch {
    // 兜底路径也失败时，外层会记录日志并跳过激活。
  }

  return null;
}

async function main() {
  // `OPENCLAW_PROXY_PRELOAD_FORCE=1` 只用于调试，
  // 允许在非目标命令上也强制激活，便于单独验证 preload 生效情况。
  const force = process.env.OPENCLAW_PROXY_PRELOAD_FORCE === "1";
  const shouldActivate = force || commandLooksLikeCodexLogin(process.argv);
  const effectiveProxy = resolveEffectiveProxy();

  log("preload_loaded", {
    argv: process.argv,
    shouldActivate,
    force,
    effectiveProxy,
  });

  if (!shouldActivate) {
    // 非目标命令直接跳过，保证其他 `openclaw` 行为不受影响。
    log("preload_skipped", { reason: "command_not_targeted" });
    return;
  }

  if (!effectiveProxy) {
    // 如果当前 shell 没有提供 HTTP(S) 代理，也不做任何全局网络改动。
    log("preload_skipped", { reason: "no_proxy_env" });
    return;
  }

  const openclawRoot = resolveOpenClawRoot();
  if (!openclawRoot) {
    // 找不到当前 `openclaw` 根目录时，宁可放弃，也不盲目加载外部模块。
    log("preload_skipped", { reason: "openclaw_root_not_found" });
    return;
  }

  const undiciPath = path.join(openclawRoot, "node_modules", "undici", "index.js");

  try {
    // 使用当前 `openclaw` 安装目录里的 `undici`，保证 API 版本一致。
    const undici = await import(pathToFileURL(undiciPath).href);

    // 关键动作：
    // 1. 创建一个会自动读取 `HTTP_PROXY` / `HTTPS_PROXY` 的 dispatcher
    // 2. 安装为当前进程的全局 dispatcher
    //
    // 完成后，后续裸 `fetch(...)` 也会按环境变量走代理。
    const agent = new undici.EnvHttpProxyAgent();
    undici.setGlobalDispatcher(agent);

    log("preload_activated", {
      openclawRoot,
      undiciPath,
      effectiveProxy,
      dispatcher: agent.constructor?.name || "unknown",
    });

    // 仅在显式开启时打印到终端，避免污染普通命令输出。
    if (process.env.OPENCLAW_PROXY_PRELOAD_STDERR === "1") {
      console.error(`[openclaw-preload] EnvHttpProxyAgent enabled for ${effectiveProxy}`);
    }
  } catch (error) {
    // preload 失败时只记录，不在这里直接中断主程序。
    // 这样可以把副作用控制到最小：最差情况只是修复未生效，而不是把命令彻底打死。
    log("preload_failed", {
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
  }
}

// 顶层 await 用于确保在主程序继续执行前，dispatcher 已经准备好。
await main();
