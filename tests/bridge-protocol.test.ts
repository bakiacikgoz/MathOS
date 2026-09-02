import { describe, expect, test } from "bun:test"
import { BridgeService } from "../packages/core/src/services/bridge-service.ts"
describe("bridge protocol", () => {
  test("hello welcome request ids subscription shutdown", async () => {
    const bridge = new BridgeService({ workspaceRoot: "C:/w", workspaceId: "W", trusted: true })
    const welcome = await bridge.handle({ id: "1", method: "hello", params: { protocol: "mathos-bridge-v1", client: { name: "v", version: "1" }, workspaceRoot: "C:/w", requestedCapabilities: ["claims.read", "events.subscribe"] } })
    expect(welcome.id).toBe("1")
    expect((welcome.result as any).grantedCapabilities).toContain("claims.read")
    expect(await bridge.handle({ id: "2", method: "events.subscribe", params: {} })).toMatchObject({ id: "2" })
    const shutdown = await bridge.handle({ id: "3", method: "shutdown", params: {} })
    expect(shutdown.result).toBe("BYE")
  })
  test("rejects version mismatch and malformed method", async () => {
    const bridge = new BridgeService({ workspaceRoot: "C:/w", workspaceId: "W", trusted: true })
    await expect(bridge.handle({ id: "1", method: "hello", params: { protocol: "v0" } })).rejects.toThrow("BRIDGE_PROTOCOL_UNSUPPORTED")
    await bridge.handle({ protocolVersion: 1, id: "ok", method: "hello", params: { protocol: "mathos-bridge-v1", client: { name: "v", version: "1" }, workspaceRoot: "C:/w", requestedCapabilities: [] } })
    await expect(bridge.handle({ id: "2", method: "unknown", params: {} })).rejects.toThrow("BRIDGE_METHOD_UNKNOWN")
  })
})
