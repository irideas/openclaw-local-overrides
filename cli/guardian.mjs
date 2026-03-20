#!/usr/bin/env node

import process from "node:process";
import { loadIssueMessages, renderMessage } from "../core/i18n-renderer.mjs";
import { resolveLocale } from "../core/locale.mjs";
import {
  discoverIssues,
  evaluateIssueApplicability,
  normalizeIssueAlias,
  resolveGuardianPaths,
  resolveIssueBySelector,
} from "../core/issue-loader.mjs";
import { runRepair } from "../core/repair-runner.mjs";

const CLI_MESSAGES = {
  en: {
    usage: "Usage: guardian <issue|repair> ...",
    issueListHeader: "Issues",
    issueShowUsage: "Usage: guardian issue show <issue-selector>",
    repairUsage: "Usage: guardian repair <issue-selector> [--dry-run|--apply]",
    unknownCommand: "Unknown command.",
    issueNotFound: "Issue not found: {selector}",
    commandFailed: "Command failed: {message}",
    issueInactive: "Issue is not applicable for current OpenClaw version.",
    alias: "Alias",
    title: "Title",
    summary: "Summary",
    capabilities: "Capabilities",
    category: "Category",
    severity: "Severity",
    enabledByDefault: "Enabled by default",
    openclawVersion: "OpenClaw version",
    versionRange: "Version range",
    appliesNow: "Applies now",
    yes: "yes",
    no: "no",
    unknown: "unknown",
    inactiveBadge: "inactive",
  },
  "zh-CN": {
    usage: "用法：guardian <issue|repair> ...",
    issueListHeader: "Issues 列表",
    issueShowUsage: "用法：guardian issue show <issue-selector>",
    repairUsage: "用法：guardian repair <issue-selector> [--dry-run|--apply]",
    unknownCommand: "未知命令。",
    issueNotFound: "未找到 issue：{selector}",
    commandFailed: "命令执行失败：{message}",
    issueInactive: "当前 `OpenClaw` 版本不适用这个 issue。",
    alias: "别名",
    title: "标题",
    summary: "摘要",
    capabilities: "能力面",
    category: "类别",
    severity: "严重级别",
    enabledByDefault: "默认启用",
    openclawVersion: "OpenClaw 版本",
    versionRange: "版本范围",
    appliesNow: "当前是否适用",
    yes: "是",
    no: "否",
    unknown: "未知",
    inactiveBadge: "不适用",
  },
};

function t(locale, key, params = {}) {
  const bundle = CLI_MESSAGES[locale] || CLI_MESSAGES.en;
  const template = bundle[key] || CLI_MESSAGES.en[key] || key;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => {
    const value = params[name];
    return value === undefined || value === null ? `{${name}}` : String(value);
  });
}

function printUsage(locale) {
  process.stderr.write(`${t(locale, "usage")}\n`);
}

function resolveIssueDisplay(issueDir, issue, locale) {
  const messages = loadIssueMessages(issueDir, locale);
  const title = renderMessage(messages, "meta.title");
  const summary = renderMessage(messages, "meta.summary");
  return {
    title: title === "meta.title" ? issue.title : title,
    summary: summary === "meta.summary" ? issue.summary : summary,
  };
}

function printIssue(issueId, issueDir, issue, locale, openclawVersion) {
  const applicability = evaluateIssueApplicability(issue, openclawVersion);
  const alias = normalizeIssueAlias(issue);
  const display = resolveIssueDisplay(issueDir, issue, locale);
  process.stdout.write(`${issueId}\n`);
  process.stdout.write(`  ${t(locale, "alias")}: ${alias || "-"}\n`);
  process.stdout.write(`  ${t(locale, "title")}: ${display.title}\n`);
  process.stdout.write(`  ${t(locale, "summary")}: ${display.summary}\n`);
  process.stdout.write(`  ${t(locale, "category")}: ${issue.category}\n`);
  process.stdout.write(`  ${t(locale, "severity")}: ${issue.severity}\n`);
  process.stdout.write(
    `  ${t(locale, "enabledByDefault")}: ${issue.enabledByDefault === true ? t(locale, "yes") : t(locale, "no")}\n`,
  );
  process.stdout.write(
    `  ${t(locale, "capabilities")}: ${Object.entries(issue.capabilities || {})
      .filter(([, enabled]) => enabled === true)
      .map(([name]) => name)
      .join(", ") || "-"}\n`,
  );
  process.stdout.write(
    `  ${t(locale, "openclawVersion")}: ${openclawVersion || t(locale, "unknown")}\n`,
  );
  process.stdout.write(
    `  ${t(locale, "versionRange")}: ${applicability.versionRange || "*"}\n`,
  );
  process.stdout.write(
    `  ${t(locale, "appliesNow")}: ${applicability.active === true ? t(locale, "yes") : t(locale, "no")}\n`,
  );
}

async function main() {
  const locale = resolveLocale();
  const args = process.argv.slice(2);
  const [command, subcommand, value] = args;

  if (!command) {
    printUsage(locale);
    process.exitCode = 1;
    return;
  }

  if (command === "issue" && subcommand === "list") {
    const { issuesRoot, openclawVersion } = resolveGuardianPaths();
    const issues = discoverIssues(issuesRoot).filter(({ issue }) => issue);
    process.stdout.write(`${t(locale, "issueListHeader")}\n`);
    for (const { issueId, issue } of issues) {
      const applicability = evaluateIssueApplicability(issue, openclawVersion);
      const alias = normalizeIssueAlias(issue);
      const display = resolveIssueDisplay(
        `${issuesRoot}/${issueId}`,
        issue,
        locale,
      );
      process.stdout.write(
        `- ${issueId}${alias ? ` (${alias})` : ""}: ${display.title}${applicability.active ? "" : ` [${t(locale, "inactiveBadge")}]`}\n`,
      );
    }
    return;
  }

  if (command === "issue" && subcommand === "show") {
    if (!value) {
      process.stderr.write(`${t(locale, "issueShowUsage")}\n`);
      process.exitCode = 1;
      return;
    }

    const { issuesRoot, openclawVersion } = resolveGuardianPaths();
    const issues = discoverIssues(issuesRoot);
    const entry = resolveIssueBySelector(issues, value);
    if (!entry || !entry.issue) {
      process.stderr.write(`${t(locale, "issueNotFound", { selector: value })}\n`);
      process.exitCode = 1;
      return;
    }

    printIssue(entry.issueId, `${issuesRoot}/${entry.issueId}`, entry.issue, locale, openclawVersion);
    return;
  }

  if (command === "repair") {
    const selector = subcommand;
    const mode = value;
    const apply = mode === "--apply";
    const dryRun = mode === undefined || mode === "--dry-run";

    if (!selector || (!apply && !dryRun)) {
      process.stderr.write(`${t(locale, "repairUsage")}\n`);
      process.exitCode = 1;
      return;
    }

    const { issuesRoot, openclawVersion } = resolveGuardianPaths();
    const issues = discoverIssues(issuesRoot);
    const entry = resolveIssueBySelector(issues, selector);
    if (!entry || !entry.issue) {
      process.stderr.write(`${t(locale, "issueNotFound", { selector })}\n`);
      process.exitCode = 1;
      return;
    }

    const applicability = evaluateIssueApplicability(entry.issue, openclawVersion);
    if (!applicability.active) {
      process.stderr.write(`${t(locale, "issueInactive")}\n`);
      process.exitCode = 1;
      return;
    }

    await runRepair({
      issueId: entry.issueId,
      apply,
    });
    return;
  }

  process.stderr.write(`${t(locale, "unknownCommand")}\n`);
  printUsage(locale);
  process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  const locale = resolveLocale();
  process.stderr.write(
    `${t(locale, "commandFailed", { message: error?.message || String(error) })}\n`,
  );
  process.exitCode = 1;
}
