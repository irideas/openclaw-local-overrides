# `openclaw-local-overrides`

这个仓库用于存放不会直接修改上游安装包、但又需要长期保留的本地覆盖层。

当前包含：

- [openai-codex-auth-proxy](./openai-codex-auth-proxy/README.md)
  用于修正 `openclaw models auth login --provider openai-codex` 在某些代理环境下
  可能出现的 `oauth/token` 交换异常。

## 设计原则

- 不直接修改全局安装的 `openclaw`
- 尽量不依赖临时调试目录
- 尽量把作用范围收窄到具体入口
- 尽量让升级后的维护成本留在本仓库内部
