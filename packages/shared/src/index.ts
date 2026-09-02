export {
  MathOSError,
  WorkspaceNotFound,
  WorkspaceAlreadyInitialized,
  StorageUnavailable,
  InvalidClaimStatus,
  InvalidClaimKind,
  EventWriteFailed,
  ClaimNotFound,
  InvalidClaimInput,
  WorkspaceSchemaTooNew,
  BackupIntegrityFailed,
  isMathOSError,
  formatUserError,
  cliExitCode,
  formatCliError,
  type CliExitCode,
} from "./errors.ts"
export {
  LeanNotInstalled,
  LeanProjectNotFound,
  LeanCheckFailed,
  FormalizationFailed,
  ProofBodyRejected,
  FormalStatementNotFound,
  ProofAttemptFailed,
  VerificationFailed,
  ProofPrerequisiteFailed,
  RetrievalIndexMissing,
} from "./formal-errors.ts"
export { createId, nowIso, padSeq } from "./ids.ts"
export {
  MATHOS_DIR,
  CONFIG_FILE,
  CHARTER_FILE,
  DATABASE_FILE,
  EVENT_LOG_FILE,
  DEBUG_LOG_FILE,
  mathosDir,
  databasePath,
  eventLogPath,
  debugLogPath,
  configPath,
  charterPath,
  WORKSPACE_DIRECTORIES,
} from "./paths.ts"
export { createLogger, silentLogger, type Logger, type LogLevel } from "./logging.ts"
export { mathosVersion, mathosRepoRoot, gitCommitShort, gitCommitFull, formatMathosVersion, currentBuildIdentity, assertProductVersionAlignment, MATHOS_RELEASE_NAME, MATHOS_PRODUCT_VERSION, type MathOSBuildIdentity } from "./version.ts"
export { WORKSPACE_SCHEMA_VERSION, MINIMUM_WORKSPACE_SCHEMA_VERSION, BRIDGE_PROTOCOL_VERSION, PLUGIN_API_VERSION, CAPSULE_FORMAT_VERSION, PUBLICATION_FORMAT_VERSION, CompatibilityError, compatibilityMatrix, assertMathOSCompatibility, readProductSurfaceVersions, type MathOSCompatibilityInput } from "./compatibility.ts"
export { resolveRuntimeLayout, type RuntimeLayout } from "./runtime-layout.ts"
export { createReleaseManifest, verifyReleaseManifest, type ReleaseManifestV1 } from "./release-manifest.ts"
export { WorkspaceOperationLock, withWorkspaceOperationLock, type WorkspaceExclusiveOperation } from "./workspace-lock.ts"
