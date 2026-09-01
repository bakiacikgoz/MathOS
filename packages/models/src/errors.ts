import { MathOSError } from "@mathos/shared"

export class ModelNotConfigured extends MathOSError {
  constructor(detail = "Model provider is not configured.") {
    super("ModelNotConfigured", detail)
    this.name = "ModelNotConfigured"
  }
}

export class ModelAuthenticationFailed extends MathOSError {
  constructor(detail = "Model authentication failed.") {
    super("ModelAuthenticationFailed", detail)
    this.name = "ModelAuthenticationFailed"
  }
}

export class ModelUnavailable extends MathOSError {
  constructor(detail = "Model endpoint is unavailable.") {
    super("ModelUnavailable", detail)
    this.name = "ModelUnavailable"
  }
}

export class ModelTimeout extends MathOSError {
  constructor(detail = "Model request timed out.") {
    super("ModelTimeout", detail)
    this.name = "ModelTimeout"
  }
}

export class InvalidStructuredResponse extends MathOSError {
  constructor(detail = "The model returned an invalid structured response.") {
    super("InvalidStructuredResponse", detail)
    this.name = "InvalidStructuredResponse"
  }
}

export class ResearchIntakeFailed extends MathOSError {
  constructor(detail = "Research intake failed.") {
    super("ResearchIntakeFailed", detail)
    this.name = "ResearchIntakeFailed"
  }
}
