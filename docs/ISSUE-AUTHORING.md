# Issue Authoring Guide

本文档说明如何为 `openclaw-guardian` 新增或维护一个 issue。

目标不是让仓库变成“任意本地脚本集合”，而是让每个 issue 都具有：

- 明确的问题现象
- 清晰的适用范围
- 可解释的治理手段
- 可验证的交付结果

## 1. 什么时候适合新增 issue

满足下面条件时，通常适合新增 issue：

- 问题现象稳定，可以被重复识别
- 问题与 `OpenClaw` 的本地运行环境、代理、插件、配置或命令执行链路直接相关
- 解决方案不适合直接改上游安装包
- 经验值得长期沉淀，而不是一次性排障笔记

常见例子：

- 某条 OAuth 链路在特定网络条件下稳定失败
- 某类插件冲突可以在命令执行前提前发现
- 某个本地状态问题可以通过显式修复动作稳定恢复

## 2. 什么时候不适合新增 issue

下面情况通常不应直接新增 issue：

- 问题只是一次性的临时环境故障，没有可重复模式
- 问题与 `OpenClaw` 无关，而是外部系统单独故障
- 问题已经可以由上游 `openclaw doctor` 或 `openclaw plugins doctor` 完整覆盖
- 解决方案需要大范围接管正常路径，无法做到窄影响

这类情况应优先：

- 直接修上游
- 记录到排障笔记
- 或在项目文档中补充经验，而不是引入一个新的 issue

## 3. 如何选择能力面

新增 issue 时，先判断应该使用哪一种能力面。

### 3.1 `preflight`

适合：

- 能在命令执行前发现风险
- 不需要立即改动本地文件
- 更适合先提示用户，再决定是否修复

常见场景：

- 插件重复注册
- 配置冲突
- 缺失 allowlist
- 已知高风险环境状态

### 3.2 `mitigation`

适合：

- 问题发生在命令执行链路内部
- 修复动作需要进程内接管或窄注入
- 目标是尽量不改持久化状态

常见场景：

- OAuth / proxy / fetch / TLS 链路问题
- 某个命令在特定运行时环境下需要补一个窄行为

### 3.3 `repair`

适合：

- 需要修改本地配置或目录状态
- 修复动作应显式执行，而不是隐式发生
- 最好支持 `dry-run`

常见场景：

- 备份并移动冲突目录
- 调整 `openclaw.json`
- 清理无效安装引用

## 4. 新 issue 的最小交付清单

一个新的 issue 至少应包含：

1. `issues/<issue-id>/issue.json`
2. `issues/<issue-id>/README.md`
3. `issues/<issue-id>/i18n/en.json`
4. `issues/<issue-id>/i18n/zh-CN.json`

如果启用了某个能力面，还必须补对应文件：

- `preflight` -> `preflight.mjs`
- `mitigation` -> `mitigation.mjs`
- `repair` -> `repair.mjs`

同时还应补齐：

- 至少一条对应测试
- 根 `README.md` 中的 issue 列表说明
- `CHANGELOG.md` 中的版本记录

## 5. issue README 最低结构

每个 issue 的 `README.md` 至少应回答下面问题：

1. 这是什么问题
2. 典型命令与现象是什么
3. 常见报错或告警是什么
4. 归因分析是什么
5. 当前提供哪些能力面
6. 如何使用
7. 如何验证
8. 相关文档是什么

建议结构：

- 现象
- 典型报错 / 告警
- 归因分析
- Guardian 解决方案
- 适用版本
- 使用方法
- 验证方式
- 相关文档

## 6. i18n 最低要求

每个 issue 都应至少提供：

- `i18n/en.json`
- `i18n/zh-CN.json`

最低必须本地化的内容：

- `meta.title`
- `meta.summary`
- 所有用户直接可见的 `preflight` / `repair` 文案

如果 issue 暂时没有完整翻译，也应保证：

- 英文可用
- 中文不出现明显缺失 key

## 7. 测试最低要求

### 修改或新增 `preflight`

至少要覆盖：

- 命中时能输出预期 finding
- 不命中或版本不适用时会跳过

### 修改或新增 `mitigation`

至少要覆盖：

- runner 能正确命中 issue
- issue 在假输入或可控输入下能走通主链路

### 修改或新增 `repair`

至少要覆盖：

- `dry-run`
- `apply`
- 版本不适用时拒绝执行

另外必须遵守 [TESTING.md](./TESTING.md) 中的环境独立性规则。

## 8. 版本范围策略

每个 issue 都应尽量声明 `appliesTo.openclaw.versionRange`。

原因：

- 上游版本升级后，某些问题可能已被修复
- guardian 不应在已无必要的版本上继续干预

建议：

- 已确认的问题版本范围写清楚
- `whenUnknown` 默认用 `inactive`
- 只有非常有把握时才使用 `active`

## 9. 与上游的边界

新增 issue 前，必须先回答：

- 这个问题能否交给上游 `OpenClaw` 修复
- 上游是否已有 `doctor` / `plugins doctor` 能力覆盖
- 本 issue 是长期补位，还是临时过渡方案

在 `issue.json` 的 `upstream` 字段里，至少应写明：

- 推荐的上游命令
- 当前覆盖状态，例如 `none` / `partial` / `full`

## 10. 新增 issue 的推荐流程

1. 先写 issue `README.md`，把问题边界写清楚
2. 再写 `issue.json`
3. 再选择并实现能力面
4. 再补 i18n
5. 再补测试
6. 最后更新根 `README.md` 与 `CHANGELOG.md`

这个顺序的目的，是先把问题讲清楚，再写实现，而不是先写代码再倒推 issue 语义。

## 11. 脚手架与模板

当前仓库已经提供：

- `templates/issue/`
- `scripts/new-issue.mjs`

最小用法：

```bash
node scripts/new-issue.mjs \
  --id example-runtime-issue \
  --alias example-issue \
  --title "Example Runtime Issue" \
  --capabilities preflight,repair
```

脚手架会生成：

- `issue.json`
- `README.md`
- `i18n/en.json`
- `i18n/zh-CN.json`
- 已启用能力面对应的实现文件

生成结果只是“最小合法骨架”，仍然需要你继续补齐：

- 真正的触发条件
- 版本范围
- 用户可见文案
- 测试
