import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import { coerceIntakeStatus, parseResearchDraft } from "@mathos/domain"
import {
  FakeModelProvider,
  InvalidStructuredResponse,
  parseTomlSection,
  redactText,
  resolveModelConfig,
} from "@mathos/models"
import { createLogger, eventLogPath, databasePath } from "@mathos/shared"

const temps: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mathos-intake-"))
  temps.push(dir)
  return dir
}

afterEach(() => {
  while (temps.length > 0) {
    const dir = temps.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const validDraft = {
  kind: "conjecture",
  title: "Additive energy lower bound",
  normalizedStatement: "Let G be a finite abelian group and A ⊆ G. Then E(A) is large.",
  objects: [
    { name: "G", description: "finite abelian group" },
    { name: "A", description: "subset of G" },
  ],
  assumptions: [{ id: "H1", text: "A is finite" }],
  goal: "Prove a lower bound on E(A).",
  ambiguities: [{ id: "A1", question: "Is G assumed finite?" }],
  suggestedStatus: "KERNEL_VERIFIED",
}

describe("model config", () => {
  test("resolves env over toml", () => {
    const config = resolveModelConfig({
      tomlText: `[model]\nprovider = "openai-compatible"\nmodel = "toml-model"\nbase_url = "https://toml.example/v1"\n`,
      env: {
        MATHOS_MODEL: "env-model",
        MATHOS_BASE_URL: "https://env.example/v1",
        MATHOS_API_KEY: "secret-key",
      } as NodeJS.ProcessEnv,
    })
    expect(config.model).toBe("env-model")
    expect(config.baseUrl).toBe("https://env.example/v1")
    expect(config.apiKey).toBe("secret-key")
    expect(config.source.model).toBe("env")
  })

  test("missing API key is reported as missing", () => {
    const config = resolveModelConfig({
      tomlText: `[model]\nmodel = "only-toml"\n`,
      env: {} as NodeJS.ProcessEnv,
    })
    expect(config.source.apiKey).toBe("missing")
    expect(config.apiKey).toBe("")
    expect(parseTomlSection(`[model]\nmodel = "x"\n`, "model").model).toBe("x")
  })
})

describe("epistemic gate", () => {
  test("model cannot promote verified status", () => {
    expect(coerceIntakeStatus("conjecture", "KERNEL_VERIFIED")).toBe("CONJECTURE")
    expect(coerceIntakeStatus("lemma", "INDEPENDENTLY_CHECKED")).toBe("IDEA")
    const draft = parseResearchDraft(validDraft, "original text", { provider: "fake", model: "fake-intake" })
    expect(draft.suggestedStatus).toBe("CONJECTURE")
    expect(draft.ambiguities[0]?.question).toContain("finite")
    expect(draft.originalInput).toBe("original text")
  })
})

describe("research intake", () => {
  test("structured success does not persist before confirm", async () => {
    const created = await MathOS.init(tempDir(), "intake")
    const fake = new FakeModelProvider()
    fake.enqueue(validDraft)
    const app = MathOS.open(created.root, { modelProvider: fake })
    try {
      const draft = await app.ingest("Let G be a finite abelian group...")
      expect(draft.title).toBe("Additive energy lower bound")
      expect(app.listClaims()).toHaveLength(0)
      expect(app.status().mainObjective).toBeNull()
    } finally {
      app.close()
    }
  })

  test("invalid structured response gets one repair then fails", async () => {
    const created = await MathOS.init(tempDir(), "repair")
    const fake = new FakeModelProvider()
    fake.enqueue("not json")
    fake.enqueue("still not json")
    const app = MathOS.open(created.root, { modelProvider: fake })
    try {
      await expect(app.ingest("A statement.")).rejects.toBeInstanceOf(InvalidStructuredResponse)
      expect(fake.generateCalls).toBe(2)
    } finally {
      app.close()
    }
  })

  test("single repair attempt can succeed", async () => {
    const created = await MathOS.init(tempDir(), "repair-ok")
    const fake = new FakeModelProvider()
    fake.enqueue("not json")
    fake.enqueue(validDraft)
    const app = MathOS.open(created.root, { modelProvider: fake })
    try {
      const draft = await app.ingest("A statement.")
      expect(draft.kind).toBe("conjecture")
      expect(fake.generateCalls).toBe(2)
    } finally {
      app.close()
    }
  })

  test("confirm creates claim with provenance and can set first objective", async () => {
    const created = await MathOS.init(tempDir(), "confirm")
    const fake = new FakeModelProvider()
    fake.enqueue(validDraft)
    const writer = MathOS.open(created.root, { modelProvider: fake })
    const draft = await writer.ingest("Let G be finite...")
    const claim = writer.confirmIntake(draft, { asMainObjective: true })
    expect(claim.id).toBe("C-001")
    expect(claim.createdBy).toBe("model")
    expect(claim.provider).toBe("fake")
    expect(claim.originalInput).toBe("Let G be finite...")
    writer.close()

    const reader = MathOS.open(created.root)
    try {
      expect(reader.status().mainObjective?.id).toBe("C-001")
      expect(reader.getClaim("C-001").modelName).toBe("fake-intake")
    } finally {
      reader.close()
    }
  })

  test("existing main objective is not silently replaced", async () => {
    const created = await MathOS.init(tempDir(), "keep-obj")
    const fake = new FakeModelProvider()
    fake.enqueue(validDraft)
    const app = MathOS.open(created.root, { modelProvider: fake })
    try {
      app.createClaim({ kind: "conjecture", title: "Existing", statement: "Already there." })
      app.setMainObjective("C-001")
      const draft = await app.ingest("Another statement.")
      const second = app.confirmIntake(draft)
      expect(second.id).toBe("C-002")
      expect(app.status().mainObjective?.id).toBe("C-001")
    } finally {
      app.close()
    }
  })
})

describe("secret hygiene", () => {
  test("secret does not appear in logs, events, or sqlite", async () => {
    process.env.MATHOS_API_KEY = "super-secret-token-xyz"
    process.env.MATHOS_DEBUG = "1"
    const created = await MathOS.init(tempDir(), "secrets")
    const logPath = join(created.root, ".mathos/debug.log")
    const logger = createLogger(logPath)
    logger.info("connecting", { apiKey: "super-secret-token-xyz", authorization: "Bearer super-secret-token-xyz" })
    const fake = new FakeModelProvider()
    fake.enqueue(validDraft)
    const app = MathOS.open(created.root, { modelProvider: fake })
    try {
      const draft = await app.ingest("Let G be a finite abelian group.")
      app.confirmIntake(draft)
      const events = readFileSync(eventLogPath(created.root), "utf8")
      const db = readFileSync(databasePath(created.root))
      const debug = readFileSync(logPath, "utf8")
      expect(events).not.toContain("super-secret-token-xyz")
      expect(debug).not.toContain("super-secret-token-xyz")
      expect(debug).toContain("[redacted]")
      expect(db.includes("super-secret-token-xyz")).toBe(false)
      expect(redactText("Bearer super-secret-token-xyz")).toContain("[redacted]")
    } finally {
      app.close()
      delete process.env.MATHOS_DEBUG
    }
  })
})
