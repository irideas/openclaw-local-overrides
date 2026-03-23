import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateIssue } from "../core/issue-loader.mjs";
import { cleanupDir } from "./test-helpers.mjs";

const TEST_FILE = fileURLToPath(import.meta.url);
const TEST_DIR = path.dirname(TEST_FILE);
const REPO_ROOT = path.resolve(TEST_DIR, "..");
const SCRIPT_PATH = path.join(REPO_ROOT, "scripts", "new-issue.mjs");
const TEMPLATES_ROOT = path.join(REPO_ROOT, "templates", "issue");

test("new-issue 脚手架应按能力面生成最小 issue 目录", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-guardian-new-issue-"));
  const issuesRoot = path.join(tempRoot, "issues");

  try {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--id",
        "example-runtime-issue",
        "--alias",
        "example-issue",
        "--title",
        "Example Runtime Issue",
        "--summary",
        "Example summary.",
        "--summary-zh",
        "示例摘要。",
        "--category",
        "runtime",
        "--severity",
        "warning",
        "--capabilities",
        "preflight,repair",
        "--issues-root",
        issuesRoot,
        "--templates-root",
        TEMPLATES_ROOT,
      ],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);

    const issueDir = path.join(issuesRoot, "example-runtime-issue");
    const issueJson = JSON.parse(fs.readFileSync(path.join(issueDir, "issue.json"), "utf8"));
    assert.deepEqual(validateIssue("example-runtime-issue", issueJson), {
      ok: true,
      reason: null,
    });

    assert.equal(fs.existsSync(path.join(issueDir, "README.md")), true);
    assert.equal(fs.existsSync(path.join(issueDir, "i18n", "en.json")), true);
    assert.equal(fs.existsSync(path.join(issueDir, "i18n", "zh-CN.json")), true);
    assert.equal(fs.existsSync(path.join(issueDir, "preflight.mjs")), true);
    assert.equal(fs.existsSync(path.join(issueDir, "repair.mjs")), true);
    assert.equal(fs.existsSync(path.join(issueDir, "mitigation.mjs")), false);
  } finally {
    cleanupDir(tempRoot);
  }
});

test("new-issue 脚手架应拒绝无效 issue id", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-guardian-new-issue-"));
  const issuesRoot = path.join(tempRoot, "issues");

  try {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--id",
        "Bad Issue",
        "--capabilities",
        "mitigation",
        "--issues-root",
        issuesRoot,
        "--templates-root",
        TEMPLATES_ROOT,
      ],
      { encoding: "utf8" },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /issue id must be kebab-case/);
  } finally {
    cleanupDir(tempRoot);
  }
});
