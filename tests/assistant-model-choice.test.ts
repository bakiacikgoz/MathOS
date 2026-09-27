import { expect, test } from "bun:test"
import type { ModelProfileV2 } from "@mathos/models"
import { withModel } from "../apps/tui/src/model-runtime.ts"

const profile = (id: string, descriptorId: string, model: string) => ({ id, descriptorId, displayName: id, model }) as ModelProfileV2

test("a conversation can use any model its profile's provider offers", () => {
  const profiles = [profile("go", "opencode-go", "gpt-6-luna"), profile("local", "generic-openai-compatible", "local-m")]
  expect(withModel(profiles, "go", "deepseek-v4-flash").map((item) => item.model)).toEqual(["deepseek-v4-flash", "local-m"])
  expect(withModel(profiles, "go", undefined)).toBe(profiles)
  expect(withModel(profiles, "go", "gpt-6-luna")[0]).toBe(profiles[0])
})

test("a model the provider does not offer is refused", () => {
  expect(() => withModel([profile("go", "opencode-go", "gpt-6-luna")], "go", "made-up")).toThrow("MODEL_NOT_OFFERED")
})
