import fs from "node:fs";
import path from "node:path";

// `guardian` 的所有结构化日志最终都走这一层。
//
// 设计目标：
// 1. 保持 JSON Lines 形状稳定，便于测试和后续机器处理
// 2. 保证日志写入失败不会打断主流程
// 3. 让上层只关注“记录什么事件”，而不是“怎么安全落盘”

export function appendJsonLine(logPath, record) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // 日志失败不应影响主流程。
  }
}

export function createJsonlLogger(logPath, source, baseFields = {}) {
  return function log(event, data = {}) {
    appendJsonLine(logPath, {
      time: new Date().toISOString(),
      source,
      event,
      ...baseFields,
      ...data,
    });
  };
}
