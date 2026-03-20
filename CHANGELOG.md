# Changelog

本文档记录 `openclaw-guardian` 从 `1.0.0` 开始的正式版本演进。

## 1.0.0 - 2026-03-20

### Added

- 以 `issues` 为中心的 guardian 架构
- 公共 `core/` 执行层：
  - `issue-loader`
  - `mitigation-runner`
  - `preflight-runner`
  - `repair-runner`
  - `locale`
  - `i18n-renderer`
  - `logger`
- `openai-codex-oauth-proxy-failure` issue
- `plugins-feishu-duplicate-id` issue
- `guardian` CLI 与 shell 函数入口
- issue `alias` 与短环境变量前缀
- `OpenClaw` 版本范围门控
- `zh-CN` 与 `en` 双语基础支持
- 对应的 unit / integration 测试

### Changed

- 项目正式版本从 `1.0.0` 开始
- `runtime/` 目录与 `runtime` 能力面分别收敛为 `bridge/` 与 `mitigation`
- 本地接入路径改为 `~/.openclaw/guardian`
- 不再保留旧命名、旧环境变量与旧兼容入口
