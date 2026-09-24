import { describe, expect, test } from "bun:test"
import { splitArgs } from "./args.ts"
import { parseClaimPage } from "./claim-page.ts"
import { errorFromResult } from "./bridge.ts"

describe("desktop helpers", () => {
  test("splits console input like a shell", () => {
    expect(splitArgs(`mathos claim create --title "Bounded gaps" --statement 'a  b'`)).toEqual(["claim", "create", "--title", "Bounded gaps", "--statement", "a  b"])
    expect(splitArgs(`claims   --json`)).toEqual(["claims", "--json"])
    expect(splitArgs(`x "" y`)).toEqual(["x", "", "y"])
    expect(splitArgs(`a\\ b "c \\"d\\""`)).toEqual(["a b", 'c "d"'])
  })

  test("parses the claim page into sections and a verification checklist", () => {
    const page = parseClaimPage("CLAIM · C-001\n\nStatement\nThere are infinitely many.\n\nStatus\nCONJECTURE\n\nEvidence\n0 computational\n0 literature\n\nWHY NOT VERIFIED?\n\nFormalization ×\nFidelity ✓\nOpen blocker none\nVerificationGate none\n\nCurrent status CONJECTURE\nComputation and literature are not proofs.")
    expect(page.heading).toBe("CLAIM · C-001")
    expect(page.sections.map((section) => section.label)).toEqual(["Statement", "Status", "Evidence"])
    expect(page.sections[2]!.lines).toEqual(["0 computational", "0 literature"])
    expect(page.checks).toEqual([
      { label: "Formalization", ok: false },
      { label: "Fidelity", ok: true },
      { label: "Open blocker", ok: null, value: "none" },
      { label: "VerificationGate", ok: null, value: "none" },
      { label: "Current status", ok: null, value: "CONJECTURE" },
    ])
    expect(page.notes).toEqual(["Computation and literature are not proofs."])
  })

  test("reads versioned CLI errors from stderr", () => {
    const error = errorFromResult({ code: 1, stdout: "", ms: 1, stderr: JSON.stringify({ schemaVersion: "mathos.cli-error.v1", error: { code: "WORKSPACENOTFOUND", message: "No workspace" }, remediation: "Run init" }) })
    expect(error.code).toBe("WORKSPACENOTFOUND")
    expect(error.message).toBe("No workspace")
    expect(error.remediation).toBe("Run init")
    expect(errorFromResult({ code: 2, stdout: "", ms: 0, stderr: "DESKTOP_CWD_NOT_FOUND: /x\n" }).code).toBe("DESKTOP_CWD_NOT_FOUND")
  })
})
