import { BRIDGE_PROTOCOL_VERSION } from "@mathos/shared"
import { BridgeService, parseBridgeLine, type BridgeServiceOptions } from "./services/bridge-service.ts"
export async function runBridgeStdio(options: BridgeServiceOptions) {
  const service = new BridgeService(options), decoder = new TextDecoder()
  for await (const chunk of Bun.stdin.stream()) for (const line of decoder.decode(chunk).split(/\r?\n/).filter(Boolean)) {
    let id = "unknown"
    try { const request = parseBridgeLine(line); id = request.id || id; process.stdout.write(`${JSON.stringify(await service.handle(request))}\n`) }
    catch (error) { const message = error instanceof Error ? error.message : String(error), code = message.split(":")[0] || "BRIDGE_ERROR"; process.stdout.write(`${JSON.stringify({ protocolVersion: BRIDGE_PROTOCOL_VERSION, id, ok: false, error: { code, message, retryable: /TIMEOUT|UNAVAILABLE|INFLIGHT/.test(code) } })}\n`) }
  }
}
