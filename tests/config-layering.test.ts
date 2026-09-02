import { describe, expect, test } from "bun:test"
import { loadMathOSConfig } from "@mathos/models"

describe("layered MathOS configuration", () => {
  test("applies defaults, user, workspace, environment, and CLI in order", () => {
    const result = loadMathOSConfig({
      userToml: '[model]\ndefault_profile="user"\n[privacy]\nallow_remote_models=false',
      workspaceToml: '[model]\ndefault_profile="workspace"\n[literature]\nproviders=["openalex","arxiv"]',
      env: { MATHOS_MODEL_PROFILE: "environment", MATHOS_ALLOW_REMOTE_MODELS: "true" },
      cli: { "model.default_profile": "cli" },
    })
    expect(result.config.model.default_profile).toBe("cli")
    expect(result.config.privacy.allow_remote_models).toBe(true)
    expect(result.config.literature.providers).toEqual(["openalex", "arxiv"])
    expect(result.sources["model.default_profile"]).toBe("cli")
  })
})
