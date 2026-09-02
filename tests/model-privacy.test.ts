import { expect, test } from "bun:test"
import { assertModelPrivacy } from "@mathos/models"

test("remote profile calls require explicit privacy consent", () => {
  expect(() => assertModelPrivacy({ remote: true }, { allowRemoteModels: false })).toThrow("REMOTE_MODEL_BLOCKED")
  expect(assertModelPrivacy({ remote: false }, { allowRemoteModels: false })).toBe("LOCAL_PROVIDER")
  expect(assertModelPrivacy({ remote: true }, { allowRemoteModels: true })).toBe("REMOTE_PROVIDER")
})
