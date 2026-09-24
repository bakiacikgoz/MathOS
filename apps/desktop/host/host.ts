#!/usr/bin/env bun
// Long-lived MathOS host for the desktop app. It keeps the CLI warm so each
// request costs milliseconds instead of a cold process start. Requests run one
// at a time because the CLI relies on process-wide cwd and stdout.
import { statSync } from "node:fs"
import { MATHOS_PRODUCT_VERSION } from "@mathos/shared"
import { runHeadless } from "../../tui/src/headless.ts"
import { DESKTOP_HOST_PROTOCOL, blockedCommandReason, createLineSplitter, parseHostRequest, type HostReady, type HostResponse } from "./protocol.ts"

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

async function execute(raw: string): Promise<void> {
  const started = performance.now()
  let id = "unknown"
  try {
    const request = parseHostRequest(raw)
    id = request.id
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

let queue = Promise.resolve()
const onLine = createLineSplitter((raw) => { queue = queue.then(() => execute(raw)) })
send({ protocol: DESKTOP_HOST_PROTOCOL, type: "ready", version: MATHOS_PRODUCT_VERSION, pid: process.pid })
const decoder = new TextDecoder()
for await (const chunk of Bun.stdin.stream()) onLine(decoder.decode(chunk, { stream: true }))
await queue
process.exit(0)
