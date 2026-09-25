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

import { configureArgs, secretEnvName, suggestProfileId, validProfileId, type ProviderDescriptor } from "./providers.ts"

describe("provider helpers", () => {
  const descriptor = (id: string, extra: Partial<ProviderDescriptor> = {}): ProviderDescriptor => ({ id, displayName: id, vendor: "v", category: "api", transport: "openai-chat", authKinds: ["secret-ref"], billingClass: "payg", remote: true, terms: { policy: "STANDARD_API", summary: "", officialSources: [] }, endpointPresets: [], defaultModels: [], ...extra })

  test("builds configure arguments without secrets and only with flags the provider accepts", () => {
    expect(configureArgs({ descriptor: descriptor("deepseek-api"), profile: " ds ", model: "", baseUrl: "https://x.test", protocol: "openai-responses", headers: "X-Title: a" }))
      .toEqual(["provider", "configure", "deepseek-api", "--profile", "ds", "--model", "auto"])
    expect(configureArgs({ descriptor: descriptor("opencode-go", { modelProtocols: [{ model: "glm-5.1", protocol: "openai-chat" }] }), profile: "go", model: "glm-5.1", protocol: "anthropic-messages" }))
      .toEqual(["provider", "configure", "opencode-go", "--profile", "go", "--model", "glm-5.1", "--protocol", "anthropic-messages"])
    expect(configureArgs({ descriptor: descriptor("generic-openai-compatible", { category: "generic" }), profile: "gw", model: "m", baseUrl: " https://llm.test/v1 ", protocol: "openai-chat", headers: "X-Title: MathOS\n\n X-Env: lab " }))
      .toEqual(["provider", "configure", "generic-openai-compatible", "--profile", "gw", "--model", "m", "--base-url", "https://llm.test/v1", "--protocol", "openai-chat", "--header", "X-Title: MathOS", "--header", "X-Env: lab"])
  })

  test("suggests free profile ids and mirrors the secret environment fallback name", () => {
    expect(suggestProfileId(descriptor("deepseek-api"), [])).toBe("deepseek-main")
    expect(suggestProfileId(descriptor("opencode-go"), ["opencode-go-main"])).toBe("opencode-go-2")
    expect(validProfileId("go-main")).toBe(true)
    expect(validProfileId("bad id")).toBe(false)
    expect(secretEnvName("model.go-main")).toBe("MATHOS_SECRET_MODEL_GO_MAIN")
  })
})

import { TOURS, markSeen, normalizeTourPrefs, shouldAutoStart } from "./tours.ts"
import { FEATURED, keyPage, providerLogo } from "./provider-meta.ts"

describe("guided tours", () => {
  test("stored preferences are validated and skipping a section is remembered", () => {
    expect(normalizeTourPrefs(null)).toEqual({ seen: [], auto: true })
    expect(normalizeTourPrefs({ seen: ["claims", "nope", 3, "claims"], auto: false })).toEqual({ seen: ["claims"], auto: false })
    const prefs = markSeen(normalizeTourPrefs(null), "providers")
    expect(shouldAutoStart(prefs, "providers")).toBe(false)
    expect(shouldAutoStart(prefs, "claims")).toBe(true)
    expect(shouldAutoStart({ ...prefs, auto: false }, "claims")).toBe(false)
  })

  test("every step is written in both languages", () => {
    for (const steps of Object.values(TOURS)) for (const step of steps) {
      expect(step.title.tr && step.title.en && step.body.tr && step.body.en).toBeTruthy()
      expect(step.anchor).toMatch(/^[a-z-]+$/)
    }
  })
})

describe("provider presentation", () => {
  test("featured providers have logos and key pages are https only", () => {
    for (const id of FEATURED) expect(providerLogo(id)).toContain("<svg")
    expect(providerLogo("generic-openai-compatible")).toBeNull()
    for (const id of ["openai-api", "opencode-go", "deepseek-api"]) expect(keyPage(id)).toMatch(/^https:\/\//)
  })
})
