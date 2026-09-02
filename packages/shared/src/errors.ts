export class MathOSError extends Error {
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = "MathOSError"
    this.code = code
    this.details = details
  }
}

export class WorkspaceNotFound extends MathOSError {
  constructor(path?: string) {
    super(
      "WorkspaceNotFound",
      path
        ? `No MathOS workspace found at or above ${path}. Run \`mathos init\` first.`
        : "No MathOS workspace found. Run `mathos init` first.",
      path ? { path } : undefined,
    )
    this.name = "WorkspaceNotFound"
  }
}

export class WorkspaceAlreadyInitialized extends MathOSError {
  constructor(path: string) {
    super(
      "WorkspaceAlreadyInitialized",
      `A MathOS workspace already exists at ${path}.`,
      { path },
    )
    this.name = "WorkspaceAlreadyInitialized"
  }
}

export class StorageUnavailable extends MathOSError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super("StorageUnavailable", `Storage is unavailable: ${reason}`, details)
    this.name = "StorageUnavailable"
  }
}

export class InvalidClaimStatus extends MathOSError {
  constructor(status: string) {
    super("InvalidClaimStatus", `Invalid claim status: ${status}`, { status })
    this.name = "InvalidClaimStatus"
  }
}

export class InvalidClaimKind extends MathOSError {
  constructor(kind: string) {
    super("InvalidClaimKind", `Invalid claim kind: ${kind}`, { kind })
    this.name = "InvalidClaimKind"
  }
}

export class EventWriteFailed extends MathOSError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super("EventWriteFailed", `Failed to append event log: ${reason}`, details)
    this.name = "EventWriteFailed"
  }
}

export class ClaimNotFound extends MathOSError {
  constructor(id: string) {
    super("ClaimNotFound", `Claim ${id} was not found.`, { id })
    this.name = "ClaimNotFound"
  }
}

export class InvalidClaimInput extends MathOSError {
  constructor(message: string) {
    super("InvalidClaimInput", message)
    this.name = "InvalidClaimInput"
  }
}

export class WorkspaceSchemaTooNew extends MathOSError {
  constructor(workspaceEpoch: number, runtimeEpoch: number) {
    super(
      "WORKSPACE_SCHEMA_TOO_NEW",
      `Workspace schema ${workspaceEpoch} is newer than this MathOS (${runtimeEpoch}). Do not downgrade.`,
      { workspaceEpoch, runtimeEpoch },
    )
    this.name = "WorkspaceSchemaTooNew"
  }
}

export class BackupIntegrityFailed extends MathOSError {
  constructor(reason: string) {
    super("BACKUP_INTEGRITY_FAILED", reason)
    this.name = "BackupIntegrityFailed"
  }
}

export function isMathOSError(error: unknown): error is MathOSError {
  return error instanceof MathOSError
}

export function formatUserError(error: unknown): string {
  if (isMathOSError(error)) return error.message
  if (error instanceof Error) return error.message
  return "An unexpected error occurred."
}

export type CliExitCode = 1 | 2 | 3 | 4 | 5

const matches = (code: string, words: string[]) => words.some((word) => code.includes(word))

export function cliExitCode(error: unknown): CliExitCode {
  const code = errorCode(error)
  if (matches(code, ["WORKSPACE_CONFLICT", "VERSION_MISMATCH", "SCHEMA_TOO_NEW", "PROTOCOL_MISMATCH"])) return 5
  if (matches(code, ["TRUST", "VERIFICATION", "PROOF_FAILED", "FIDELITY", "HUMAN_APPROVAL"])) return 4
  if (matches(code, ["UNAVAILABLE", "NOT_INSTALLED", "BLOCKED", "CAPABILITY", "SANDBOX"])) return 3
  if (matches(code, ["CONFIG", "USAGE", "INVALID", "REQUIRED", "UNKNOWN_COMMAND", "ARG_FORBIDDEN"])) return 2
  return 1
}

function errorCode(error: unknown): string {
  if (isMathOSError(error)) return error.code.toUpperCase()
  if (!(error instanceof Error)) return ""
  const prefix = error.message.match(/^([A-Z][A-Z0-9_]*)\s*:/)?.[1]
  return prefix ?? ""
}

const REMEDIATION: Record<number, string> = {
  1: "Retry the operation; use MATHOS_DEBUG=1 only when diagnostic detail is needed.",
  2: "Check command usage and configuration, then retry.",
  3: "Install or configure the reported capability, then retry.",
  4: "Review the trust or verification evidence; no proof status was promoted.",
  5: "Resolve the workspace or protocol version conflict before retrying.",
}

export function formatCliError(error: unknown, options: { debug?: boolean } = {}) {
  const exitCode = cliExitCode(error)
  const code = errorCode(error) || "OPERATION_FAILED"
  const message = formatUserError(error)
  return {
    schemaVersion: "mathos.cli-error.v1" as const,
    error: { code, message, exitCode },
    remediation: REMEDIATION[exitCode],
    ...(options.debug && error instanceof Error ? { stack: error.stack } : {}),
  }
}
