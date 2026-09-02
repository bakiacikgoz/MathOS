import { expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { BridgeService } from "@mathos/core"

test("bridge hello rejects a different canonical workspace", async () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-bridge-root-")), other = mkdtempSync(join(tmpdir(), "mathos-bridge-other-")), bridge = new BridgeService({ workspaceRoot: root, workspaceId: "W", trusted: true })
  await expect(bridge.handle({ protocolVersion: 1, id: "1", method: "hello", params: { protocol: "mathos-bridge-v1", client: { name: "v", version: "1" }, workspaceRoot: other, requestedCapabilities: [] } })).rejects.toThrow("BRIDGE_WORKSPACE_MISMATCH")
})
