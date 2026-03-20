// 这里保留旧文件名，只为兼容已存在的入口和测试引用。
// 实际实现已经切到 issue 中心模型，由 `core/issue-loader.mjs` 提供。

export {
  normalize,
  readJson,
  listIssueIds as listModuleIds,
  readIssue as readManifest,
  discoverIssues as discoverModuleManifests,
  resolveRuntimePaths,
  extractProvider,
  matchesIssue as matchesManifest,
  parseForcedIssues as parseForcedModules,
  validateIssue as validateManifest,
  resolveEnabledIssues as resolveEnabledModules,
  resolveDisabledIssues as resolveDisabledModules,
  isEnabledByDefault,
  resolveActiveIssueIds as resolveActiveModuleIds,
  resolveIssueLogPath as resolveModuleLogPath,
} from "../../core/issue-loader.mjs";
