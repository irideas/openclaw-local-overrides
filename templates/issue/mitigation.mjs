export async function activate(context) {
  // 这是一个最小 `mitigation` 模板。
  //
  // 约定：
  // 1. 只做命中链路内的窄缓解
  // 2. 优先使用 `context.openclawRoot` / `context.openclawVersion`
  // 3. 不把自动探测当成主路径
  context.log("mitigation_activate", {
    issueId: context.issueId,
  });
}
