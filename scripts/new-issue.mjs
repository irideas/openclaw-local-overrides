#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_FILE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(CURRENT_FILE);
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ISSUES_ROOT = path.join(REPO_ROOT, "issues");
const DEFAULT_TEMPLATES_ROOT = path.join(REPO_ROOT, "templates", "issue");

function printUsage() {
  process.stderr.write(
    [
      "Usage: node scripts/new-issue.mjs --id <issue-id> --capabilities <list> [options]",
      "",
      "Options:",
      "  --id <value>                 Issue id, kebab-case",
      "  --alias <value>              Issue alias, default: same as id",
      "  --title <value>              Human title, default: Title Case from id",
      "  --summary <value>            English summary placeholder",
      "  --summary-zh <value>         Chinese summary placeholder",
      "  --category <value>           default: runtime",
      "  --severity <value>           default: warning",
      "  --capabilities <csv>         e.g. preflight,repair",
      "  --enabled-by-default         default: false",
      "  --issues-root <path>         default: <repo>/issues",
      "  --templates-root <path>      default: <repo>/templates/issue",
      "",
    ].join("\n"),
  );
}

function normalize(value) {
  const text = String(value || "").trim();
  return text || null;
}

function titleFromId(issueId) {
  return issueId
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseArgs(argv) {
  const options = {
    enabledByDefault: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--enabled-by-default") {
      options.enabledByDefault = true;
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`unknown argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for --${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

function validateKebab(name, value) {
  if (!normalize(value) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`${name} must be kebab-case`);
  }
}

function parseCapabilities(value) {
  const raw = normalize(value);
  if (!raw) {
    throw new Error("--capabilities is required");
  }

  const capabilities = new Set(
    raw.split(",").map((item) => item.trim()).filter(Boolean),
  );

  for (const capability of capabilities) {
    if (!["preflight", "mitigation", "repair"].includes(capability)) {
      throw new Error(`unsupported capability: ${capability}`);
    }
  }

  if (capabilities.size === 0) {
    throw new Error("at least one capability is required");
  }

  return capabilities;
}

function readTemplate(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function replaceTokens(template, replacements) {
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`__${key}__`, value);
  }
  return output;
}

function createIssueJson(options, capabilities) {
  const capabilityFlags = {
    preflight: capabilities.has("preflight"),
    mitigation: capabilities.has("mitigation"),
    repair: capabilities.has("repair"),
  };

  const entry = {};
  if (capabilityFlags.preflight) entry.preflight = "./preflight.mjs";
  if (capabilityFlags.mitigation) entry.mitigation = "./mitigation.mjs";
  if (capabilityFlags.repair) entry.repair = "./repair.mjs";

  return {
    id: options.id,
    alias: options.alias,
    title: options.title,
    category: options.category,
    severity: options.severity,
    summary: options.summary,
    enabledByDefault: options.enabledByDefault === true,
    capabilities: capabilityFlags,
    triggers: {},
    entry,
    upstream: {
      recommendedCommands: [],
      coverage: "none",
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const issueId = normalize(options.id);
  if (!issueId) {
    printUsage();
    throw new Error("--id is required");
  }

  validateKebab("issue id", issueId);

  const alias = normalize(options.alias) || issueId;
  validateKebab("issue alias", alias);

  const capabilities = parseCapabilities(options.capabilities);
  const title = normalize(options.title) || titleFromId(issueId);
  const summary = normalize(options.summary) || "TODO: replace with an English summary.";
  const summaryZh = normalize(options["summary-zh"]) || "TODO：请替换为中文摘要。";
  const category = normalize(options.category) || "runtime";
  const severity = normalize(options.severity) || "warning";
  const issuesRoot = normalize(options["issues-root"]) || DEFAULT_ISSUES_ROOT;
  const templatesRoot = normalize(options["templates-root"]) || DEFAULT_TEMPLATES_ROOT;
  const issueDir = path.join(issuesRoot, issueId);

  if (fs.existsSync(issueDir)) {
    throw new Error(`issue directory already exists: ${issueDir}`);
  }

  const jsonTemplate = readTemplate(path.join(templatesRoot, "issue.json"));
  const readmeTemplate = readTemplate(path.join(templatesRoot, "README.md"));
  const enTemplate = readTemplate(path.join(templatesRoot, "i18n", "en.json"));
  const zhTemplate = readTemplate(path.join(templatesRoot, "i18n", "zh-CN.json"));

  const issueJson = createIssueJson(
    {
      id: issueId,
      alias,
      title,
      summary,
      category,
      severity,
      enabledByDefault: options.enabledByDefault === true,
    },
    capabilities,
  );

  const readme = replaceTokens(readmeTemplate, {
    ISSUE_ID: issueId,
    ISSUE_ALIAS: alias,
    CAPABILITIES_BULLETS: Array.from(capabilities).map((name) => `- \`${name}\``).join("\n"),
  });

  const issueJsonText = jsonTemplate
    .replace("__ISSUE_ID_JSON__", JSON.stringify(issueJson.id))
    .replace("__ISSUE_ALIAS_JSON__", JSON.stringify(issueJson.alias))
    .replace("__ISSUE_TITLE_JSON__", JSON.stringify(issueJson.title))
    .replace("__ISSUE_CATEGORY_JSON__", JSON.stringify(issueJson.category))
    .replace("__ISSUE_SEVERITY_JSON__", JSON.stringify(issueJson.severity))
    .replace("__ISSUE_SUMMARY_JSON__", JSON.stringify(issueJson.summary))
    .replace("__ISSUE_ENABLED_BY_DEFAULT__", String(issueJson.enabledByDefault))
    .replace("__ISSUE_CAPABILITIES_JSON__", JSON.stringify(issueJson.capabilities, null, 2))
    .replace("__ISSUE_TRIGGERS_JSON__", JSON.stringify(issueJson.triggers, null, 2))
    .replace("__ISSUE_ENTRY_JSON__", JSON.stringify(issueJson.entry, null, 2))
    .replace("__ISSUE_UPSTREAM_JSON__", JSON.stringify(issueJson.upstream, null, 2))
    .replace("__ISSUE_APPLIES_TO_SUFFIX__", "");

  writeFile(path.join(issueDir, "issue.json"), `${issueJsonText}\n`);
  writeFile(path.join(issueDir, "README.md"), `${readme}\n`);
  writeFile(
    path.join(issueDir, "i18n", "en.json"),
    `${replaceTokens(enTemplate, {
      ISSUE_TITLE: title,
      ISSUE_SUMMARY: summary,
    })}\n`,
  );
  writeFile(
    path.join(issueDir, "i18n", "zh-CN.json"),
    `${replaceTokens(zhTemplate, {
      ISSUE_TITLE: title,
      ISSUE_SUMMARY_ZH: summaryZh,
    })}\n`,
  );

  if (capabilities.has("preflight")) {
    writeFile(
      path.join(issueDir, "preflight.mjs"),
      `${readTemplate(path.join(templatesRoot, "preflight.mjs"))}\n`,
    );
  }
  if (capabilities.has("mitigation")) {
    writeFile(
      path.join(issueDir, "mitigation.mjs"),
      `${readTemplate(path.join(templatesRoot, "mitigation.mjs"))}\n`,
    );
  }
  if (capabilities.has("repair")) {
    writeFile(
      path.join(issueDir, "repair.mjs"),
      `${readTemplate(path.join(templatesRoot, "repair.mjs"))}\n`,
    );
  }

  process.stdout.write(`Created issue scaffold at ${issueDir}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
}
