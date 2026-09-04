import { describe, expect, test } from "bun:test"
import {
  createPlatformEvidence,
  platformQualificationCommands,
  validateQualificationHost,
} from "../scripts/qualification/platform-qualification"

describe("portable platform qualification", () => {
  test("refuses to qualify macOS arm64 on an emulated or wrong host", () => {
    expect(() => validateQualificationHost("macos-arm64", "win32", "x64")).toThrow("QUALIFICATION_HOST_MISMATCH")
    expect(() => validateQualificationHost("macos-arm64", "linux", "arm64")).toThrow("QUALIFICATION_HOST_MISMATCH")
    expect(validateQualificationHost("macos-arm64", "darwin", "arm64")).toEqual({ platform: "darwin", arch: "arm64" })
  })

  test("creates conservative evidence with every mandatory gate unverified", () => {
    const evidence = createPlatformEvidence("macos-arm64", "abc123", "2026-09-04T00:00:00.000Z")
    expect(evidence.status).toBe("NOT_VERIFIED")
    expect(Object.values(evidence.gates).every(value => value === "NOT_VERIFIED")).toBe(true)
    expect(evidence.gitRevision).toBe("abc123")
  })

  test("portable commands cover canonical regression and real interactive gates", () => {
    const commands = platformQualificationCommands("macos-arm64")
    expect(commands.nonInteractive).toContain("bun install --frozen-lockfile")
    expect(commands.nonInteractive).toContain("bun run release-check")
    expect(commands.interactive.map(row => row.gate)).toEqual(expect.arrayContaining(["tui", "vscodeHost", "sandbox"]))
    expect(commands.interactive.find(row => row.gate === "tui")?.command).toContain("mathos")
  })
})
