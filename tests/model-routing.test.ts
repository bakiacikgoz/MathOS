import { describe, expect, test } from "bun:test"
import { ModelProfileRegistry, ModelRouter } from "@mathos/models"

describe("role model routing", () => {
  test("uses role override then explicit default and never silently changes provider", () => {
    const profiles = new ModelProfileRegistry([{ id: "remote", type: "openai-compatible", baseUrl: "https://example.test/v1", model: "r", secretRef: "model.remote", remote: true }, { id: "local", type: "openai-compatible", baseUrl: "http://127.0.0.1:1234/v1", model: "l", secretRef: null, remote: false }])
    const router = new ModelRouter(profiles, { defaultProfile: "remote", roles: { checker: "local" } })
    expect(router.resolve("checker").id).toBe("local")
    expect(router.resolve("planner").id).toBe("remote")
    expect(() => new ModelRouter(profiles, { roles: { prover: "missing" } }).resolve("prover")).toThrow("MODEL_PROFILE_NOT_FOUND")
    expect(() => new ModelRouter(profiles, {}).resolve("planner")).toThrow("MODEL_ROUTE_BLOCKED")
  })
})
