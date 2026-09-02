import { describe, expect, test } from "bun:test"
import { BridgeClient } from "./bridge-client.ts"
describe("bridge client", () => {
  test("safe spawn handshake reconnect no API keys", () => { const client = new BridgeClient({ workspaceRoot: "C:/w", trusted: true }); expect(client.spawnSpec().args).toEqual(["bridge", "stdio"]); expect(client.spawnSpec().env).toEqual({ MATHOS_BRIDGE: "1", MATHOS_WORKSPACE_TRUST: "trusted" }); expect(client.hello().protocol).toBe("mathos-bridge-v1"); expect(client.request("1", "hello", client.hello()).protocolVersion).toBe(1); expect(client.cancel("1").method).toBe("$/cancelRequest"); expect(client.reconnectDelay(3)).toBeLessThanOrEqual(5000) })
  test("untrusted workspace is read only", () => { expect(new BridgeClient({ workspaceRoot: "C:/w", trusted: false }).hello().requestedCapabilities.every(value => value.endsWith(".read") || value === "events.subscribe")).toBe(true) })
})
