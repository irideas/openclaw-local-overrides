import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// 这一层把“issue 发现 / 校验 / 激活求值”的公共能力集中在一起。
//
// 重构后的中心模型已经从 `modules` 切换为 `issues`，所以这里不再把：
// - mitigation
// - preflight
// - repair
// 看成顶层对象，而是把它们视为 issue 的不同能力面。

const CURRENT_FILE = fileURLToPath(import.meta.url);
const CORE_DIR = path.dirname(CURRENT_FILE);
const DEFAULT_REPO_ROOT = path.resolve(CORE_DIR, "..");
const DEFAULT_BRIDGE_ROOT = path.join(DEFAULT_REPO_ROOT, "bridge");
const DEFAULT_OPENCLAW_HOME = path.join(os.homedir(), ".openclaw");

export function normalize(value) {
  const text = String(value || "").trim();
  return text || null;
}

export function normalizeIssueAlias(issue) {
  return normalize(issue?.alias);
}

export function parseVersion(version) {
  const text = normalize(version);
  if (!text || !/^\d+(?:\.\d+)*$/.test(text)) {
    return null;
  }

  return text.split(".").map((part) => Number(part));
}

export function compareVersions(left, right) {
  const a = Array.isArray(left) ? left : parseVersion(left);
  const b = Array.isArray(right) ? right : parseVersion(right);
  if (!a || !b) {
    return null;
  }

  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }

  return 0;
}

function matchVersionComparator(version, comparator) {
  const match = String(comparator).trim().match(/^(>=|<=|>|<|=)?\s*(\d+(?:\.\d+)*)$/);
  if (!match) {
    return false;
  }

  const operator = match[1] || "=";
  const target = match[2];
  const compared = compareVersions(version, target);
  if (compared === null) {
    return false;
  }

  if (operator === "=") return compared === 0;
  if (operator === ">") return compared > 0;
  if (operator === ">=") return compared >= 0;
  if (operator === "<") return compared < 0;
  if (operator === "<=") return compared <= 0;
  return false;
}

export function matchesVersionRange(version, versionRange) {
  const parsedVersion = parseVersion(version);
  const rangeText = normalize(versionRange);
  if (!rangeText) {
    return true;
  }

  if (!parsedVersion) {
    return false;
  }

  const comparators = rangeText.split(/\s+/).filter(Boolean);
  if (comparators.length === 0) {
    return true;
  }

  return comparators.every((comparator) => matchVersionComparator(parsedVersion, comparator));
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveDefaultOpenClawRootFromNode() {
  try {
    const versionRoot = path.resolve(process.execPath, "..", "..");
    const candidate = path.join(versionRoot, "lib", "node_modules", "openclaw");
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  } catch {
    // 继续尝试其他方式。
  }

  return null;
}

function resolveOpenClawVersionFromRoot(openclawRoot) {
  const root = normalize(openclawRoot);
  if (!root) return null;

  try {
    const packageJsonPath = path.join(root, "package.json");
    const packageJson = readJson(packageJsonPath);
    return normalize(packageJson.version);
  } catch {
    return null;
  }
}

function resolveOpenClawVersionFromBinary(env = process.env) {
  try {
    const result = spawnSync("openclaw", ["--version"], {
      encoding: "utf8",
      env: {
        ...env,
        OPENCLAW_GUARDIAN_DISABLE: "1",
      },
    });

    if (result.status !== 0) {
      return null;
    }

    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    const match = output.match(/OpenClaw\s+(\d+(?:\.\d+)*)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function resolveEnvValue(env, ...names) {
  for (const name of names) {
    const value = normalize(env[name]);
    if (value) return value;
  }
  return null;
}

export function resolveGuardianPaths(env = process.env) {
  const repoRoot = resolveEnvValue(env, "OPENCLAW_GUARDIAN_REPO_ROOT") || DEFAULT_REPO_ROOT;
  const bridgeRoot = resolveEnvValue(env, "OPENCLAW_GUARDIAN_BRIDGE_ROOT") || DEFAULT_BRIDGE_ROOT;
  const openclawHome = resolveEnvValue(env, "OPENCLAW_GUARDIAN_HOME") || DEFAULT_OPENCLAW_HOME;
  const openclawRoot =
    resolveEnvValue(env, "OPENCLAW_GUARDIAN_OPENCLAW_ROOT") || resolveDefaultOpenClawRootFromNode();
  const openclawVersion =
    resolveEnvValue(env, "OPENCLAW_GUARDIAN_OPENCLAW_VERSION") ||
    resolveOpenClawVersionFromRoot(openclawRoot) ||
    resolveOpenClawVersionFromBinary(env);
  const logDir =
    resolveEnvValue(env, "OPENCLAW_GUARDIAN_LOG_DIR") ||
    path.join(openclawHome, "logs", "guardian");
  const issueConfigPath =
    resolveEnvValue(env, "OPENCLAW_GUARDIAN_ISSUE_CONFIG_PATH") ||
    path.join(bridgeRoot, "config", "enabled-issues.json");

  return {
    repoRoot,
    bridgeRoot,
    issuesRoot: path.join(repoRoot, "issues"),
    openclawHome,
    openclawRoot,
    openclawVersion,
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

export function matchesIssueSelector(selector, issueId, issue) {
  const normalizedSelector = normalize(selector);
  if (!normalizedSelector) return false;
  if (normalizedSelector === issueId) return true;
  return normalizedSelector === normalizeIssueAlias(issue);
}

export function resolveIssueBySelector(discoveredIssues, selector) {
  return discoveredIssues.find(({ issueId, issue }) => matchesIssueSelector(selector, issueId, issue)) || null;
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
  const commands = Array.isArray(triggers.commands) ? triggers.commands : [];
  const provider = normalize(triggers.provider);

  if (commands.length > 0) {
    const commandMatched = commands.some((commandTokens) => {
      if (!Array.isArray(commandTokens) || commandTokens.length === 0) {
        return false;
      }

      return commandTokens.every((token, index) => args[index] === token);
    });

    if (!commandMatched) return false;
  }

  if (argvAll.length > 0) {
    const hasAllArgs = argvAll.every((value) => args.includes(value));
    if (!hasAllArgs) return false;
  }

  if (provider && extractProvider(args) !== provider) {
    return false;
  }

  return true;
}

export function parseForcedIssues(env = process.env) {
  const raw = resolveEnvValue(env, "OPENCLAW_GUARDIAN_FORCE_ISSUES");
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

  if (
    issue.alias !== undefined &&
    (!normalize(issue.alias) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(issue.alias))
  ) {
    return { ok: false, reason: "issue_alias_invalid" };
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

  if (issue.capabilities.mitigation === true && !normalize(issue.entry?.mitigation)) {
    return { ok: false, reason: "issue_mitigation_entry_missing" };
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

  if (
    issue.env?.prefix !== undefined &&
    normalize(issue.env.prefix) === null
  ) {
    return { ok: false, reason: "issue_env_prefix_invalid" };
  }

  if (
    issue.triggers?.commands !== undefined &&
    (!Array.isArray(issue.triggers.commands) ||
      issue.triggers.commands.some(
        (commandTokens) =>
          !Array.isArray(commandTokens) ||
          commandTokens.length === 0 ||
          commandTokens.some((token) => normalize(token) === null),
      ))
  ) {
    return { ok: false, reason: "issue_triggers_commands_invalid" };
  }

  if (
    issue.appliesTo !== undefined &&
    (typeof issue.appliesTo !== "object" || Array.isArray(issue.appliesTo))
  ) {
    return { ok: false, reason: "issue_applies_to_invalid" };
  }

  if (
    issue.appliesTo?.openclaw !== undefined &&
    (typeof issue.appliesTo.openclaw !== "object" || Array.isArray(issue.appliesTo.openclaw))
  ) {
    return { ok: false, reason: "issue_applies_to_openclaw_invalid" };
  }

  if (
    issue.appliesTo?.openclaw?.versionRange !== undefined &&
    normalize(issue.appliesTo.openclaw.versionRange) === null
  ) {
    return { ok: false, reason: "issue_version_range_invalid" };
  }

  if (
    issue.appliesTo?.openclaw?.whenUnknown !== undefined &&
    !["active", "inactive"].includes(issue.appliesTo.openclaw.whenUnknown)
  ) {
    return { ok: false, reason: "issue_when_unknown_invalid" };
  }

  return { ok: true, reason: null };
}

export function resolveEnabledIssues(configPath) {
  const config = readJson(configPath);
  return Array.isArray(config.enabledIssues) ? config.enabledIssues : [];
}

export function resolveDisabledIssues(configPath) {
  const config = readJson(configPath);
  return Array.isArray(config.disabledIssues) ? config.disabledIssues : [];
}

export function isEnabledByDefault(issue) {
  return issue?.enabledByDefault === true;
}

export function evaluateIssueApplicability(issue, openclawVersion) {
  const versionRange = normalize(issue?.appliesTo?.openclaw?.versionRange);
  const whenUnknown = issue?.appliesTo?.openclaw?.whenUnknown || "inactive";
  const currentVersion = normalize(openclawVersion);

  if (!versionRange) {
    return {
      active: true,
      reason: "no_version_gate",
      openclawVersion: currentVersion,
      versionRange: null,
    };
  }

  if (!currentVersion) {
    return {
      active: whenUnknown === "active",
      reason: "openclaw_version_unknown",
      openclawVersion: null,
      versionRange,
    };
  }

  return {
    active: matchesVersionRange(currentVersion, versionRange),
    reason: "version_range_evaluated",
    openclawVersion: currentVersion,
    versionRange,
  };
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

export function resolveIssueContext(issueId, env = process.env) {
  const paths = resolveGuardianPaths(env);
  const { issuePath, issue } = readIssue(paths.issuesRoot, issueId);
  return {
    ...paths,
    issueId,
    issuePath,
    issueDir: path.dirname(issuePath),
    issue,
  };
}
