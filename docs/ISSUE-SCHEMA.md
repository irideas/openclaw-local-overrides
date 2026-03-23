# Issue Schema Reference

本文档把 `issue.json` 的当前模型显式化，避免维护者只能通过阅读
`core/issue-loader.mjs` 反推字段约束。

## 1. 最小合法示例

```json
{
  "id": "example-issue",
  "alias": "example",
  "title": "Example issue title",
  "category": "runtime",
  "severity": "warning",
  "summary": "Short summary of the issue.",
  "enabledByDefault": true,
  "capabilities": {
    "preflight": true,
    "mitigation": false,
    "repair": false
  },
  "triggers": {
    "commands": [["gateway", "restart"]]
  },
  "entry": {
    "preflight": "./preflight.mjs"
  }
}
```

## 2. 字段说明

### 2.1 `id`

- 类型：`string`
- 必填
- 必须与目录名一致
- 建议使用稳定、描述性的 kebab-case

例如：

- `openai-codex-oauth-proxy-failure`
- `plugins-feishu-duplicate-id`

### 2.2 `alias`

- 类型：`string`
- 可选，但强烈建议提供
- 必须是 kebab-case
- 用于：
  - CLI 选择器
  - 环境变量前缀缩写
  - 更短的调试入口

例如：

- `codex-auth`
- `feishu-dup`

### 2.3 `title`

- 类型：`string`
- 必填
- 用于 issue 基本标题
- 若存在本地化文案，用户可见输出会优先使用 `i18n/*` 中的 `meta.title`

### 2.4 `category`

- 类型：`string`
- 必填
- 用于粗粒度分类

当前常见取值：

- `auth`
- `plugins`
- `runtime`
- `network`

### 2.5 `severity`

- 类型：`string`
- 必填
- 当前常见值：
  - `warning`
  - `error`

它主要影响：

- `preflight` 输出的严重级别
- issue 的基本风险判断

### 2.6 `summary`

- 类型：`string`
- 必填
- 用于 issue 简短摘要
- 用户可见输出优先使用 `i18n/*` 中的 `meta.summary`

### 2.7 `enabledByDefault`

- 类型：`boolean`
- 可选
- 含义：在没有显式配置覆盖时，issue 是否默认启用

### 2.8 `capabilities`

- 类型：`object`
- 必填
- 当前支持的键：
  - `preflight`
  - `mitigation`
  - `repair`

值应为 `boolean`。

如果某个能力面为 `true`，则 `entry` 里必须提供对应入口。

### 2.9 `triggers`

- 类型：`object`
- 可选，但通常应提供

当前支持的匹配方式：

- `argvAll`
  要求命令行参数中包含这些 token
- `provider`
  用于匹配 `--provider`
- `commands`
  按命令前缀匹配，例如 `["gateway", "restart"]`

### 2.10 `appliesTo`

- 类型：`object`
- 可选
- 用于描述版本适用范围

当前支持：

```json
"appliesTo": {
  "openclaw": {
    "versionRange": ">=2026.3.13 <2026.4.0",
    "whenUnknown": "inactive"
  }
}
```

约束：

- `versionRange` 应为非空字符串
- `whenUnknown` 只能是：
  - `active`
  - `inactive`

### 2.11 `entry`

- 类型：`object`
- 必填
- 描述能力面实现文件

支持字段：

- `preflight`
- `mitigation`
- `repair`

如果某能力面已启用但 `entry` 缺失，对应 issue 会被校验拒绝。

### 2.12 `env`

- 类型：`object`
- 可选

支持字段：

- `prefix`
  issue 专属环境变量前缀
- `variables`
  该 issue 使用到的环境变量列表

### 2.13 `logging`

- 类型：`object`
- 可选

当前支持：

- `file`
  issue 对应日志文件名

如果未提供，默认文件名会回退到 `<issue-id>.log`

### 2.14 `upstream`

- 类型：`object`
- 可选

建议包含：

- `recommendedCommands`
- `coverage`

用于说明：

- 与上游 `OpenClaw` 能力的关系
- 当前 issue 是完全覆盖、部分覆盖还是仅补位

## 3. 完整示例

```json
{
  "id": "openai-codex-oauth-proxy-failure",
  "alias": "codex-auth",
  "title": "OpenClaw fails to persist openai-codex auth after browser authorization",
  "category": "auth",
  "severity": "error",
  "summary": "After browser authorization succeeds, OpenClaw may still fail to exchange the final token and write openai-codex auth credentials.",
  "enabledByDefault": true,
  "appliesTo": {
    "openclaw": {
      "versionRange": ">=2026.3.13 <2026.4.0",
      "whenUnknown": "inactive"
    }
  },
  "capabilities": {
    "preflight": false,
    "mitigation": true,
    "repair": false
  },
  "triggers": {
    "argvAll": ["models", "auth", "login"],
    "provider": "openai-codex"
  },
  "entry": {
    "mitigation": "./mitigation.mjs"
  },
  "env": {
    "prefix": "OPENCLAW_GUARDIAN_CODEX_AUTH_",
    "variables": [
      "OPENCLAW_GUARDIAN_CODEX_AUTH_DISABLE",
      "OPENCLAW_GUARDIAN_CODEX_AUTH_CURL_FALLBACK_DISABLE"
    ]
  },
  "logging": {
    "file": "openai-codex-oauth-proxy-failure.log"
  },
  "upstream": {
    "recommendedCommands": ["openclaw doctor"],
    "coverage": "partial"
  }
}
```

## 4. 常见错误

### 4.1 `id` 与目录名不一致

结果：

- `validateIssue()` 会返回 `issue_id_mismatch`

### 4.2 `alias` 不是合法 kebab-case

例如：

- `bad alias`
- `BadAlias`

结果：

- `validateIssue()` 会返回 `issue_alias_invalid`

### 4.3 启用了能力面，但 `entry` 缺失

例如：

- `capabilities.mitigation = true`
- 但没有 `entry.mitigation`

结果：

- issue 不会被正常加载

### 4.4 `versionRange` 为空字符串

结果：

- `validateIssue()` 会返回 `issue_version_range_invalid`

### 4.5 `commands` 中存在空命令

例如：

```json
"commands": [["gateway", "restart"], []]
```

结果：

- `validateIssue()` 会返回 `issue_triggers_commands_invalid`

## 5. 文档与实现一致性要求

只写 `issue.json` 还不够。

每次修改 schema 相关字段时，还应同步检查：

- `README.md`
- `i18n/en.json`
- `i18n/zh-CN.json`
- 对应测试
- [ISSUE-AUTHORING.md](./ISSUE-AUTHORING.md)

否则 AI Agent 很容易因为文档与当前实现不一致而做出错误修改。
