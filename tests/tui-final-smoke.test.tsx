import { expect, test } from "bun:test"
import { layoutMode } from "../apps/tui/src/theme.ts"
import { TRUST_LANGUAGE, formatLongOperation } from "../apps/tui/src/format.ts"

test("narrow terminals use compact layout and trust language is canonical", () => {
  expect(layoutMode(40)).toBe("compact")
  expect(TRUST_LANGUAGE).toContain("KERNEL_VERIFIED")
  expect(TRUST_LANGUAGE).toContain("HUMAN_APPROVAL_REQUIRED")
  expect(TRUST_LANGUAGE.join(" ")).not.toContain("Probably proved")
})

test("long operations expose elapsed, cancellation, and durable checkpoint", () => {
  const text = formatLongOperation({ label: "Index build", elapsedMs: 1_250, checkpoint: "SCANNED_INDEX" })
  expect(text).toContain("1.3s")
  expect(text).toContain("SCANNED_INDEX")
  expect(text).toContain("Ctrl+C")
})
