import { MathOSError } from "./errors.ts"

export class LeanNotInstalled extends MathOSError {
  constructor() {
    super("LeanNotInstalled", "Lean is not installed. Formal checks are unavailable.")
    this.name = "LeanNotInstalled"
  }
}

export class LeanProjectNotFound extends MathOSError {
  constructor(path?: string) {
    super("LeanProjectNotFound", path ? `No Lean project found at ${path}.` : "No Lean project found.")
    this.name = "LeanProjectNotFound"
  }
}

export class LeanCheckFailed extends MathOSError {
  constructor(detail = "Lean check failed.") {
    super("LeanCheckFailed", detail)
    this.name = "LeanCheckFailed"
  }
}

export class FormalizationFailed extends MathOSError {
  constructor(detail = "Formalization failed.") {
    super("FormalizationFailed", detail)
    this.name = "FormalizationFailed"
  }
}

export class ProofBodyRejected extends MathOSError {
  constructor(detail = "Formal statements must not contain a proof body or sorry.") {
    super("ProofBodyRejected", detail)
    this.name = "ProofBodyRejected"
  }
}

export class FormalStatementNotFound extends MathOSError {
  constructor(id: string) {
    super("FormalStatementNotFound", `Formal statement ${id} was not found.`, { id })
    this.name = "FormalStatementNotFound"
  }
}

export class ProofAttemptFailed extends MathOSError {
  constructor(detail = "Proof attempt failed.") {
    super("ProofAttemptFailed", detail)
    this.name = "ProofAttemptFailed"
  }
}

export class VerificationFailed extends MathOSError {
  constructor(detail = "Verification gate failed.") {
    super("VerificationFailed", detail)
    this.name = "VerificationFailed"
  }
}

export class ProofPrerequisiteFailed extends MathOSError {
  constructor(detail: string) {
    super("ProofPrerequisiteFailed", detail)
    this.name = "ProofPrerequisiteFailed"
  }
}

export class RetrievalIndexMissing extends MathOSError {
  constructor() {
    super("RetrievalIndexMissing", "Premise index missing. Run `mathos index build`.")
    this.name = "RetrievalIndexMissing"
  }
}
