import { runRuntime } from "../../core/runtime-runner.mjs";

// `runtime/bootstrap` 这一层现在只负责把 `OpenClaw` 进程导向新的 `core/runtime-runner`。
// 具体 issue 的发现、匹配、日志和 runtime 激活逻辑都已经上移到 `core/`。

await runRuntime();
