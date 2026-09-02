import { realpathSync } from "node:fs"
import { resolve } from "node:path"
import { parseBridgeHello, type BridgeRequest, type BridgeResponse } from "@mathos/domain"
import { BRIDGE_PROTOCOL_VERSION, MATHOS_PRODUCT_VERSION, WORKSPACE_SCHEMA_VERSION } from "@mathos/shared"

const capabilities = new Set(["claims.read", "graph.read", "events.subscribe", "claims.create", "research.run"])
const methods = new Set(["shutdown", "events.subscribe", "claims.create", "claims.list", "graph.snapshot", "research.run"])
type Handler = (params: unknown, signal: AbortSignal, progress: (value: unknown) => void) => Promise<unknown>
export interface BridgeServiceOptions { workspaceRoot: string; workspaceId: string; trusted: boolean; handlers?: Record<string, Handler>; maxInflight?: number; maxResponseBytes?: number; onProgress?: (notification: { method: "progress"; params: { requestId: string; value: unknown } }) => void }
function canonical(path: string): string { try { return realpathSync(path) } catch { return resolve(path) } }
export function parseBridgeLine(line: string): BridgeRequest { if (Buffer.byteLength(line) > 1_000_000) throw new Error("BRIDGE_PAYLOAD_TOO_LARGE"); let value: unknown; try { value = JSON.parse(line) } catch { throw new Error("BRIDGE_MALFORMED_JSON") }; if (!value || typeof value !== "object") throw new Error("BRIDGE_REQUEST_INVALID"); return value as BridgeRequest }

export class BridgeService {
  private granted = new Set<string>(); private helloComplete = false; private readonly active = new Map<string, AbortController>()
  constructor(private readonly options: BridgeServiceOptions) {}
  async handle(input: BridgeRequest | { protocolVersion?: number; id: string; method: string; params: any }): Promise<BridgeResponse> {
    const request: BridgeRequest = { protocolVersion: input.protocolVersion ?? BRIDGE_PROTOCOL_VERSION, id: input.id, method: input.method, params: input.params }
    if (request.protocolVersion !== BRIDGE_PROTOCOL_VERSION) throw new Error(`BRIDGE_PROTOCOL_MISMATCH: expected ${BRIDGE_PROTOCOL_VERSION}, got ${request.protocolVersion}`)
    if (!request.id) throw new Error("BRIDGE_REQUEST_ID_REQUIRED")
    if (request.method === "$/cancelRequest") { const id = String((request.params as {id?:unknown})?.id ?? ""), controller = this.active.get(id); controller?.abort(new Error("BRIDGE_REQUEST_CANCELLED")); return this.response(request.id, { cancelled: Boolean(controller), requestId: id }) }
    if (request.method === "hello") return this.hello(request)
    if (!this.helloComplete) throw new Error("BRIDGE_HANDSHAKE_REQUIRED")
    if (!methods.has(request.method)) throw new Error("BRIDGE_METHOD_UNKNOWN")
    if (this.active.size >= (this.options.maxInflight ?? 8)) throw new Error("BRIDGE_INFLIGHT_LIMIT")
    if (this.active.has(request.id)) throw new Error("BRIDGE_DUPLICATE_REQUEST_ID")
    if (request.method === "shutdown") return this.response(request.id, "BYE")
    if (request.method === "events.subscribe") { this.requireCapability("events.subscribe"); return this.response(request.id, { subscriptionId: `sub-${request.id}` }) }
    if (request.method === "claims.list") this.requireCapability("claims.read")
    if (request.method === "graph.snapshot") this.requireCapability("graph.read")
    if (request.method === "research.run") this.requireCapability("research.run")
    if (request.method === "claims.create") { if (!this.options.trusted) throw new Error("UNTRUSTED_WORKSPACE_MUTATION"); this.requireCapability("claims.create") }
    const controller = new AbortController(); this.active.set(request.id, controller)
    try { const handler = this.options.handlers?.[request.method]; const result = handler ? await handler(request.params, controller.signal, value => this.options.onProgress?.({ method: "progress", params: { requestId: request.id, value } })) : request.method === "claims.list" ? [] : { accepted: true }; return this.response(request.id, result) } finally { this.active.delete(request.id) }
  }
  private hello(request: BridgeRequest): BridgeResponse { const hello = parseBridgeHello(request.params as Record<string, any>); if (canonical(hello.workspaceRoot) !== canonical(this.options.workspaceRoot)) throw new Error("BRIDGE_WORKSPACE_MISMATCH"); const requested = hello.requestedCapabilities, granted = requested.filter(capability => capabilities.has(capability) && (this.options.trusted || !capability.endsWith(".create"))), denied = requested.filter(capability => !granted.includes(capability)).map(capability => ({ capability, reason: capabilities.has(capability) ? "WORKSPACE_UNTRUSTED" : "CAPABILITY_UNKNOWN" })); this.granted = new Set(granted); this.helloComplete = true; return this.response(request.id, { protocol: "mathos-bridge-v1", productVersion: MATHOS_PRODUCT_VERSION, mathosVersion: MATHOS_PRODUCT_VERSION, protocolVersion: BRIDGE_PROTOCOL_VERSION, schemaEpoch: WORKSPACE_SCHEMA_VERSION, workspaceId: this.options.workspaceId, grantedCapabilities: granted, deniedCapabilities: denied }) }
  private requireCapability(capability: string): void { if (!this.granted.has(capability)) throw new Error("BRIDGE_CAPABILITY_DENIED") }
  private response(id: string, result: unknown): BridgeResponse { const response: BridgeResponse = { protocolVersion: BRIDGE_PROTOCOL_VERSION, id, ok: true, result }; if (Buffer.byteLength(JSON.stringify(response)) > (this.options.maxResponseBytes ?? 2_000_000)) throw new Error("BRIDGE_RESPONSE_TOO_LARGE"); return response }
}
