// `preflight` 是下一阶段要重点落地的能力：
// - 在命令执行前尽早发现高概率问题
// - 输出高信号提示
// - 指向对应的 repair 或上游 doctor
//
// 当前先保留空骨架，方便 issue / core 结构先稳定下来。

export async function runPreflights() {
  return [];
}
