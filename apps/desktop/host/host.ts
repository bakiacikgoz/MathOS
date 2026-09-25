#!/usr/bin/env bun
// Long-lived MathOS host for the desktop app. It keeps the CLI warm so each
// request costs milliseconds instead of a cold process start. Requests run one
// at a time because the CLI relies on process-wide cwd and stdout.
import { statSync } from "node:fs"
import { MATHOS_PRODUCT_VERSION } from "@mathos/shared"
import { runHeadless } from "../../tui/src/headless.ts"
import { createSecretStore } from "@mathos/models"
import { DESKTOP_HOST_PROTOCOL, blockedCommandReason, createLineSplitter, parseHostMessage, type HostReady, type HostResponse, type SecretSetRequest } from "./protocol.ts"

const rawStdout = process.stdout.write.bind(process.stdout)
const rawStderr = process.stderr.write.bind(process.stderr)
let capture: { stdout: string; stderr: string } | null = null

const text = (chunk: unknown) => typeof chunk === "string" ? chunk : chunk instanceof Uint8Array ? new TextDecoder().decode(chunk) : String(chunk)
process.stdout.write = ((chunk: unknown) => { if (capture) capture.stdout += text(chunk); else rawStderr(text(chunk)); return true }) as typeof process.stdout.write
process.stderr.write = ((chunk: unknown) => { if (capture) capture.stderr += text(chunk); else rawStderr(text(chunk)); return true }) as typeof process.stderr.write
const line = (...parts: unknown[]) => `${parts.map((part) => typeof part === "string" ? part : Bun.inspect(part)).join(" ")}\n`
console.log = console.info = (...parts: unknown[]) => { process.stdout.write(line(...parts)) }
console.warn = console.error = (...parts: unknown[]) => { process.stderr.write(line(...parts)) }

const send = (value: HostResponse | HostReady) => { rawStdout(`${JSON.stringify(value)}\n`) }
const homeCwd = process.cwd()

function requestIdOf(raw: string): string {
  try { const value = JSON.parse(raw) as { id?: unknown }; return typeof value?.id === "string" && value.id.length <= 128 ? value.id : "unknown" } catch { return "unknown" }
}

async function execute(raw: string): Promise<void> {
  const started = performance.now()
  // Answer under the caller's id even when validation fails, so no request is left waiting.
  let id = requestIdOf(raw)
  try {
    const request = parseHostMessage(raw)
    id = request.id
    if ("op" in request) { send(await storeSecret(request, started)); return }
    const blocked = blockedCommandReason(request.args)
    if (blocked) { send({ protocol: DESKTOP_HOST_PROTOCOL, id, code: 2, stdout: "", stderr: `DESKTOP_COMMAND_NEEDS_TERMINAL: ${blocked}\n`, ms: 0 }); return }
    if (!statSync(request.cwd, { throwIfNoEntry: false })?.isDirectory()) { send({ protocol: DESKTOP_HOST_PROTOCOL, id, code: 2, stdout: "", stderr: `DESKTOP_CWD_NOT_FOUND: ${request.cwd}\n`, ms: 0 }); return }
    capture = { stdout: "", stderr: "" }
    process.chdir(request.cwd)
    let code: number
    try { code = await runHeadless(request.args) }
    catch (error) { capture.stderr += `${error instanceof Error ? error.message : String(error)}\n`; code = 1 }
    send({ protocol: DESKTOP_HOST_PROTOCOL, id, code, stdout: capture.stdout, stderr: capture.stderr, ms: Math.round(performance.now() - started) })
  } catch (error) {
    send({ protocol: DESKTOP_HOST_PROTOCOL, id, code: 2, stdout: "", stderr: `${error instanceof Error ? error.message : String(error)}\n`, ms: Math.round(performance.now() - started) })
  } finally {
    capture = null
    try { process.chdir(homeCwd) } catch {}
  }
}

// The key is written straight to the OS secret store; responses carry only the reference and backend.
async function storeSecret(request: SecretSetRequest, started: number): Promise<HostResponse> {
  const ms = () => Math.round(performance.now() - started)
  const store = createSecretStore(), capability = await store.capability()
  if (!capability.writable) return { protocol: DESKTOP_HOST_PROTOCOL, id: request.id, code: 2, stdout: "", stderr: `SECRET_STORE_BLOCKED: ${capability.detail}; set MATHOS_SECRET_${request.ref.toUpperCase().replace(/[^A-Z0-9]+/g, "_")} instead\n`, ms: ms() }
  await store.set(request.ref, request.value)
  return { protocol: DESKTOP_HOST_PROTOCOL, id: request.id, code: 0, stdout: `${JSON.stringify({ stored: request.ref, backend: capability.backend })}\n`, stderr: "", ms: ms() }
}

let queue = Promise.resolve()
const onLine = createLineSplitter((raw) => { queue = queue.then(() => execute(raw)) })
send({ protocol: DESKTOP_HOST_PROTOCOL, type: "ready", version: MATHOS_PRODUCT_VERSION, pid: process.pid })
const decoder = new TextDecoder()
for await (const chunk of Bun.stdin.stream()) onLine(decoder.decode(chunk, { stream: true }))
await queue
process.exit(0)
