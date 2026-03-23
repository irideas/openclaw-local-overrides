# Testing Strategy

本文档描述 `openclaw-guardian` 的测试分层策略。

目标不是追求“所有东西都自动化”，而是把不同性质的验证拆开：

- 纯逻辑问题，用稳定可重复的自动化测试覆盖
- 真实网络链路问题，用明确标注的集成测试覆盖
- 依赖浏览器、账户状态和外部风控的流程，用手工验证覆盖

这样做的原因是：

- 本仓库的部分 issue 本质上是在修复真实环境中的网络行为
- 这类行为很难用纯单测充分证明
- 如果强行把外部依赖塞进 `unit test`，会让测试不稳定、不可重复，也会让 CI 失真

## 总体原则

测试按 4 层划分：

1. `unit`
2. `integration-local`
3. `integration-remote`
4. `manual-e2e`

这 4 层不是互相替代，而是职责不同。

## 1. Unit

### 定义

`unit` 只验证纯逻辑，不依赖：

- 真实网络
- 真实代理
- 浏览器
- 本地 `openclaw` 登录状态
- OpenAI 账号状态

### 适合覆盖的内容

- issue schema 校验
- issue 发现
- 默认启用 / 显式启用 / 显式禁用规则
- CLI 参数匹配规则
- provider 提取逻辑
- 日志路径推导
- 运行时路径推导
- `curl` 响应头解析
- 环境变量解析与优先级

### 要求

- 必须可离线运行
- 必须在 CI 中自动执行
- 必须不要求任何 secret 或代理地址
- 必须不依赖开发者本机是否安装了 `openclaw`
- 必须不依赖 `PATH`、`HOME`、用户目录状态或 `process.env` 中的偶然值
- 如果公共 runner 已经把路径、版本或环境解析后注入 `context`，issue 测试必须优先使用这些注入值，而不是自行回退到本机探测逻辑

### 环境独立性要求

`unit` 最容易出现一种伪通过：

- 本机因为已经安装了 `openclaw`
- 或者本机 `PATH`、`HOME`、日志目录、用户配置刚好满足某些假设
- 导致测试即使写错了依赖边界，也依然会在开发机上通过
- 但到了 GitHub Actions 的干净环境里立即失败

这类问题在 `openclaw-guardian` 里必须被视为测试设计缺陷，而不是“CI 偶发问题”。

因此，`unit` 层必须遵守下面这些规则：

- 需要 `OpenClaw` 安装目录时，优先使用 runner 注入的 `context.openclawRoot`
- 需要 `OpenClaw` 版本时，优先使用 runner 注入的 `context.openclawVersion`
- 需要 `OpenClaw` home 或日志目录时，优先使用测试显式传入的临时目录
- 不在 `unit` 里把 `process.env` 当成唯一事实来源
- 不在 `unit` 里依赖 `type -P openclaw`、用户真实运行时目录或全局安装状态

如果某段逻辑必须保留自动探测分支：

- 那么该分支应被视为运行时兜底逻辑
- 单测仍应优先验证“显式注入值优先生效”

### 近期案例

`plugins-feishu-duplicate-id` 的 `preflight` 曾经直接读取 `process.env` 并回退到本机 `openclaw` 安装路径。
这导致：

- 开发机因为装了全局 `openclaw`，测试通过
- GitHub `ubuntu-latest` runner 没有同样的本机状态，测试失败

后续修复方式是：

- 让检测逻辑优先使用 runner 传入的 `context.openclawRoot`
- 再补一条定向单测，明确要求优先级不能回退

这类案例后续不应再次出现。

### 当前对应

- [issue-loader.test.mjs](../test/issue-loader.test.mjs)
- [preflight-runner.test.mjs](../test/preflight-runner.test.mjs)
- [repair-runner.test.mjs](../test/repair-runner.test.mjs)

## 2. Integration-Local

### 定义

`integration-local` 验证：

- 真实代码路径
- 真实运行时装配
- 真实代理链路
- 但仍使用“假业务输入”或“可控输入”

它的目标不是证明整个 OAuth 流程完成，而是证明：

> issue 的接管机制、代理注入和回退逻辑，确实在真实环境里被执行了

### 适合覆盖的内容

- 统一 mitigation 路由是否能命中 issue
- Bash 入口是否能正确注入统一 preload
- `curl fallback` 是否真的生效
- 对假 `oauth/token` 请求是否返回预期的 `401 token_expired`
- 日志中是否出现关键事件

### 特点

- 依赖真实代理
- 依赖真实外部网络
- 不依赖真实浏览器授权成功
- 不依赖真实 token 落盘

### 当前对应

- [openai-codex-oauth-proxy-failure.integration.test.mjs](../test/openai-codex-oauth-proxy-failure.integration.test.mjs)

### 结论

这类测试不应归类为 `unit`。

## 3. Integration-Remote

### 定义

`integration-remote` 指在远端 CI 环境中运行的真实网络集成测试。

它与 `integration-local` 的差异不在测试目标，而在运行位置：

- `integration-local` 通常在开发者本机执行
- `integration-remote` 在 GitHub Actions 或其他 CI 中执行

### 使用前提

必须具备可用的远端代理配置，例如：

- GitHub repository secret：
  `OPENCLAW_GUARDIAN_TEST_PROXY_URL`

### 适合覆盖的内容

- 假 `oauth/token` 请求的真实远端代理行为
- 统一 preload 路由在 CI 环境里的行为是否与本地一致

### 不适合覆盖的内容

- 真实浏览器授权
- 真实 `localhost` 回调
- 真实账户 OAuth 完整闭环

### CI 建议

- 不应在每次 `push` 都自动执行
- 更适合：
  - `workflow_dispatch`
  - 或专门的手动 job

## 4. Manual-E2E

### 定义

`manual-e2e` 用于验证完整真实业务链路，例如：

```bash
openclaw models auth login --provider openai-codex
```

然后由人工完成：

- 浏览器登录
- 授权确认
- 回调接收
- 最终 token 落盘验证

### 这层为什么必须保留

因为 `openai-codex-oauth-proxy-failure` 的根本目标不是“假 token 返回 401”，
而是：

> 真实 OAuth 在真实环境中最终成功

这个目标天然受以下因素影响：

- 浏览器行为
- 本地回调端口
- OpenAI 风控
- 账户状态
- 代理出口状态
- 地区识别

这些都不适合硬塞进自动化 CI。

### 结论

对这类 issue 来说，`manual-e2e` 不是失败，而是必要层。

## 为什么 `openai-codex-oauth-proxy-failure` 不能只靠 Unit Test 证明

因为这个 issue 的真正价值不是一个纯函数结果，而是一个真实网络行为：

- `openclaw` CLI 的真实执行路径
- `EnvHttpProxyAgent` 的真实代理接管
- `curl fallback` 的真实外部请求行为
- OpenAI `oauth/token` 的真实响应

单测最多只能证明：

- 逻辑没写错
- 条件判断没写错
- 数据解析没写错

但它无法证明：

- 当前代理真的可用
- `undici` 与 `curl` 在当前网络下真的表现不同
- 真实 OAuth 最终真的能成功

因此，对这个 issue 的正确策略不是：

> 把所有验证都做成 unit test

而是：

> 把能稳定自动化的部分做成 unit，
> 把真实网络行为放进 integration，
> 把完整授权闭环留给 manual-e2e

## 测试执行方式

当前推荐的测试划分如下：

### 自动执行

- `npm test`

用途：

- CI 默认门禁
- PR 基本回归保护

说明：

- `npm test` 当前等价于 `npm run test:unit`

### 本地或手动执行

- `npm run test:integration`

用途：

- 验证真实代理链路
- 验证 issue 接管机制

执行位置：

- 在你自己的仓库根目录 `<repo-dir>` 下执行
- 不要求仓库位于任何固定目录

### 手工验证

- 真实执行：
  `openclaw models auth login --provider openai-codex`

用途：

- 验证完整 OAuth 成功
- 验证真实 token 落盘

前提：

- 仓库可以位于任意 `<repo-dir>`
- 但运行时软链接应当固定为：
  `~/.openclaw/guardian -> <repo-dir>/bridge`

具体检查清单见：

- [MANUAL-E2E.md](./MANUAL-E2E.md)

## 结论

推荐的执行方式是：

1. `npm test`
   用于默认自动化回归
2. `npm run test:integration`
   用于验证真实代理链路
3. `MANUAL-E2E`
   用于验证完整 OAuth 成功与 token 落盘
