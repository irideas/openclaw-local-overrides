# AGENTS.md

本文件用于说明 `openclaw-local-overrides` 仓库的维护约定。

## 项目目标

本仓库专门用于维护 `OpenClaw` 的本地覆盖层。

覆盖层的基本原则：

- 不直接修改全局安装的 `openclaw`
- 尽量通过统一入口和模块化方式接管行为
- 把本地修复、回滚、测试和文档都收敛在本仓库内部

## 当前结构

```text
bootstrap/
config/
modules/
test/
README.md
CHANGELOG.md
package.json
```

说明：

- `bootstrap/`
  放统一入口、公共运行时和公共日志工具
- `config/`
  放启停覆盖配置
- `modules/`
  每个子目录代表一个具体 override 模块
- `test/`
  放单测、集成测试和测试辅助工具

## 模块约定

每个模块至少应包含：

- `module.json`
- `preload-hook.mjs`
- `README.md`

当前 manifest 约定字段：

- `id`
- `kind`
- `enabledByDefault`
- `match.argvAll`
- `match.provider`
- `entry.preload`
- `env.variables`
- `logging.file`

如果新增字段，应同时更新：

- `bootstrap/module-runtime.mjs`
  里的 schema 校验逻辑
- `test/module-runtime.test.mjs`
  里的测试
- 根 README 与模块 README

## 代码约定

- `bash` 和 `mjs` 文件应优先使用 ASCII
- 关键控制流、环境变量、日志行为、路径推导逻辑应添加简体中文注释
- 注释重点应说明“为什么这样设计”以及“这一层负责什么”，不要只复述代码字面行为
- 避免把模块特定逻辑写回 `bootstrap/`
- 公共逻辑优先收敛到 `bootstrap/`

## 测试约定

提交前至少执行：

```bash
npm test
```

如果测试依赖 HTTP 代理，应显式设置：

```bash
export HTTP_PROXY=http://<your-http-proxy-host>:<port>
export HTTPS_PROXY=http://<your-http-proxy-host>:<port>
unset ALL_PROXY
unset all_proxy
```

如需单独指定测试代理，可使用：

```bash
export OPENCLAW_PROXY_TEST_PROXY_URL=http://<your-http-proxy-host>:<port>
```

## 变更约定

- 对外可见的结构变化应更新 `README.md`
- 版本变化和重要工程里程碑应更新 `CHANGELOG.md`
- 新增模块时，优先补上单测与至少一个集成测试
- 删除兼容层前，应确保统一框架和测试都已覆盖相同行为

