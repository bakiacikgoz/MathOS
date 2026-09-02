import { expect, test } from "bun:test"
import { BridgeClient } from "../apps/vscode-extension/src/bridge-client.ts"

test("bridge lifecycle uses argv, handshake versioning, cancellation, and bounded restart", () => {
  const client = new BridgeClient({ workspaceRoot: "C:/workspace", trusted: true, executablePath: "C:/MathOS/mathos.exe" })
  expect(client.spawnSpec()).toMatchObject({ command: "C:/MathOS/mathos.exe", args: ["bridge", "stdio"], cwd: "C:/workspace" })
  expect(client.hello()).toMatchObject({ protocol: "mathos-bridge-v1" })
  expect(client.cancel("42").method).toBe("$/cancelRequest")
  expect(client.reconnectDelay(20)).toBe(5000)
})
