import fs from "node:fs";
import path from "node:path";

// 这里先提供一个极小可用的本地化层：
// - 从 issue 目录下的 `i18n/<locale>.json` 读取消息
// - 当前语言缺失时回退到英文
// - 仅支持基于 `{name}` 的简单参数替换
//
// 这样后续在不引入额外依赖的情况下，也能让 `preflight` / `repair`
// 统一走消息目录，而不是把中英文文案散落在代码里。

function readMessages(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

export function loadIssueMessages(issueDir, locale) {
  const localePath = path.join(issueDir, "i18n", `${locale}.json`);
  const fallbackPath = path.join(issueDir, "i18n", "en.json");
  const localized = readMessages(localePath);
  const fallback = locale === "en" ? {} : readMessages(fallbackPath);
  return {
    ...fallback,
    ...localized,
  };
}

export function renderMessage(messages, key, params = {}) {
  const template = messages[key];
  if (typeof template !== "string") return key;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => {
    const value = params[name];
    return value === undefined || value === null ? `{${name}}` : String(value);
  });
}
