#!/usr/bin/env bun
// Starts a compiled desktop host (the Tauri sidecar) and checks that it answers a real CLI request.
// Usage: bun scripts/smoke-host.ts <path-to-mathos-host[.exe]> [--secret-store]
// --secret-store also stores a throwaway key through the host and reads it back from the OS store.
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve, sep } from "node:path"
import { createSecretStore } from "../../../packages/models/src/index.ts"
import { DESKTOP_HOST_PROTOCOL } from "../host/protocol.ts"

const executable = process.argv[2], withSecret = process.argv.includes("--secret-store")
const expectedRevision = process.argv.find((arg) => arg.startsWith("--expect-revision="))?.slice("--expect-revision=".length)
const expectedBuildId = process.argv.find((arg) => arg.startsWith("--expect-build-id="))?.slice("--expect-build-id=".length)
const secretRef = `mathos-smoke-${process.pid}`, secretValue = `smoke-${crypto.randomUUID()}`
if (!executable) { console.error("usage: bun scripts/smoke-host.ts <mathos-host>"); process.exit(2) }
const cwd = mkdtempSync(join(tmpdir(), "mathos-host-smoke-"))
const host = Bun.spawn([executable], { stdin: "pipe", stdout: "pipe", stderr: "inherit" })
const timer = setTimeout(() => { console.error("DESKTOP_HOST_SMOKE_TIMEOUT"); host.kill(); process.exit(1) }, 60_000)

const answers = new Map<string, { code: number; stdout: string; stderr: string }>()
const reader = (async () => {
  let buffer = ""
  for await (const chunk of host.stdout.pipeThrough(new TextDecoderStream())) {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1)
      try { const row = JSON.parse(line); if (row.protocol === DESKTOP_HOST_PROTOCOL && row.id) answers.set(row.id, row) } catch {}
    }
    if (answers.size >= (withSecret ? 4 : 3)) break
  }
})()

host.stdin.write(`${JSON.stringify({ id: "version", cwd, args: ["--version"] })}\n`)
host.stdin.write(`${JSON.stringify({ id: "about", cwd, args: ["about", "--json"] })}\n`)
host.stdin.write(`${JSON.stringify({ id: "init", cwd, args: ["init", "--json"] })}\n`)
if (withSecret) host.stdin.write(`${JSON.stringify({ id: "secret", op: "secret-set", ref: secretRef, value: secretValue })}\n`)
host.stdin.flush()
await reader
clearTimeout(timer)
host.kill()
const cleanupTarget = resolve(cwd), tempRoot = resolve(tmpdir())
if (!cleanupTarget.startsWith(`${tempRoot}${sep}`) || !basename(cleanupTarget).startsWith("mathos-host-smoke-")) throw new Error(`Unsafe smoke cleanup: ${cleanupTarget}`)
rmSync(cleanupTarget, { recursive: true, force: true })

const version = answers.get("version"), about = answers.get("about"), init = answers.get("init")
let identity: { gitRevision?: string; buildId?: string } | null = null
try { identity = JSON.parse(about?.stdout ?? "") } catch {}
console.log(`version → code ${version?.code}: ${version?.stdout.trim()}`)
console.log(`about   → code ${about?.code}: ${identity ? JSON.stringify(identity) : (about?.stderr ?? "").trim()}`)
console.log(`init    → code ${init?.code}: ${(init?.stdout || init?.stderr || "").trim().slice(0, 200)}`)
let secretOk = true
if (withSecret) {
  const store = createSecretStore(), answer = answers.get("secret")
  const readBack = answer?.code === 0 ? await store.get(secretRef).catch((error) => `read failed: ${(error as Error).message}`) : null
  secretOk = readBack === secretValue
  console.log(`secret  → code ${answer?.code} ${answer?.stderr.trim() ?? ""}; ${(await store.capability()).backend}; read back ${secretOk ? "matches" : "DOES NOT match"}`)
  await store.delete(secretRef).catch(() => {})
}
const identityOk = about?.code === 0 && /^[0-9a-f]{40}$/.test(identity?.gitRevision ?? "") && !!identity?.buildId
  && (!expectedRevision || identity.gitRevision === expectedRevision)
  && (!expectedBuildId || identity.buildId === expectedBuildId)
if (version?.code !== 0 || init?.code !== 0 || !identityOk || !secretOk) { console.error("DESKTOP_HOST_SMOKE_FAILED"); process.exit(1) }
console.log("DESKTOP_HOST_SMOKE_OK")
