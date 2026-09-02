import { BRIDGE_PROTOCOL } from "./protocol.ts"
const PROTOCOL_VERSION = 1
export class BridgeClient {
  constructor(private readonly options: { workspaceRoot: string; trusted: boolean }) {}
  spawnSpec() { return { command: "mathos", args: ["bridge", "stdio"], cwd: this.options.workspaceRoot, env: { MATHOS_BRIDGE: "1", MATHOS_WORKSPACE_TRUST: this.options.trusted ? "trusted" : "untrusted" } } }
  hello() { return { protocol: BRIDGE_PROTOCOL, client: { name: "mathos-vscode", version: "1" }, workspaceRoot: this.options.workspaceRoot, requestedCapabilities: this.options.trusted ? ["claims.read", "graph.read", "events.subscribe", "claims.create"] : ["claims.read", "graph.read", "events.subscribe"] } }
  request(id: string, method: string, params: unknown) { return { protocolVersion: PROTOCOL_VERSION, id, method, params } }
  cancel(requestId: string) { return this.request(`cancel-${requestId}`, "$/cancelRequest", { id: requestId }) }
  reconnectDelay(attempt: number) { return Math.min(5000, 100 * 2 ** attempt) }
}
