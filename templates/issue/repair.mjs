export async function runRepair(context) {
  // 这是一个最小 `repair` 模板。
  //
  // 约定：
  // 1. `apply === false` 时只生成计划，不修改本地状态
  // 2. `apply === true` 时执行显式修复
  // 3. 返回值应包含 `status`、`summary`、`actions`、`warnings`
  context.log("repair_plan", {
    issueId: context.issueId,
    apply: context.apply === true,
  });

  if (!context.apply) {
    return {
      status: "dry-run",
      summary: context.t("repair.dryRun.summary"),
      actions: [],
      warnings: [],
    };
  }

  return {
    status: "applied",
    summary: context.t("repair.apply.summary"),
    actions: [],
    warnings: [],
  };
}
