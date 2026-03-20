// `repair` 是显式修复入口，设计目标是：
// - 默认 dry-run
// - 明确 apply
// - 修改前后均可记录摘要
//
// 当前阶段先保留 runner 骨架，待第一个 repair issue 落地时再补执行流。

export async function runRepair() {
  throw new Error("repair runner is not implemented yet");
}
