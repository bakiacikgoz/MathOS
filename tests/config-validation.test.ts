import { describe, expect, test } from "bun:test"
import { loadMathOSConfig, serializeWorkspaceConfig } from "@mathos/models"

describe("configuration validation", () => {
  test("rejects unknown and secret-bearing workspace keys", () => {
    expect(() => loadMathOSConfig({ workspaceToml: '[model]\nunknown="x"' })).toThrow("CONFIG_UNKNOWN_KEY")
    expect(() => loadMathOSConfig({ workspaceToml: '[model]\napi_key="canary"' })).toThrow("CONFIG_SECRET_FORBIDDEN")
  })
  test("writes only validated non-secret values", () => {
    const text = serializeWorkspaceConfig("model.default_profile", "openrouter")
    expect(text).toContain('default_profile = "openrouter"')
    expect(() => serializeWorkspaceConfig("model.api_key", "secret")).toThrow("CONFIG_SECRET_FORBIDDEN")
  })
})
