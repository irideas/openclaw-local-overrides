# `OpenClaw Guardian` 重构设计文档

## 文档状态

- 状态：提案
- 目的：用于确认项目重构方向与执行计划
- 当前实施状态：未开始代码重构

## 1. 背景

当前仓库 `openclaw-local-overrides` 已经验证了一件事：

- 对 `OpenClaw` 的一些本地运行时问题，确实可以通过“极小侵入”的本地覆盖机制解决
- 典型案例是 `openai-codex-auth-proxy`

但当前仓库的中心仍然偏向“实现手段”：

- `runtime`
- `bootstrap`
- `modules`

这套结构可以工作，但它还不够适合作为一个长期演进的项目。  
因为用户真正关心的不是“这里有多少种技术实现”，而是：

- 我遇到了什么问题
- 这个问题能不能尽早发现
- 当前有没有可用修复
- 修复是否安全、可回滚、可验证

所以重构的核心目标不是继续扩大 `runtime/modules`，而是把整个项目切换为：

> 以问题现象为中心的 `OpenClaw` 本地治理框架

---

## 2. 重构目标

### 2.1 总体目标

把当前项目从“本地覆盖脚本集合”升级为：

> `OpenClaw` 问题现象库 + 运行时缓解 + 执行前预检 + 显式修复 的统一框架

### 2.2 需要解决的问题

重构后，项目应当能同时支持这几类场景：

1. 运行时链路问题
   例如：
   - `openai-codex` OAuth 在代理环境下的 token 交换失败

2. 执行前即可发现的问题
   例如：
   - `feishu` 外置插件与内置插件同 ID 冲突
   - `plugins.allow` 缺失导致非内置插件自动发现

3. 本地状态冲突或持久化配置问题
   例如：
   - 目录冲突
   - 配置残留
   - 需要备份后再修复的文件系统状态

### 2.3 项目级要求

重构后的项目必须满足：

- 以问题现象为中心组织内容
- 与 `OpenClaw` 现有生态保持清晰边界
- 输出文案支持多语言，且尽量跟随当前运行时语言
- 允许渐进扩展，不要求一次做完所有能力
- 不直接修改全局安装的 `OpenClaw`
- 修复动作必须可控、可审计、可回滚

---

## 3. 项目命名建议

## 3.1 为什么不再使用 `openclaw-local-overrides`

`openclaw-local-overrides` 更像“实现手段”的名字。  
它强调的是：

- 本地
- 覆盖

但没有体现：

- 问题发现
- 预检
- 修复
- 守护
- 现象库

当项目未来不只包含 `runtime override` 时，这个名字会越来越局限。

## 3.2 为什么不直接使用 `doctor`

`OpenClaw` 自己已经有：

- `openclaw doctor`
- `openclaw plugins doctor`

因此如果本项目也把一级概念命名为 `doctor`，会带来两个问题：

- 容易让用户误解为上游官方内建能力
- 会和上游已有的“健康检查 / 引导修复”心智模型重叠

本项目应当是上游 `doctor` 的补充层，而不是复刻一个私有 doctor。

## 3.3 推荐名称

推荐将项目名升级为：

- `openclaw-guardian`

推荐理由：

- `Guardian` 既包含预警，也包含保护和修复
- 比 `tools`、`repair` 更像一个完整项目
- 比 `doctor` 更不容易与上游命令冲突
- 能包容 `issues`、`preflight`、`runtime`、`repair` 这几条能力线

中文可以理解为：

- `OpenClaw 守护者`
- 或 `OpenClaw 安全卫士`

本文档后续均以 `openclaw-guardian` 作为目标名称讨论。

---

## 4. 核心理念：`issues` 是中心，其他都是手段

这是本次重构最关键的设计决策。

### 4.1 一等公民是 `issues`

项目的中心应当是“问题现象”，而不是：

- `runtime module`
- `preflight hook`
- `repair script`

也就是说，项目的组织方式应该是：

```text
问题现象 -> 检测 -> 提示 -> 缓解/修复 -> 验证
```

而不是：

```text
有一个 hook -> 看能不能顺便修某个问题
```

### 4.2 `runtime`、`preflight`、`repair` 是 issue 的能力面

每个 issue 可以按需具备以下能力：

- `preflight`
  命令执行前检查与提示
- `runtime`
  进程内运行时缓解
- `repair`
  显式修复动作

并不是每个 issue 都必须同时具备这三种能力。

例如：

- `openai-codex-oauth-proxy-failure`
  主要依赖 `runtime`，可辅以 `preflight`
- `plugins-feishu-duplicate-id`
  主要依赖 `preflight + repair`

---

## 5. 与 `OpenClaw` 现有体系的关系

## 5.1 边界原则

重构后的 `openclaw-guardian` 应遵循：

- 能交给上游 `openclaw doctor` 处理的，不重复实现
- 上游未覆盖、覆盖不够细、或本地环境特有的问题，由 `guardian` 补齐

### 5.2 三层关系

建议采用如下分层认知：

1. 上游 `OpenClaw`
   提供官方能力、官方修复、官方配置流

2. 上游 `doctor/plugins doctor`
   提供通用健康检查与官方建议修复

3. 本项目 `guardian`
   提供问题现象库、本地预警、运行时缓解与定向修复

### 5.3 用户体验目标

理想状态下，用户体验应是：

1. 照常运行 `openclaw ...`
2. 在必要时收到高信号的本地问题提示
3. 获得明确的下一步动作：
   - 上游命令
   - 本项目的 `repair`
   - 或仅提示风险

这要求 `guardian` 不与上游抢角色，而是补充上游。

---

## 6. 多语言输出设计

这是本次重构新增的核心要求。

## 6.1 目标

所有面向用户的文本输出都应支持多语言，并遵循：

- 优先与当前运行时语言保持一致
- 当前至少支持：
  - 简体中文 `zh-CN`
  - 英文 `en`
- 如果无法识别语言，兜底使用英文
- 未来允许扩展更多语言，但本阶段不强求一次到位

## 6.2 适用范围

多语言输出适用于：

- `preflight` 提示
- `repair` 计划说明
- `repair --dry-run` 与 `repair --apply` 输出
- issue 摘要说明
- 面向用户的警告、建议与修复结果

不要求本阶段对所有内部日志做自然语言本地化。

## 6.3 语言解析优先级

建议运行时语言解析顺序为：

1. `OPENCLAW_GUARDIAN_LANG`
   项目显式覆盖
2. 未来如 `OpenClaw` 提供明确运行时语言注入，则优先使用注入值
3. `LC_ALL`
4. `LC_MESSAGES`
5. `LANG`
6. 默认回退到 `en`

示例：

- `zh_CN.UTF-8` -> `zh-CN`
- `zh-CN` -> `zh-CN`
- `en_US.UTF-8` -> `en`
- 其他未知值 -> `en`

## 6.4 文本存储方式

建议采用消息目录而不是把人类可读文案散落在代码中。

例如：

```text
issues/
  plugins-feishu-duplicate-id/
    i18n/
      en.json
      zh-CN.json
```

消息文件按 key-value 组织，例如：

```json
{
  "summary": "Duplicate feishu plugin id detected.",
  "reason": "Builtin and external feishu plugins share the same id.",
  "suggestion.repair": "Run guardian repair plugins-feishu-duplicate-id --dry-run."
}
```

## 6.5 日志与控制台分离

建议采用“两层输出”：

1. 机器可消费的结构化日志
   - 保持稳定字段
   - 使用 issue id、event code、severity、params
   - 不依赖本地化文本

2. 面向用户的控制台输出
   - 使用当前语言渲染
   - 由消息模板生成

这能保证：

- 自动化工具可以稳定处理日志
- 用户看到的是本地化、可读的提示

---

## 7. 目标架构

## 7.1 总体结构

重构后，建议采用如下结构：

```text
openclaw-guardian/
  README.md
  CHANGELOG.md
  AGENTS.md
  LICENSE
  docs/
    architecture.md
    TESTING.md
    MANUAL-E2E.md
    GUARDIAN-REDESIGN.md
  core/
    bootstrap/
      bash-init.bash
      node-entry.mjs
    issue-loader.mjs
    locale.mjs
    i18n-renderer.mjs
    preflight-runner.mjs
    runtime-runner.mjs
    repair-runner.mjs
    logger.mjs
  issues/
    openai-codex-oauth-proxy-failure/
      issue.json
      README.md
      preflight.mjs
      runtime.mjs
      i18n/
        en.json
        zh-CN.json
      tests/
    plugins-feishu-duplicate-id/
      issue.json
      README.md
      preflight.mjs
      repair.mjs
      i18n/
        en.json
        zh-CN.json
      tests/
  runtime/
    bootstrap/
    config/
  cli/
    guardian.mjs
  test/
```

## 7.2 为什么保留 `runtime/`

虽然项目中心将变成 `issues/`，但仍建议保留一个轻量的 `runtime/` 目录，原因是：

- 当前 `.openclaw/local-overrides` 软链接模型已经验证可行
- `runtime/` 适合作为部署表面
- 它只承载：
  - 启动入口
  - 配置入口
  - 向 `core/` 与 `issues/` 分发控制权

也就是说：

- `runtime/` 是部署层
- `core/` 是执行层
- `issues/` 是问题知识层

## 7.3 迁移期兼容建议

第一阶段不建议改动运行时落盘路径：

- 继续保留 `~/.openclaw/local-overrides`

原因：

- 已经接入现有 shell
- 已经与当前 OpenClaw 运行方式配合验证通过
- 可以先完成项目内部重构，再决定是否需要未来调整运行时目录名

---

## 8. issue 模型设计

## 8.1 `issue.json` 基础字段

每个 issue 必须有一个 `issue.json`。

建议结构：

```json
{
  "id": "plugins-feishu-duplicate-id",
  "title": "Builtin and external feishu plugin share the same id",
  "category": "plugins",
  "severity": "warning",
  "summary": "Detect duplicate feishu plugin registration and guide users to repair it.",
  "capabilities": {
    "preflight": true,
    "runtime": false,
    "repair": true
  },
  "triggers": {
    "commands": [
      ["gateway", "restart"],
      ["gateway", "start"],
      ["plugins", "list"],
      ["plugins", "doctor"]
    ]
  },
  "upstream": {
    "recommendedCommands": ["openclaw plugins doctor"],
    "coverage": "partial"
  }
}
```

## 8.2 建议字段说明

- `id`
  issue 的稳定标识
- `title`
  英文标题，作为机器与文档中的稳定名称
- `category`
  问题类别，例如：
  - `auth`
  - `plugins`
  - `gateway`
  - `network`
  - `models`
- `severity`
  例如：
  - `info`
  - `warning`
  - `error`
- `capabilities`
  issue 具备哪些能力：
  - `preflight`
  - `runtime`
  - `repair`
- `triggers.commands`
  哪些命令可能触发该 issue 的检查或缓解
- `upstream.recommendedCommands`
  推荐先参考的上游命令
- `upstream.coverage`
  上游覆盖程度：
  - `none`
  - `partial`
  - `full`

## 8.3 issue README 的职责

每个 issue 自己的 `README.md` 应回答：

- 这是哪个问题
- 典型症状是什么
- 什么时候会出现
- 本 issue 提供哪些能力
- 如何验证
- 如何关闭

---

## 9. 三类能力的职责边界

## 9.1 `preflight`

定位：

- 命令执行前检查
- 尽量早发现问题
- 不直接改持久化状态
- 提供清晰提示和下一步动作

适合的问题：

- 插件重复安装
- 配置明显冲突
- 高概率失败的运行前环境

不适合的问题：

- 必须深入进程内部才能判断的问题
- 需要在网络请求阶段动态修补的问题

## 9.2 `runtime`

定位：

- 进程内运行时缓解
- 影响面尽量窄
- 不直接修改持久化配置

适合的问题：

- OAuth / 代理 / `fetch` / TLS 类异常
- 某个固定端点、固定命令的运行时失败

## 9.3 `repair`

定位：

- 显式执行的修复器
- 默认 `--dry-run`
- 在 `--apply` 时修改状态

适合的问题：

- 移动目录
- 调整 `openclaw.json`
- 清理残留配置
- 写入 allowlist
- 备份后再修复

修复器要求：

- 必须有摘要输出
- 必须支持 dry-run
- 必须记录修复日志
- 必须尽量可回滚

---

## 10. 两个样板 issue

## 10.1 `openai-codex-oauth-proxy-failure`

问题性质：

- 运行时问题为主

建议能力：

- `runtime`: 必须
- `preflight`: 可选
- `repair`: 暂不作为主能力

可能的 `preflight` 提示：

- 当前代理变量为空
- 当前代理格式不符合预期
- 当前语言 / 日志 / 运行环境信息

主要价值仍在 `runtime`：

- 安装代理能力
- 必要时对固定端点做窄回退

## 10.2 `plugins-feishu-duplicate-id`

问题性质：

- 本地状态冲突问题

建议能力：

- `preflight`: 必须
- `repair`: 必须
- `runtime`: 不需要

`preflight` 应做的事：

- 检测内置 `feishu` 与外置 `feishu` 是否同 ID 冲突
- 检测 `plugins.allow` 是否为空
- 检测 `extensions/feishu` 是否存在
- 检测 `openclaw.json` 中是否存在额外安装引用

`repair` 应做的事：

- 先做 `--dry-run`
- 备份外置插件目录到 `.extensions-backup/`
- 调整 `plugins.allow`
- 清理多余安装引用
- 输出修复前后摘要

---

## 11. 输出与交互设计

## 11.1 默认交互原则

建议输出遵循：

- 先给结论
- 再给原因
- 再给建议动作
- 再给修复入口

例如 `preflight` 命中时：

```text
[warning] plugins-feishu-duplicate-id
检测到内置 feishu 与外置 feishu 使用相同 plugin id。
这会导致 gateway/plugin 加载时出现 duplicate plugin id warning。
建议先运行：openclaw plugins doctor
如需本地修复：guardian repair plugins-feishu-duplicate-id --dry-run
```

## 11.2 不自动修复的原则

以下动作不应在 `preflight` 阶段自动执行：

- 改写 `openclaw.json`
- 移动插件目录
- 删除任何扩展目录

原因：

- 这些动作带持久化副作用
- 应当显式交由 `repair` 执行

## 11.3 修复命令建议

建议项目未来提供一个显式入口，例如：

```bash
guardian issue list
guardian issue show plugins-feishu-duplicate-id
guardian repair plugins-feishu-duplicate-id --dry-run
guardian repair plugins-feishu-duplicate-id --apply
```

这里的 `guardian` 只是目标 CLI 名称，具体实现可以后续决定。

---

## 12. 执行计划

本次重构建议按阶段实施。

## Phase 0：冻结方向与命名

目标：

- 确认项目目标名称
- 确认 `issues` 为中心模型
- 确认多语言输出要求

交付物：

- 本设计文档
- 命名与边界结论

完成标准：

- 设计方案确认
- 开始进入仓库重构

## Phase 1：项目骨架重构

目标：

- 在不破坏当前可用性的前提下，为 `issues` 中心模型搭骨架

主要动作：

- 新建 `core/`
- 新建 `issues/`
- 把现有 `runtime/bootstrap` 收敛为只做接入与分发
- 保留 `runtime/` 作为运行时部署表面

交付物：

- 新目录结构
- issue loader
- preflight/runtime/repair runner 的空骨架

完成标准：

- 旧逻辑仍可运行
- 新结构已具备继续迁移的基础

## Phase 2：迁移 `openai-codex-auth-proxy`

目标：

- 把当前 runtime module 迁移为第一个正式 issue

主要动作：

- 新建 issue：
  `openai-codex-oauth-proxy-failure`
- 把现有 `preload-hook.mjs` 迁入 issue 的 `runtime.mjs`
- 增加 issue 元数据与 `i18n/en.json`、`i18n/zh-CN.json`

交付物：

- 第一个 issue 目录
- runtime runner 能命中该 issue
- 现有测试迁移完成

完成标准：

- 原有 OAuth 修复能力不退化
- 测试继续通过

## Phase 3：实现多语言基础层

目标：

- 让 core 层支持语言解析与本地化输出

主要动作：

- 增加 `locale.mjs`
- 增加 `i18n-renderer.mjs`
- 定义消息 key 与参数插值机制
- 规范控制台输出与结构化日志分层

交付物：

- 最低支持：
  - `zh-CN`
  - `en`
- 兜底为英文

完成标准：

- 同一个 issue 在不同语言环境下输出不同文案
- 未命中语言时稳定回退 `en`

## Phase 4：引入第一个 `preflight + repair` issue

目标：

- 用 `plugins-feishu-duplicate-id` 作为“问题现象库”样板

主要动作：

- 新建 issue：
  `plugins-feishu-duplicate-id`
- 实现：
  - `preflight.mjs`
  - `repair.mjs`
- 支持：
  - `--dry-run`
  - `--apply`

交付物：

- issue 级文档
- preflight 提示
- repair 执行流
- 对应测试

完成标准：

- 能在 `gateway restart` 前提前发现问题
- 能输出本地化诊断文案
- 能安全执行 dry-run 与 apply

## Phase 5：显式 CLI 与 issue 现象库视图

目标：

- 为项目增加显式入口，而不只依赖隐式 wrapper

主要动作：

- 增加 `cli/guardian.mjs`
- 支持：
  - `issue list`
  - `issue show`
  - `repair <id> --dry-run`
  - `repair <id> --apply`

交付物：

- 明确的用户入口
- issue 浏览与修复体验

完成标准：

- 用户可以不依赖 wrapper 直接使用项目能力

## Phase 6：仓库改名与对外整理

目标：

- 从 `openclaw-local-overrides` 平滑迁移到 `openclaw-guardian`

主要动作：

- 重写 README
- 更新 package 名称、仓库说明、文档链接
- 整理 issue 模板与贡献说明

交付物：

- 正式对外项目形态

完成标准：

- 项目定位、目录结构、文档、命令名一致

---

## 13. 测试计划

## 13.1 测试分层保持不变，但对象改成 issue

仍保留三层验证：

1. `unit`
2. `integration`
3. `manual-e2e`

但测试对象从“module”转成“issue”。

## 13.2 测试重点

### 对 core 层

- issue 发现
- issue schema 校验
- 语言解析
- 本地化渲染
- preflight/runtime/repair runner 调度

### 对 issue 层

- issue 元数据完整性
- 中文 / 英文文案存在
- preflight 命中逻辑
- runtime 生效逻辑
- repair dry-run / apply 逻辑

### 对 `openai-codex-oauth-proxy-failure`

- 保留现有假 token 交换集成测试

### 对 `plugins-feishu-duplicate-id`

- 增加：
  - preflight 命中测试
  - repair dry-run 测试
  - repair apply 测试

---

## 14. 风险与控制

## 14.1 主要风险

1. 结构重构期间损坏现有可用能力
2. 运行时入口与 issue 模型之间职责不清
3. 多语言支持做得过重，影响首阶段推进速度
4. 修复器副作用过大，影响用户本地状态

## 14.2 控制策略

1. 先迁移一个现有成功案例
   先把 `openai-codex-auth-proxy` issue 化
2. 先做中英双语，不一次扩展更多语言
3. repair 必须先做 `dry-run`
4. 保持 `runtime/` 运行时入口稳定，避免一次动太多

---

## 15. 非目标

本次重构不追求：

- 替代 `OpenClaw` 官方 `doctor`
- 一次性覆盖所有 `OpenClaw` 本地问题
- 一次性支持所有语言
- 一开始就改变 `.openclaw/local-overrides` 现有运行时路径

---

## 16. 建议结论

建议确认以下结论后开始实施：

1. 项目目标名称采用 `openclaw-guardian`
2. `issues` 成为项目一等公民
3. `preflight`、`runtime`、`repair` 作为 issue 的能力面
4. 用户可见文本至少支持：
   - `zh-CN`
   - `en`
   且默认跟随当前运行时语言，兜底英文
5. 第一批重构 issue 为：
   - `openai-codex-oauth-proxy-failure`
   - `plugins-feishu-duplicate-id`

如果以上结论确认，就可以按本设计文档进入代码重构阶段。
