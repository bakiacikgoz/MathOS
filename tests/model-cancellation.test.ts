import { expect, test } from "bun:test"
import { retryModelCall } from "@mathos/models"

test("aborted model calls stop before retry", async () => {
  const controller = new AbortController(); let attempts = 0
  await expect(retryModelCall(async () => { attempts++; controller.abort(); throw new DOMException("aborted", "AbortError") }, { signal: controller.signal })).rejects.toThrow()
  expect(attempts).toBe(1)
})
