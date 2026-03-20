// 部署表面保留这个入口，是为了让 `bridge/` 这一层保持极薄。
// 实际实现已经迁移到 `core/logger.mjs`。

export * from "../../core/logger.mjs";
