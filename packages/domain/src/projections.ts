export interface ClaimDetail {
  id: string
  kind: string
  title: string
  status: string
  naturalStatement: string
  branchName: string
  createdAt: string
  updatedAt: string
  evidence: Array<{ id: string; kind: string; summary: string }>
  dependencies: Array<{ id: string; relation: string; fromClaimId: string; toClaimId: string }>
}

export interface StatusProjection {
  projectName: string
  workspaceRoot: string
  mainObjective: {
    id: string
    title: string
    status: string
  } | null
  research: {
    verified: number
    informal: number
    conjectures: number
    blocked: number
    totalClaims: number
  }
  branch: {
    id: string
    name: string
    slug?: string
    status: string
    staleBase?: boolean
  } | null
  integrity: {
    database: "connected" | "missing" | "error"
    eventLog: "ok" | "missing" | "error"
    initialized: boolean
  }
}

export interface DoctorCheck {
  name: string
  status: "PASS" | "WARN" | "FAIL"
  detail: string
}

export interface DoctorReport {
  checks: DoctorCheck[]
  ok: boolean
  schemaVersion?: number
  mathosVersion?: string
}

export type CoreCommand =
  | { type: "status" }
  | { type: "doctor" }
  | { type: "help" }
  | { type: "quit" }

export type CoreEvent =
  | { type: "status"; payload: StatusProjection }
  | { type: "doctor"; payload: DoctorReport }
  | { type: "help"; payload: string }
  | { type: "toast"; kind: "info" | "success" | "error"; message: string }
  | { type: "error"; message: string; code: string }
