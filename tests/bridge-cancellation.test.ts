import { expect, test } from "bun:test"
import { BridgeService } from "@mathos/core"

test("bridge cancellation propagates AbortSignal to inflight operation", async () => {
  let aborted = false
  const bridge = new BridgeService({ workspaceRoot: process.cwd(), workspaceId: "W", trusted: true, handlers: { "research.run": async (_params, signal) => await new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("ABORTED")) }, { once: true })) } })
  await bridge.handle({ protocolVersion: 1, id: "hello", method: "hello", params: { protocol: "mathos-bridge-v1", client: { name: "test", version: "1" }, workspaceRoot: process.cwd(), requestedCapabilities: ["research.run"] } })
  const running = bridge.handle({ protocolVersion: 1, id: "run-1", method: "research.run", params: {} })
  expect((await bridge.handle({ protocolVersion: 1, id: "cancel", method: "$/cancelRequest", params: { id: "run-1" } })).result).toEqual({ cancelled: true, requestId: "run-1" })
  await expect(running).rejects.toThrow("ABORTED"); expect(aborted).toBe(true)
})
