// 旧入口保留为兼容层，避免已经接入的
// `NODE_OPTIONS=--import=...node-preload-entry.mjs`
// 在 guardian 重构后立刻失效。

await import("./node-entry.mjs");
