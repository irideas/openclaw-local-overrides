import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  compareVersions,
  discoverIssues,
  evaluateIssueApplicability,
  extractProvider,
  isEnabledByDefault,
  matchesIssue,
  matchesIssueSelector,
  matchesVersionRange,
  normalizeIssueAlias,
  parseForcedIssues,
  parseVersion,
  resolveActiveIssueIds,
  resolveGuardianPaths,
  resolveIssueBySelector,
  resolveIssueLogPath,
  validateIssue,
} from "../core/issue-loader.mjs";
import { cleanupDir, createTempRepoFixture, writeJson } from "./test-helpers.mjs";

test("resolveGuardianPaths 应当支持 guardian 环境变量覆盖", () => {
  const paths = resolveGuardianPaths({
    OPENCLAW_GUARDIAN_BRIDGE_ROOT: "/tmp/repo/bridge",
    OPENCLAW_GUARDIAN_REPO_ROOT: "/tmp/repo",
    OPENCLAW_GUARDIAN_HOME: "/tmp/home",
    OPENCLAW_GUARDIAN_OPENCLAW_ROOT: "/tmp/openclaw",
    OPENCLAW_GUARDIAN_OPENCLAW_VERSION: "2026.3.13",
    OPENCLAW_GUARDIAN_LOG_DIR: "/tmp/logs",
    OPENCLAW_GUARDIAN_ISSUE_CONFIG_PATH: "/tmp/issues.json",
  });

  assert.deepEqual(paths, {
    repoRoot: "/tmp/repo",
    bridgeRoot: "/tmp/repo/bridge",
    issuesRoot: "/tmp/repo/issues",
    openclawHome: "/tmp/home",
    openclawRoot: "/tmp/openclaw",
    openclawVersion: "2026.3.13",
    logDir: "/tmp/logs",
    issueConfigPath: "/tmp/issues.json",
  });
});

test("extractProvider 应当同时支持分离写法和内联写法", () => {
  assert.equal(extractProvider(["models", "auth", "--provider", "openai-codex"]), "openai-codex");
  assert.equal(extractProvider(["models", "auth", "--provider=openai-codex"]), "openai-codex");
  assert.equal(extractProvider(["models", "auth"]), null);
});

test("matchesIssue 应当正确匹配 openai-codex 登录命令", () => {
  const issue = {
    triggers: {
      argvAll: ["models", "auth", "login"],
      provider: "openai-codex",
    },
  };

  assert.equal(
    matchesIssue(issue, ["models", "auth", "login", "--provider", "openai-codex"]),
    true,
  );
  assert.equal(
    matchesIssue(issue, ["models", "auth", "login", "--provider", "other"]),
    false,
  );
  assert.equal(
    matchesIssue(issue, ["models", "auth", "--provider", "openai-codex"]),
    false,
  );
});

test("matchesIssue 应当支持按命令前缀匹配 preflight issue", () => {
  const issue = {
    triggers: {
      commands: [
        ["gateway", "restart"],
        ["plugins", "list"],
      ],
    },
  };

  assert.equal(matchesIssue(issue, ["gateway", "restart"]), true);
  assert.equal(matchesIssue(issue, ["plugins", "list"]), true);
  assert.equal(matchesIssue(issue, ["plugins", "doctor"]), false);
});

test("parseForcedIssues 应当正确解析逗号分隔列表", () => {
  const forced = parseForcedIssues({
    OPENCLAW_GUARDIAN_FORCE_ISSUES: "a, b ,c",
  });

  assert.deepEqual(Array.from(forced), ["a", "b", "c"]);
});

test("parseVersion / compareVersions / matchesVersionRange 应当正确处理 OpenClaw 版本", () => {
  assert.deepEqual(parseVersion("2026.3.13"), [2026, 3, 13]);
  assert.equal(compareVersions("2026.3.13", "2026.3.13"), 0);
  assert.equal(compareVersions("2026.3.14", "2026.3.13"), 1);
  assert.equal(compareVersions("2026.3.12", "2026.3.13"), -1);
  assert.equal(matchesVersionRange("2026.3.13", ">=2026.3.13 <2026.4.0"), true);
  assert.equal(matchesVersionRange("2026.4.0", ">=2026.3.13 <2026.4.0"), false);
});

test("evaluateIssueApplicability 应当根据版本范围决定 issue 是否生效", () => {
  const issue = {
    appliesTo: {
      openclaw: {
        versionRange: ">=2026.3.13 <2026.4.0",
        whenUnknown: "inactive",
      },
    },
  };

  assert.deepEqual(evaluateIssueApplicability(issue, "2026.3.13"), {
    active: true,
    reason: "version_range_evaluated",
    openclawVersion: "2026.3.13",
    versionRange: ">=2026.3.13 <2026.4.0",
  });
  assert.deepEqual(evaluateIssueApplicability(issue, "2026.4.0"), {
    active: false,
    reason: "version_range_evaluated",
    openclawVersion: "2026.4.0",
    versionRange: ">=2026.3.13 <2026.4.0",
  });
  assert.deepEqual(evaluateIssueApplicability(issue, null), {
    active: false,
    reason: "openclaw_version_unknown",
    openclawVersion: null,
    versionRange: ">=2026.3.13 <2026.4.0",
  });
});

test("normalizeIssueAlias / matchesIssueSelector / resolveIssueBySelector 应当支持 issue alias", () => {
  const issue = {
    alias: "codex-auth",
  };
  const discoveredIssues = [
    {
      issueId: "openai-codex-oauth-proxy-failure",
      issue,
    },
  ];

  assert.equal(normalizeIssueAlias(issue), "codex-auth");
  assert.equal(matchesIssueSelector("openai-codex-oauth-proxy-failure", "openai-codex-oauth-proxy-failure", issue), true);
  assert.equal(matchesIssueSelector("codex-auth", "openai-codex-oauth-proxy-failure", issue), true);
  assert.equal(resolveIssueBySelector(discoveredIssues, "codex-auth")?.issueId, "openai-codex-oauth-proxy-failure");
});

test("validateIssue 应当校验 issue id 与 mitigation 入口", () => {
  assert.deepEqual(
    validateIssue("openai-codex-oauth-proxy-failure", {
      id: "openai-codex-oauth-proxy-failure",
      alias: "codex-auth",
      title: "OAuth token exchange fails behind proxy",
      category: "auth",
      severity: "error",
      capabilities: { mitigation: true, preflight: false, repair: false },
      entry: { mitigation: "./mitigation.mjs" },
    }),
    { ok: true, reason: null },
  );

  assert.deepEqual(
    validateIssue("openai-codex-oauth-proxy-failure", {
      id: "other",
      alias: "other",
      title: "Other",
      category: "auth",
      severity: "error",
      capabilities: { mitigation: true, preflight: false, repair: false },
      entry: { mitigation: "./mitigation.mjs" },
    }),
    { ok: false, reason: "issue_id_mismatch" },
  );
});

test("validateIssue 应当校验默认启用、能力面与 env 字段", () => {
  assert.deepEqual(
    validateIssue("openai-codex-oauth-proxy-failure", {
      id: "openai-codex-oauth-proxy-failure",
      alias: "bad alias",
      title: "OAuth token exchange fails behind proxy",
      category: "auth",
      severity: "error",
      enabledByDefault: "yes",
      capabilities: { mitigation: true, preflight: false, repair: false },
      entry: { mitigation: "./mitigation.mjs" },
    }),
    { ok: false, reason: "issue_alias_invalid" },
  );

  assert.deepEqual(
    validateIssue("openai-codex-oauth-proxy-failure", {
      id: "openai-codex-oauth-proxy-failure",
      alias: "codex-auth",
      title: "OAuth token exchange fails behind proxy",
      category: "auth",
      severity: "error",
      enabledByDefault: "yes",
      capabilities: { mitigation: true, preflight: false, repair: false },
      entry: { mitigation: "./mitigation.mjs" },
    }),
    { ok: false, reason: "enabled_by_default_invalid" },
  );

  assert.deepEqual(
    validateIssue("openai-codex-oauth-proxy-failure", {
      id: "openai-codex-oauth-proxy-failure",
      alias: "codex-auth",
      title: "OAuth token exchange fails behind proxy",
      category: "auth",
      severity: "error",
      capabilities: { mitigation: true, preflight: false, repair: false },
      entry: {},
    }),
    { ok: false, reason: "issue_mitigation_entry_missing" },
  );

  assert.deepEqual(
    validateIssue("openai-codex-oauth-proxy-failure", {
      id: "openai-codex-oauth-proxy-failure",
      title: "OAuth token exchange fails behind proxy",
      category: "auth",
      severity: "error",
      capabilities: { mitigation: true, preflight: false, repair: false },
      entry: { mitigation: "./mitigation.mjs" },
      env: { variables: ["HTTP_PROXY", ""] },
    }),
    { ok: false, reason: "issue_env_variables_invalid" },
  );

  assert.deepEqual(
    validateIssue("plugins-feishu-duplicate-id", {
      id: "plugins-feishu-duplicate-id",
      alias: "feishu-dup",
      title: "Bundled and local feishu plugins share the same plugin id",
      category: "plugins",
      severity: "warning",
      capabilities: { mitigation: false, preflight: true, repair: true },
      entry: {
        preflight: "./preflight.mjs",
        repair: "./repair.mjs",
      },
      triggers: {
        commands: [["gateway", "restart"], []],
      },
    }),
    { ok: false, reason: "issue_triggers_commands_invalid" },
  );

  assert.deepEqual(
    validateIssue("openai-codex-oauth-proxy-failure", {
      id: "openai-codex-oauth-proxy-failure",
      title: "OAuth token exchange fails behind proxy",
      category: "auth",
      severity: "error",
      capabilities: { mitigation: true, preflight: false, repair: false },
      entry: { mitigation: "./mitigation.mjs" },
      appliesTo: {
        openclaw: {
          versionRange: "",
        },
      },
    }),
    { ok: false, reason: "issue_version_range_invalid" },
  );
});

test("resolveIssueLogPath 应当按 issue 指定的文件名输出", () => {
  const logPath = resolveIssueLogPath("/tmp/logs", {
    logging: { file: "custom.log" },
  }, "openai-codex-oauth-proxy-failure");

  assert.equal(logPath, path.join("/tmp/logs", "custom.log"));
});

test("isEnabledByDefault 应当识别默认启用 issue", () => {
  assert.equal(isEnabledByDefault({ enabledByDefault: true }), true);
  assert.equal(isEnabledByDefault({ enabledByDefault: false }), false);
  assert.equal(isEnabledByDefault({}), false);
});

test("discoverIssues 与 resolveActiveIssueIds 应当支持默认启用和显式禁用", () => {
  const repoRoot = createTempRepoFixture();
  const bridgeRoot = path.join(repoRoot, "bridge");
  const issuesRoot = path.join(repoRoot, "issues");

  try {
    writeJson(path.join(issuesRoot, "alpha", "issue.json"), {
      id: "alpha",
      title: "Alpha",
      category: "auth",
      severity: "warning",
      enabledByDefault: true,
      capabilities: { mitigation: true, preflight: false, repair: false },
      entry: { mitigation: "./mitigation.mjs" },
    });
    writeJson(path.join(issuesRoot, "beta", "issue.json"), {
      id: "beta",
      title: "Beta",
      category: "plugins",
      severity: "error",
      enabledByDefault: false,
      capabilities: { mitigation: true, preflight: false, repair: false },
      entry: { mitigation: "./mitigation.mjs" },
    });
    fs.mkdirSync(path.join(issuesRoot, "broken"), { recursive: true });
    writeJson(path.join(bridgeRoot, "config", "enabled-issues.json"), {
      enabledIssues: ["beta"],
      disabledIssues: ["alpha"],
    });

    const discovered = discoverIssues(issuesRoot);
    assert.deepEqual(
      discovered.map((item) => item.issueId),
      ["alpha", "beta", "broken"],
    );

    const active = resolveActiveIssueIds(
      issuesRoot,
      path.join(bridgeRoot, "config", "enabled-issues.json"),
    );
    assert.deepEqual(active, ["beta"]);
  } finally {
    cleanupDir(repoRoot);
  }
});

test("resolveActiveIssueIds 在配置缺失时应回退到 enabledByDefault", () => {
  const repoRoot = createTempRepoFixture();
  const issuesRoot = path.join(repoRoot, "issues");

  try {
    writeJson(path.join(issuesRoot, "alpha", "issue.json"), {
      id: "alpha",
      title: "Alpha",
      category: "auth",
      severity: "warning",
      enabledByDefault: true,
      capabilities: { mitigation: true, preflight: false, repair: false },
      entry: { mitigation: "./mitigation.mjs" },
    });
    writeJson(path.join(issuesRoot, "beta", "issue.json"), {
      id: "beta",
      title: "Beta",
      category: "plugins",
      severity: "error",
      enabledByDefault: false,
      capabilities: { mitigation: true, preflight: false, repair: false },
      entry: { mitigation: "./mitigation.mjs" },
    });

    const active = resolveActiveIssueIds(
      issuesRoot,
      path.join(repoRoot, "bridge", "config", "missing.json"),
    );
    assert.deepEqual(active, ["alpha"]);
  } finally {
    cleanupDir(repoRoot);
  }
});
