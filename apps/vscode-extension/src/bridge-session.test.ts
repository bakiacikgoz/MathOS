import { describe, expect, test } from "bun:test"
import { BridgeClient } from "./bridge-client.ts"
import { BridgeSession } from "./extension.ts"

describe("VS Code bridge session", () => {
  test("surfaces child stderr when the bridge exits before handshake", async () => {
    const session = new BridgeSession(new BridgeClient({ workspaceRoot: process.cwd(), trusted: true, executablePath: process.execPath }))
    try {
      await expect(session.start()).rejects.toThrow(/Script not found.*bridge/u)
    } finally {
      session.dispose()
    }
  })
})
