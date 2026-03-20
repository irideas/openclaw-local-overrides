# `plugins-feishu-duplicate-id`

## Issue 定位

这个 issue 用于处理一种典型的本地插件冲突：

当前 alias：

- `feishu-dup`

- 内置 `feishu` 插件已经存在
- 本地又额外存在一个 `feishu` 扩展或显式安装引用
- 两者使用相同的 plugin id

典型症状包括：

- `plugin feishu: duplicate plugin id detected`
- `plugins.allow is empty; discovered non-bundled plugins may auto-load`

## 当前能力面

当前这个 issue 启用了两种能力面：

- `preflight`
- `repair`

也就是说：

- 在相关命令真正执行前，guardian 会先检测是否存在这类冲突
- 如果命中，可以通过显式 `repair` 执行本地修复

## 触发条件

当前会在这些命令前触发：

- `openclaw gateway restart`
- `openclaw gateway start`
- `openclaw plugins list`
- `openclaw plugins doctor`

## 适用版本

当前 `issue.json` 约定的 `OpenClaw` 版本范围是：

- `>=2026.3.13 <2026.4.0`

如果当前 `OpenClaw` 版本不在这个范围内，guardian 不会激活本 issue 的 `preflight` 或 `repair`。

## 当前修复策略

这个 issue 当前的修复动作非常克制，只做两类明确操作：

1. 如果 `~/.openclaw/extensions/feishu` 存在，则把它移动到 `.extensions-backup/`
2. 如果 `openclaw.json` 中存在 `plugins.installs.feishu`，则删除这条显式安装引用

当前不会自动改写 `plugins.allow`。  
因为 allowlist 往往带有明显的本地策略含义，自动改写风险较高。

## 使用方式

查看修复计划：

```bash
guardian repair feishu-dup --dry-run
```

执行修复：

```bash
guardian repair feishu-dup --apply
```

## 日志

默认日志文件：

```text
$HOME/.openclaw/logs/guardian/plugins-feishu-duplicate-id.log
```

常见事件包括：

- `preflight_state`
- `preflight_start`
- `preflight_done`
- `repair_plan`
- `repair_apply_done`

## 相关建议

如果 preflight 命中，建议按这个顺序处理：

1. 先运行 `openclaw plugins doctor`
2. 再运行 `guardian repair feishu-dup --dry-run`
3. 确认计划后，再执行 `--apply`
