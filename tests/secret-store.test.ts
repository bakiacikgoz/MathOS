import { describe, expect, test } from "bun:test"
import { EnvironmentSecretStore } from "@mathos/models"

describe("environment secret store", () => {
  test("exposes capability and metadata without values", async () => {
    const store = new EnvironmentSecretStore({ MATHOS_SECRET_MODEL_OPENROUTER: "canary-value" })
    expect((await store.capability()).writable).toBe(false)
    expect(await store.get("model.openrouter")).toBe("canary-value")
    expect(JSON.stringify(await store.listMetadata(["model.openrouter"]))).not.toContain("canary-value")
    await expect(store.set("model.openrouter", "x")).rejects.toThrow("SECRET_STORE_READ_ONLY")
  })
})
