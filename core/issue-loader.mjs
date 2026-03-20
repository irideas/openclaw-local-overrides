import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 这一层把“issue 发现 / 校验 / 激活求值”的公共能力集中在一起。
//
// 重构后的中心模型已经从 `modules` 切换为 `issues`，所以这里不再把：
// - runtime
// - preflight
// - repair
// 看成顶层对象，而是把它们视为 issue 的不同能力面。

const CURRENT_FILE = fileURLToPath(import.meta.url);
const CORE_DIR = path.dirname(CURRENT_FILE);
const DEFAULT_REPO_ROOT = path.resolve(CORE_DIR, "..");
const DEFAULT_RUNTIME_ROOT = path.join(DEFAULT_REPO_ROOT, "runtime");

export function normalize(value) {
  const text = String(value || "").trim();
  return text || null;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveEnvValue(env, ...names) {
  for (const name of names) {
    const value = normalize(env[name]);
    if (value) return value;
  }
  return null;
}

export function resolveRuntimePaths(env = process.env) {
  const repoRoot =
    resolveEnvValue(env, "OPENCLAW_GUARDIAN_REPO_ROOT", "OPENCLAW_LOCAL_OVERRIDES_REPO_ROOT") ||
    DEFAULT_REPO_ROOT;
  const runtimeRoot =
    resolveEnvValue(env, "OPENCLAW_GUARDIAN_RUNTIME_ROOT", "OPENCLAW_LOCAL_OVERRIDES_RUNTIME_ROOT") ||
    DEFAULT_RUNTIME_ROOT;
  const openclawHome =
    resolveEnvValue(env, "OPENCLAW_GUARDIAN_HOME", "OPENCLAW_LOCAL_OVERRIDES_HOME") ||
    path.resolve(repoRoot, "..");
  const logDir =
    resolveEnvValue(env, "OPENCLAW_GUARDIAN_LOG_DIR", "OPENCLAW_LOCAL_OVERRIDES_LOG_DIR") ||
    path.join(openclawHome, "logs", "local-overrides");
  const issueConfigPath =
    resolveEnvValue(env, "OPENCLAW_GUARDIAN_ISSUE_CONFIG_PATH", "OPENCLAW_LOCAL_OVERRIDES_CONFIG_PATH") ||
    path.join(runtimeRoot, "config", "enabled-issues.json");

  return {
    repoRoot,
    runtimeRoot,
    issuesRoot: path.join(repoRoot, "issues"),
    openclawHome,
    logDir,
    issueConfigPath,
  };
}

export function listIssueIds(issuesRoot) {
  try {
    return fs.readdirSync(issuesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function readIssue(issuesRoot, issueId) {
  const issuePath = path.join(issuesRoot, issueId, "issue.json");
  return {
    issuePath,
    issue: readJson(issuePath),
  };
}

export function discoverIssues(issuesRoot) {
  const discovered = [];
  for (const issueId of listIssueIds(issuesRoot)) {
    try {
      const { issuePath, issue } = readIssue(issuesRoot, issueId);
      discovered.push({ issueId, issuePath, issue });
    } catch {
      discovered.push({
        issueId,
        issuePath: path.join(issuesRoot, issueId, "issue.json"),
        issue: null,
      });
    }
  }
  return discovered;
}

export function extractProvider(args) {
  const providerFlagIndex = args.findIndex((value) => value === "--provider");
  if (providerFlagIndex !== -1) {
    return args[providerFlagIndex + 1] || null;
  }

  const inline = args.find((value) => value.startsWith("--provider="));
  return inline ? inline.slice("--provider=".length) : null;
}

export function matchesIssue(issue, args) {
  const triggers = issue.triggers || issue.match || {};
  const argvAll = Array.isArray(triggers.argvAll) ? triggers.argvAll : [];
  const provider = normalize(triggers.provider);

  const hasAllArgs = argvAll.every((value) => args.includes(value));
  if (!hasAllArgs) return false;

  if (provider && extractProvider(args) !== provider) {
    return false;
  }

  return true;
}

export function parseForcedIssues(env = process.env) {
  const raw =
    resolveEnvValue(env, "OPENCLAW_GUARDIAN_FORCE_ISSUES", "OPENCLAW_LOCAL_OVERRIDES_FORCE_MODULES");
  if (!raw) return new Set();

  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function validateIssue(issueId, issue) {
  if (!issue || typeof issue !== "object") {
    return { ok: false, reason: "issue_invalid" };
  }

  if (normalize(issue.id) !== issueId) {
    return { ok: false, reason: "issue_id_mismatch" };
  }

  if (!normalize(issue.title)) {
    return { ok: false, reason: "issue_title_missing" };
  }

  if (!normalize(issue.category)) {
    return { ok: false, reason: "issue_category_missing" };
  }

  if (!normalize(issue.severity)) {
    return { ok: false, reason: "issue_severity_missing" };
  }

  if (
    issue.enabledByDefault !== undefined &&
    typeof issue.enabledByDefault !== "boolean"
  ) {
    return { ok: false, reason: "enabled_by_default_invalid" };
  }

  if (!issue.capabilities || typeof issue.capabilities !== "object" || Array.isArray(issue.capabilities)) {
    return { ok: false, reason: "issue_capabilities_invalid" };
  }

  if (issue.capabilities.runtime === true && !normalize(issue.entry?.runtime)) {
    return { ok: false, reason: "issue_runtime_entry_missing" };
  }

  if (issue.capabilities.preflight === true && !normalize(issue.entry?.preflight)) {
    return { ok: false, reason: "issue_preflight_entry_missing" };
  }

  if (issue.capabilities.repair === true && !normalize(issue.entry?.repair)) {
    return { ok: false, reason: "issue_repair_entry_missing" };
  }

  if (
    issue.env !== undefined &&
    (typeof issue.env !== "object" || Array.isArray(issue.env))
  ) {
    return { ok: false, reason: "issue_env_invalid" };
  }

  if (
    issue.env?.variables !== undefined &&
    (!Array.isArray(issue.env.variables) ||
      issue.env.variables.some((value) => normalize(value) === null))
  ) {
    return { ok: false, reason: "issue_env_variables_invalid" };
  }

  return { ok: true, reason: null };
}

export function resolveEnabledIssues(configPath) {
  const config = readJson(configPath);
  return Array.isArray(config.enabledIssues)
    ? config.enabledIssues
    : Array.isArray(config.enabledModules)
      ? config.enabledModules
      : [];
}

export function resolveDisabledIssues(configPath) {
  const config = readJson(configPath);
  return Array.isArray(config.disabledIssues)
    ? config.disabledIssues
    : Array.isArray(config.disabledModules)
      ? config.disabledModules
      : [];
}

export function isEnabledByDefault(issue) {
  return issue?.enabledByDefault === true;
}

export function resolveActiveIssueIds(issuesRoot, issueConfigPath) {
  const discovered = discoverIssues(issuesRoot);
  const defaults = discovered
    .filter(({ issue }) => issue && isEnabledByDefault(issue))
    .map(({ issueId }) => issueId);

  let enabledIssues = [];
  let disabledIssues = [];

  try {
    enabledIssues = resolveEnabledIssues(issueConfigPath);
    disabledIssues = resolveDisabledIssues(issueConfigPath);
  } catch {
    enabledIssues = [];
    disabledIssues = [];
  }

  const active = new Set([...defaults, ...enabledIssues]);
  for (const issueId of disabledIssues) {
    active.delete(issueId);
  }

  return Array.from(active).sort();
}

export function resolveIssueLogPath(logDir, issue, issueId) {
  const logFileName = normalize(issue.logging?.file) || `${issueId}.log`;
  return path.join(logDir, logFileName);
}
