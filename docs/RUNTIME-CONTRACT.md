# Runtime Contract

本文档描述 `openclaw-guardian` 的运行时接入契约。

目标是让维护者在修改 `bridge/`、`core/` 或 issue 实现时，明确每一层负责什么、
能依赖什么、不能依赖什么。

## 1. 执行总流程

当前统一入口链路如下：

1. shell 加载 `bridge/bootstrap/bash-init.bash`
2. shell 中的 `openclaw()` wrapper 为目标进程注入 `NODE_OPTIONS`
3. Node 先执行 `bridge/bootstrap/node-entry.mjs`
4. `node-entry.mjs` 依次执行：
   - `runPreflights()`
   - `runMitigations()`
5. `repair` 不走隐式接入链路，而是由 `guardian repair ...` 显式调用

## 2. 各层职责

### 2.1 `bridge/bootstrap/bash-init.bash`

职责：

- 接管 shell 中的 `openclaw`
- 解析仓库根、bridge 根、日志目录等运行时信息
- 为目标进程注入 `NODE_OPTIONS=--import=.../node-entry.mjs`
- 暴露显式 CLI：`guardian`

不负责：

- issue 匹配
- issue 业务逻辑
- 具体修复动作

### 2.2 `bridge/bootstrap/node-entry.mjs`

职责：

- 作为 Node preload 入口
- 把控制流导向 `preflight` 和 `mitigation` runner

不负责：

- issue 发现逻辑
- i18n 逻辑
- 任何 issue 专属实现

### 2.3 `core/preflight-runner.mjs`

职责：

- 发现 issue
- 读取启停配置
- 根据命令和版本范围筛选 issue
- 调用 issue 的 `runPreflight()`
- 输出用户可见提示

### 2.4 `core/mitigation-runner.mjs`

职责：

- 发现 issue
- 根据命令和版本范围筛选 issue
- 调用 issue 的 `activate()`
- 仅负责 `mitigation` 能力面

### 2.5 `core/repair-runner.mjs`

职责：

- 校验 issue 是否存在 `repair` 能力
- 校验当前版本是否适用
- 调用 issue 的 `runRepair()`
- 打印修复结果

## 3. runner 注入给 issue 的 context

当前 issue 实现可依赖的 `context` 主要包括：

- `repoRoot`
- `bridgeRoot`
- `issuesRoot`
- `openclawHome`
- `openclawRoot`
- `openclawVersion`
- `logDir`
- `issueConfigPath`
- `issueId`
- `issueDir`
- `issue`
- `locale`
- `messages`
- `t`
- `log`

不同 runner 还会额外注入：

- `argv`
- `preflightLog`
- `mitigationLog`
- `repairLog`
- `apply`

## 4. issue 实现必须遵守的约束

### 4.1 优先使用 runner 注入值

issue 实现必须优先使用 runner 注入的：

- `context.openclawRoot`
- `context.openclawVersion`
- `context.openclawHome`
- `context.logDir`

只有在这些值不存在时，才允许进入兜底探测逻辑。

### 4.2 不得把 `process.env` 当成唯一事实来源

原因：

- 运行时会显式注入 context
- 单测也会显式构造 context
- 如果 issue 实现绕过这些注入值，直接读取 `process.env`，
  很容易出现“本机能过、CI 失败”的伪通过

### 4.3 自动探测只能是兜底，不是主路径

允许的探测：

- 从当前安装目录反推 `OpenClaw` 根
- 从默认 home 推导日志目录
- 当显式值缺失时做有限探测

不允许把这类探测当成主依赖。

## 5. 日志契约

`openclaw-guardian` 的结构化日志统一走 `core/logger.mjs`，格式为 JSON Lines。

推荐日志字段：

- `time`
- `source`
- `event`
- `locale`

建议事件命名遵循：

- `<phase>_loaded`
- `issue_evaluated`
- `issue_skipped`
- `<phase>_start`
- `<phase>_done`
- `<phase>_failed`

其中 `<phase>` 可为：

- `preflight`
- `mitigation`
- `repair`

## 6. 用户可见输出契约

用户可见输出应满足：

- 尽量走 issue i18n
- 跟随当前 locale
- 当翻译缺失时回退到英文
- `preflight` 输出聚焦：
  - 现象
  - 风险
  - 建议动作
- `repair` 输出聚焦：
  - 计划
  - 已执行动作
  - 警告

## 7. 修改公共层前必须检查的事项

修改 `bridge/` 或 `core/` 前，应先确认：

1. 是否会影响所有 issue
2. 是否改变了 context 注入形状
3. 是否改变了默认日志路径
4. 是否改变了命令匹配或版本门控逻辑
5. 是否需要同步更新：
   - `ARCHITECTURE.md`
   - `TESTING.md`
   - `ISSUE-AUTHORING.md`
   - `ISSUE-SCHEMA.md`

## 8. 近期典型案例

`plugins-feishu-duplicate-id` 的 `preflight` 曾经直接依赖 `process.env`
和本机已安装的 `openclaw` 路径。

结果是：

- 开发机因为本地环境完整，测试通过
- GitHub runner 环境更干净，测试失败

这类问题的修正原则就是本文档的核心要求：

- runner 注入值优先
- 自动探测只做兜底
- 单测必须覆盖“显式注入优先生效”
