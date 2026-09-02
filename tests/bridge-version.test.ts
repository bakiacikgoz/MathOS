import { expect, test } from "bun:test"
import { BridgeService } from "@mathos/core"

test("bridge protocol mismatch fails before operation dispatch", async () => {
  let called = false; const bridge = new BridgeService({ workspaceRoot: process.cwd(), workspaceId: "W", trusted: true, handlers: { "research.run": async () => { called = true; return {} } } })
  await expect(bridge.handle({ protocolVersion: 99, id: "1", method: "research.run", params: {} })).rejects.toThrow("BRIDGE_PROTOCOL_MISMATCH")
  expect(called).toBe(false)
})

test("bridge bounds inflight work and response bytes", async () => {
  let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve })
  const bridge = new BridgeService({ workspaceRoot: process.cwd(), workspaceId: "W", trusted: true, maxInflight: 1, maxResponseBytes: 1000, handlers: { "research.run": async () => { await waiting; return { ok: true } } } })
  await bridge.handle({ protocolVersion: 1, id: "hello", method: "hello", params: { protocol: "mathos-bridge-v1", client: { name: "test", version: "1" }, workspaceRoot: process.cwd(), requestedCapabilities: ["research.run"] } })
  const first = bridge.handle({ protocolVersion: 1, id: "1", method: "research.run", params: {} }); await expect(bridge.handle({ protocolVersion: 1, id: "2", method: "research.run", params: {} })).rejects.toThrow("BRIDGE_INFLIGHT_LIMIT"); release(); await first
  const large = new BridgeService({ workspaceRoot: process.cwd(), workspaceId: "W", trusted: true, maxResponseBytes: 400, handlers: { "research.run": async () => "x".repeat(500) } }); await large.handle({ protocolVersion: 1, id: "h", method: "hello", params: { protocol: "mathos-bridge-v1", client: { name: "test", version: "1" }, workspaceRoot: process.cwd(), requestedCapabilities: ["research.run"] } }); await expect(large.handle({ protocolVersion: 1, id: "3", method: "research.run", params: {} })).rejects.toThrow("BRIDGE_RESPONSE_TOO_LARGE")
})
