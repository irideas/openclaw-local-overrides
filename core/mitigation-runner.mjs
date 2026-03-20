import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJsonlLogger } from "./logger.mjs";
import { resolveLocale } from "./locale.mjs";
import { loadIssueMessages, renderMessage } from "./i18n-renderer.mjs";
import {
  discoverIssues,
  evaluateIssueApplicability,
  matchesIssue,
  matchesIssueSelector,
  parseForcedIssues,
  resolveActiveIssueIds,
  resolveGuardianPaths,
  resolveIssueLogPath,
  validateIssue,
} from "./issue-loader.mjs";

// 这是 `guardian` 的统一 mitigation runner。
//
// 它当前只负责 issue 的 `mitigation` 能力面：
// - 发现 issue
// - 解析启停配置
// - 依据当前命令进行 issue 匹配
// - 加载 issue 的 `mitigation.mjs`
//
// `preflight` 与 `repair` 在这个阶段先只搭骨架，不混进现有可用链路。

const PATHS = resolveGuardianPaths();
const REPO_ROOT = PATHS.repoRoot;
const BRIDGE_ROOT = PATHS.bridgeRoot;
const ISSUES_ROOT = PATHS.issuesRoot;
const OPENCLAW_HOME = PATHS.openclawHome;
const LOG_DIR = PATHS.logDir;
const ISSUE_CONFIG_PATH = PATHS.issueConfigPath;
const GUARDIAN_LOG_PATH = path.join(LOG_DIR, "guardian.log");
const LOCALE = resolveLocale();

const mitigationLog = createJsonlLogger(GUARDIAN_LOG_PATH, "guardian.mitigation", {
  locale: LOCALE,
});

function isGuardianDisabled(env = process.env) {
  return env.OPENCLAW_GUARDIAN_DISABLE === "1";
}

async function activateMitigationIssue(issueId, issue, issueDir) {
  const validation = validateIssue(issueId, issue);
  if (!validation.ok) {
    mitigationLog("issue_skipped", {
      issueId,
      reason: validation.reason,
    });
    return;
  }

  if (issue.capabilities.mitigation !== true) {
    mitigationLog("issue_skipped", {
      issueId,
      reason: "mitigation_capability_disabled",
    });
    return;
  }

  const issueLogPath = resolveIssueLogPath(LOG_DIR, issue, issueId);
  const issueLog = createJsonlLogger(issueLogPath, issueId, {
    locale: LOCALE,
  });

  try {
    const mitigationEntry = path.join(issueDir, issue.entry.mitigation);
    const issueModule = await import(pathToFileURL(mitigationEntry).href);
    if (typeof issueModule.activate !== "function") {
      issueLog("issue_skipped", {
        reason: "activate_missing",
        mitigationEntry,
      });
      return;
    }

    const messages = loadIssueMessages(issueDir, LOCALE);
    const t = (key, params = {}) => renderMessage(messages, key, params);

    issueLog("issue_activate_start", {
      argv: process.argv,
      issueDir,
    });

    await issueModule.activate({
      repoRoot: REPO_ROOT,
      bridgeRoot: BRIDGE_ROOT,
      openclawHome: OPENCLAW_HOME,
      issueId,
      issueDir,
      issue,
      locale: LOCALE,
      messages,
      t,
      log: issueLog,
      mitigationLog,
    });

    issueLog("issue_activate_done", {
      argv: process.argv,
    });
  } catch (error) {
    issueLog("issue_activate_failed", {
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
  }
}

export async function runMitigations() {
  if (isGuardianDisabled()) {
    mitigationLog("mitigation_skipped", { reason: "global_disable" });
    return;
  }

  const args = process.argv.slice(2);
  const forcedIssues = parseForcedIssues();
  const discoveredIssues = discoverIssues(ISSUES_ROOT);
  const activeIssueIds = resolveActiveIssueIds(ISSUES_ROOT, ISSUE_CONFIG_PATH);
  const activeSet = new Set(activeIssueIds);

  mitigationLog("mitigation_loaded", {
    argv: process.argv,
    openclawVersion: PATHS.openclawVersion,
    issueConfigPath: ISSUE_CONFIG_PATH,
    discoveredIssues: discoveredIssues.map(({ issueId }) => issueId),
    activeIssueIds,
    forcedIssues: Array.from(forcedIssues),
  });

  for (const { issueId, issuePath, issue } of discoveredIssues) {
    const forceMatch = issue ? Array.from(forcedIssues).some((selector) => matchesIssueSelector(selector, issueId, issue)) : forcedIssues.has(issueId);
    const activeByConfig = activeSet.has(issueId);
    const applicability = issue ? evaluateIssueApplicability(issue, PATHS.openclawVersion) : null;
    const applicableByVersion = applicability ? applicability.active : false;
    const normalMatch = activeByConfig && issue ? matchesIssue(issue, args) : false;

    mitigationLog("issue_evaluated", {
      issueId,
      issuePath,
      activeByConfig,
      applicableByVersion,
      applicabilityReason: applicability?.reason || null,
      openclawVersion: applicability?.openclawVersion || PATHS.openclawVersion || null,
      versionRange: applicability?.versionRange || null,
      forceMatch,
      normalMatch,
    });

    if (!forceMatch && (!normalMatch || !applicableByVersion)) {
      continue;
    }

    if (!issue) {
      mitigationLog("issue_skipped", {
        issueId,
        reason: "issue_manifest_missing",
        issuePath,
      });
      continue;
    }

    const issueDir = path.join(ISSUES_ROOT, issueId);
    await activateMitigationIssue(issueId, issue, issueDir);
  }
}
