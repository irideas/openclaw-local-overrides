// 语言解析优先跟随显式项目配置，再跟随当前 shell / 运行时环境。
//
// 当前阶段只承诺：
// - `zh-CN`
// - `en`
//
// 其他语言暂时统一回退到英文，避免在未提供翻译时输出半成品文案。

function normalizeLocaleValue(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const lowered = text.replace(/_/g, "-").toLowerCase();
  if (lowered.startsWith("zh-cn") || lowered === "zh") return "zh-CN";
  if (lowered.startsWith("en")) return "en";
  return null;
}

export function resolveLocale(env = process.env, runtimeLocale = null) {
  return (
    normalizeLocaleValue(env.OPENCLAW_GUARDIAN_LANG) ||
    normalizeLocaleValue(runtimeLocale) ||
    normalizeLocaleValue(env.LC_ALL) ||
    normalizeLocaleValue(env.LC_MESSAGES) ||
    normalizeLocaleValue(env.LANG) ||
    "en"
  );
}
