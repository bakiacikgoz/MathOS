import { describe, expect, test } from "bun:test"
import { parseBridgeLine, BridgeService } from "../packages/core/src/services/bridge-service.ts"

describe("bridge security", () => {
  test("payload malformed and DB path denied", async () => {
    expect(() => parseBridgeLine("x")).toThrow("BRIDGE_MALFORMED_JSON")
    expect(() => parseBridgeLine(JSON.stringify({ x: "a".repeat(1_000_001) }))).toThrow("BRIDGE_PAYLOAD_TOO_LARGE")
    const bridge = new BridgeService({ workspaceRoot: "C:/w", workspaceId: "W", trusted: false })
    await bridge.handle({ protocolVersion: 1, id: "hello", method: "hello", params: { protocol: "mathos-bridge-v1", client: { name: "test", version: "1" }, workspaceRoot: "C:/w", requestedCapabilities: ["claims.create"] } })
    await expect(bridge.handle({ protocolVersion: 1, id: "1", method: "db.path", params: {} })).rejects.toThrow("BRIDGE_METHOD_UNKNOWN")
    await expect(bridge.handle({ protocolVersion: 1, id: "2", method: "claims.create", params: {} })).rejects.toThrow("UNTRUSTED_WORKSPACE_MUTATION")
  })
})
