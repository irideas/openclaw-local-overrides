export async function runPreflight(context) {
  // 这是一个最小 `preflight` 模板。
  //
  // 约定：
  // 1. 这里优先使用 runner 注入的 `context`
  // 2. 只返回 finding，不直接修改本地状态
  // 3. 所有用户可见文案尽量走 `context.t(...)`
  context.log("preflight_state", {
    issueId: context.issueId,
    argv: context.argv || [],
  });

  return [];
}
