import { describe, expect, test } from "bun:test"
import { resolveCommand } from "../apps/tui/src/keys.ts"

function key(partial: { name: string; ctrl?: boolean; meta?: boolean }) {
  return {
    name: partial.name,
    ctrl: partial.ctrl ?? false,
    meta: partial.meta ?? false,
    shift: false,
    sequence: partial.name,
  } as Parameters<typeof resolveCommand>[0]
}

describe("keymap", () => {
  test("resolves central commands", () => {
    expect(resolveCommand(key({ name: "c", ctrl: true }))).toBe("quit")
    expect(resolveCommand(key({ name: "p", ctrl: true }))).toBe("palette")
    expect(resolveCommand(key({ name: "escape" }))).toBe("escape")
    expect(resolveCommand(key({ name: "x" }))).toBeNull()
  })
})
