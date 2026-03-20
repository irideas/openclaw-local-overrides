# `openclaw-local-overrides`

`openclaw-local-overrides` 是一个面向 `OpenClaw` 的本地覆盖层仓库。
它的目的不是替代上游，也不是重新打包 `OpenClaw`，
而是在不直接修改全局安装包的前提下，
为一些真实环境中的运行时错误提供可维护、可回滚、可逐步沉淀的修复方案。

仓库版本：`0.7.2`

## 这是什么

这个仓库解决的是这类问题：

- `OpenClaw` 在某些网络、代理、系统环境下会出现运行时错误
- 这些错误通常不是业务配置写错，而是执行链路中的实现细节与本地环境不兼容
- 用户需要一个能立即落地的修复层，而不是等待上游版本发布

这类修复往往有几个特点：

- 影响范围应当尽量小
- 必须能快速启用和关闭
- 不应直接污染全局安装的 `OpenClaw`
- 后续如果上游修复，应该能方便地移除

所以这个项目的定位是：

> 为 `OpenClaw` 提供一层本地运行时覆盖机制，
> 把“特定错误的修复”做成独立模块，
> 以最小侵入方式接入实际运行环境。

## 解决什么问题

当前仓库内置的模块是：

- [openai-codex-auth-proxy](./runtime/modules/openai-codex-auth-proxy/README.md)

它解决的具体问题是：

- `openclaw models auth login --provider openai-codex`
  在某些 HTTP 代理环境下，
  浏览器授权已经成功，
  但 CLI 阶段的 `oauth/token` 交换仍然失败

这个问题的典型表现包括：

- `unsupported_country_region_territory`
- `fetch failed`
- 代理明明可用，但 `OpenClaw` 的 `openai-codex` OAuth 流程仍然无法完成

## 为什么需要这个项目

直接修改上游安装包并不是一个理想方案，因为：

- 升级后容易被覆盖
- 本地改动难以审计和分享
- 多个修复点会逐渐堆积成不可维护的私有分叉

而把修复做成独立仓库有这些好处：

- 修复逻辑可以单独版本化
- 可以通过 Git 管理和分享
- 可以通过模块化方式精确控制影响范围
- 运行时只接入真正需要的部分

## 核心思路

这个仓库的核心思路不是“重写 `OpenClaw`”，而是：

1. 保留原始 `OpenClaw` 安装不动
2. 在本地 shell / Node 进程启动点做一层极薄的接入
3. 根据当前命令匹配具体模块
4. 只在命中的场景下注入修复逻辑

在当前实现里，对应的是：

- 一个统一 `runtime/bootstrap` 入口
- 一组可启停的 `runtime/modules`
- 一份集中配置 `runtime/config/enabled-modules.json`

这意味着：

- 普通命令不会被无差别重写
- 每个修复方案都可以独立维护
- 后续新增别的 `OpenClaw` 本地修复时，不需要再重新设计接入方式

相关文档：

- [CHANGELOG.md](./CHANGELOG.md)
- [AGENTS.md](./AGENTS.md)
- [TESTING.md](./docs/TESTING.md)
- [MANUAL-E2E.md](./docs/MANUAL-E2E.md)

## 目录结构

```text
openclaw-local-overrides/
  .github/
    workflows/
      test.yml
  AGENTS.md
  CHANGELOG.md
  LICENSE
  docs/
    MANUAL-E2E.md
    TESTING.md
  runtime/
    bootstrap/
      bash-init.bash
      logger.mjs
      module-runtime.mjs
      node-preload-entry.mjs
    config/
      enabled-modules.json
    modules/
      openai-codex-auth-proxy/
        module.json
        preload-hook.mjs
        README.md
  test/
    *.test.mjs
  package.json
```

## 设计原则

- 不直接修改全局安装的 `openclaw`
- 尽量不依赖临时调试目录
- 统一接入方式
- 让“命令匹配、模块启停、日志套路”变成公共能力
- 把“仓库根目录”和“运行时目录”明确分开
- 把升级后的维护成本尽量留在本仓库内部

## 当前模块

- [openai-codex-auth-proxy](./runtime/modules/openai-codex-auth-proxy/README.md)
  运行时路径：`runtime/modules/openai-codex-auth-proxy`
  用于修正 `openai-codex` OAuth 在代理环境下的 token 交换异常。

## 模块约定

每个模块遵循这一组公共约定：

- `runtime/modules/<module-id>/module.json`
  声明模块 id、匹配规则、入口文件和日志文件
- `runtime/modules/<module-id>/preload-hook.mjs`
  实现模块自己的 Node preload 行为
- `runtime/config/enabled-modules.json`
  负责决定哪些模块被统一运行时启用

`module.json` 已支持的字段有：

- `id`
- `kind`
- `enabledByDefault`
- `match.argvAll`
- `match.provider`
- `entry.preload`
- `env.variables`
- `logging.file`

仓库采用 [MIT License](./LICENSE)。

## 安装步骤

下面示例中的 `<repo-dir>` 表示你自己选择的 Git 仓库存放目录。
它可以是任意合适的位置，例如：

- `$HOME/dev/openclaw-local-overrides`
- `$HOME/workspace/openclaw-local-overrides`
- `/opt/openclaw-local-overrides`

### 1. 克隆仓库到工程目录

```bash
git clone git@github.com:irideas/openclaw-local-overrides.git "<repo-dir>"
```

### 2. 建立运行时软链接

运行时目录固定使用：

```text
$HOME/.openclaw/local-overrides
```

但这个目录不直接承载整个 Git 仓库，而是软链接到仓库内的 `runtime/`：

```bash
ln -sfn "<repo-dir>/runtime" "$HOME/.openclaw/local-overrides"
```

### 3. 在 Shell 启动文件中接入统一入口

在 `~/.bash_profile` 中增加：

```bash
[ -f "$HOME/.openclaw/local-overrides/bootstrap/bash-init.bash" ] && \
  source "$HOME/.openclaw/local-overrides/bootstrap/bash-init.bash"
```

### 4. 重新加载 Shell

```bash
source ~/.bash_profile
```

### 5. 配置模块启停覆盖

编辑：

```text
$HOME/.openclaw/local-overrides/config/enabled-modules.json
```

配置文件的职责是“覆盖默认行为”，例如：

```json
{
  "enabledModules": [],
  "disabledModules": []
}
```

默认启用状态由各模块自己的 `module.json` 决定：

- `enabledByDefault: true`
  表示模块在未被显式禁用时默认生效
- `enabledByDefault: false`
  表示模块必须显式加入 `enabledModules`

因此配置求值顺序是：

1. 先发现 `modules/` 下所有模块
   这里的 `modules/` 指 `runtime/modules/`
2. 先取所有 `enabledByDefault: true` 的模块
3. 再合并 `enabledModules`
4. 最后减去 `disabledModules`

### 6. 验证统一接入是否生效

```bash
type -a openclaw
```

如果接入成功，输出中通常会先看到：

```text
openclaw is a function
```

然后可继续检查运行日志：

```bash
tail -n 20 "$HOME/.openclaw/logs/local-overrides/runtime.log"
```

## 运行原理

1. `runtime/bootstrap/bash-init.bash`
   在 shell 中接管 `openclaw`
2. 每次执行 `openclaw ...` 时，
   统一注入 `runtime/bootstrap/node-preload-entry.mjs`
3. `runtime/bootstrap/node-preload-entry.mjs`
   发现模块并读取 `runtime/config/enabled-modules.json`
4. 它根据当前 `process.argv`
   与默认启用规则求值得到候选模块
5. 命中的模块再加载自己的 `preload-hook.mjs`

因此后续新增模块时，只需要：

- 增加 `runtime/modules/<module-id>/module.json`
- 增加 `runtime/modules/<module-id>/preload-hook.mjs`
- 按需设置 `enabledByDefault`
- 如有需要，再在 `runtime/config/enabled-modules.json` 中显式启用或禁用

不需要再修改 `~/.bash_profile`

## 日志

统一运行日志：

```text
$HOME/.openclaw/logs/local-overrides/runtime.log
```

模块日志：

```text
$HOME/.openclaw/logs/local-overrides/<module-log-file>
```

例如本仓库的 `openai-codex-auth-proxy` 模块会写入：

```text
$HOME/.openclaw/logs/local-overrides/openai-codex-auth-proxy.log
```

如果需要在测试或调试中隔离日志目录，可以临时覆盖：

```bash
export OPENCLAW_LOCAL_OVERRIDES_LOG_DIR=/tmp/openclaw-local-overrides-logs
```

## 测试

仓库包含：

- 公共运行时单测
- `openai-codex-auth-proxy` 的集成测试
- 最小 GitHub Actions 测试工作流

默认运行：

```bash
cd "<repo-dir>"
npm test
```

也可以分别执行：

```bash
npm run test:unit
npm run test:integration
npm run test:all
```

说明：

- `npm test`
  只执行 `unit`
- `npm run test:integration`
  需要真实代理
- `npm run test:all`
  本地一次性执行全部自动化测试

如果要执行 `integration` 或 `test:all`，需要准备代理环境。
如需显式指定集成测试使用的代理，可以设置：

```bash
export OPENCLAW_PROXY_TEST_PROXY_URL=http://<your-http-proxy-host>:<port>
```

测试当前覆盖：

- 模块 manifest 校验
- 模块发现与默认启用策略
- 统一 preload 路由
- 统一 bash 入口到 `openai-codex-auth-proxy` 的集成路径
- 人工 E2E 清单见 [MANUAL-E2E.md](./docs/MANUAL-E2E.md)

## GitHub Actions

仓库当前提供：

- `push` 到 `main` 时自动执行 `unit`
- `pull_request` 时自动执行 `unit`
- `workflow_dispatch` 时可选执行 `integration`

工作流文件：

```text
.github/workflows/test.yml
```

如果你希望在 GitHub 上运行集成测试，需要在仓库里配置 secret：

```text
OPENCLAW_PROXY_TEST_PROXY_URL
```

GitHub 路径：

```text
Repo Settings -> Secrets and variables -> Actions
```

配置完后，可以在：

```text
Repo -> Actions -> ci -> Run workflow
```

手动勾选 `run_integration` 来执行集成测试。

如果你只需要“提交代码后自动跑测试”，当前默认已经满足，
前提是仓库已启用 GitHub Actions。
