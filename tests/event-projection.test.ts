import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve, sep } from "node:path"
import { MathOS } from "@mathos/core"
import { DatabaseClient, EventRepository } from "@mathos/storage"
import { databasePath, eventLogPath } from "@mathos/shared"
import { runOwnedProcess } from "./helpers/native-case-runner.ts"

const temps: string[] = []
const repositoryRoot = resolve(import.meta.dir, "..")
const tempDir = (track = true) => { const value = mkdtempSync(join(tmpdir(), "mathos-events-")); if (track) temps.push(value); return value }
function removeEventRoot(value: string): void {
  const target = resolve(value), tempRoot = resolve(tmpdir())
  if (!target.startsWith(`${tempRoot}${sep}`) || !basename(target).startsWith("mathos-events-")) throw new Error(`Unsafe event fixture cleanup: ${target}`)
  rmSync(target, { recursive: true, force: true, ...(process.platform === "win32" ? { maxRetries: 3, retryDelay: 100 } : {}) })
}
afterEach(() => { for (const value of temps.splice(0)) removeEventRoot(value) })

describe("canonical event projection", () => {
  test("storage unit of work rolls back domain and event writes together", async () => {
    const created = await MathOS.init(tempDir(), "uow")
    const client = new DatabaseClient(databasePath(created.root))
    expect(() => client.unitOfWork(() => {
      client.db.query("UPDATE workspaces SET name = 'changed'").run()
      throw new Error("rollback")
    })).toThrow("rollback")
    expect(client.db.query<{ name: string }, []>("SELECT name FROM workspaces").get()?.name).toBe("uow")
    client.close()
  })

  test("a JSONL append failure does not fail a committed event and records degraded health", async () => {
    const created = await MathOS.init(tempDir(), "append-failure")
    const app = MathOS.open(created.root, { eventProjectionHook: (point) => { if (point === "before_jsonl_append") throw new Error("disk full") } })
    expect(() => app.createClaim({ kind: "conjecture", title: "Durable", naturalStatement: "x" })).not.toThrow()
    expect(app.eventProjectionHealth().status).toBe("EVENT_PROJECTION_DEGRADED")
    expect(app.eventProjectionHealth().detail).toContain("disk full")
    const db = new DatabaseClient(databasePath(created.root))
    expect(new EventRepository(db.db).list(app.status().projectName === "" ? "" : db.db.query<{id:string}, []>("SELECT id FROM workspaces").get()!.id).some((event) => event.action === "claim_created")).toBe(true)
    db.close(); app.close()
  })

  test("a later successful append cannot hide an earlier projection gap", async () => {
    const created = await MathOS.init(tempDir(), "sticky-degraded")
    let fail = true
    const app = MathOS.open(created.root, { eventProjectionHook: (point) => {
      if (point === "before_jsonl_append" && fail) { fail = false; throw new Error("first append lost") }
    } })
    app.createClaim({ kind: "lemma", title: "Missing", naturalStatement: "x" })
    app.createClaim({ kind: "lemma", title: "Later", naturalStatement: "y" })
    expect(app.eventProjectionHealth().status).toBe("EVENT_PROJECTION_DEGRADED")
    app.close()
  })

  test("rebuild atomically replaces drift with deterministic ordered JSONL without duplicates", async () => {
    const created = await MathOS.init(tempDir(), "rebuild")
    const app = MathOS.open(created.root)
    app.createClaim({ kind: "lemma", title: "One", naturalStatement: "1" })
    const original = readFileSync(eventLogPath(created.root), "utf8")
    writeFileSync(eventLogPath(created.root), `${original}${original}`, "utf8")
    expect(app.eventProjectionHealth().status).toBe("EVENT_PROJECTION_DEGRADED")
    const first = app.rebuildEventProjection()
    expect(first.status).toBe("HEALTHY")
    const canonical = readFileSync(eventLogPath(created.root), "utf8")
    expect(canonical.split("\n").filter(Boolean).length).toBe(3)
    app.rebuildEventProjection()
    expect(readFileSync(eventLogPath(created.root), "utf8")).toBe(canonical)
    app.close()
  })

  test("crash after durable DB event is detected and recoverable", async () => {
    const created = await MathOS.init(tempDir(), "crash")
    const app = MathOS.open(created.root, { eventProjectionHook: (point, event) => { if (point === "after_transaction" && event.action === "claim_created") throw new Error("crash") } })
    expect(() => app.createClaim({ kind: "conjecture", title: "Crash", naturalStatement: "x" })).toThrow("crash")
    app.close()
    const recovered = MathOS.open(created.root)
    expect(recovered.eventProjectionHealth().status).toBe("EVENT_PROJECTION_DEGRADED")
    recovered.rebuildEventProjection()
    expect(recovered.eventProjectionHealth().status).toBe("HEALTHY")
    recovered.close()
  })

  test("failure before DB insert creates no canonical event", async () => {
    const created = await MathOS.init(tempDir(), "before-db")
    const app = MathOS.open(created.root, { eventProjectionHook: (point, event) => { if (point === "before_db_event" && event.action === "claim_created") throw new Error("before db") } })
    expect(() => app.createClaim({ kind: "lemma", title: "Boundary", naturalStatement: "x" })).toThrow("before db")
    expect(app.rebuildEventProjection().eventCount).toBe(2)
    expect(app.listClaims()).toHaveLength(0)
    app.close()
  })

  test("failure after JSONL append never duplicates the projection", async () => {
    const created = await MathOS.init(tempDir(), "after-append")
    const app = MathOS.open(created.root, { eventProjectionHook: (point, event) => { if (point === "after_jsonl_append" && event.action === "claim_created") throw new Error("after append") } })
    expect(() => app.createClaim({ kind: "lemma", title: "Once", naturalStatement: "x" })).not.toThrow()
    app.rebuildEventProjection()
    app.rebuildEventProjection()
    const ids = readFileSync(eventLogPath(created.root), "utf8").trim().split("\n").map((line) => JSON.parse(line).event_id)
    expect(new Set(ids).size).toBe(ids.length)
    app.close()
  })
})

const crashBoundaries = [
    ["before_domain_mutation", false, false],
    ["after_domain_mutation", false, false],
    ["before_db_event", false, false],
    ["after_db_event", false, false],
    ["after_transaction", true, false],
    ["before_jsonl_append", true, false],
    ["after_jsonl_append", true, true],
  ] as const
for (const [point, committed, projected] of crashBoundaries) {
  test(`hard process exit at ${point} recovers transaction/projection state`, async () => {
    const root = tempDir()
    const created = await MathOS.init(root, `hard-${point}`)
    let child
    try {
      child = await runOwnedProcess([process.execPath, join(import.meta.dir, "fixtures/event-crash-child.ts"), created.root, point], { cwd: repositoryRoot, env: process.env, budgetMs: 10_000 })
    } catch (error) {
      // An unconfirmed shutdown retains its fixture instead of deleting files
      // beneath a possibly live process. The error reports the owned PID.
      if (error instanceof Error && error.message.includes("shutdown is unconfirmed")) {
        const index = temps.indexOf(root)
        if (index >= 0) temps.splice(index, 1)
        throw new Error(`Crash fixture retained at ${root}: ${error.message}`, { cause: error })
      }
      throw error
    }
    expect(child.timedOut).toBe(false)
    expect(child.exitCode).toBe(77)
    const db = new DatabaseClient(databasePath(created.root)); const workspace = db.db.query<{id:string},[]>("SELECT id FROM workspaces").get()!
    const claimCount = Number(db.db.query<{n:number},[]>("SELECT COUNT(*) AS n FROM claims").get()!.n)
    const eventCount = new EventRepository(db.db).list(workspace.id).length
    db.close()
    const lines = readFileSync(eventLogPath(created.root), "utf8").split("\n").filter(Boolean).length
    expect(claimCount).toBe(committed ? 1 : 0)
    expect(eventCount).toBe(committed ? 3 : 2)
    expect(lines).toBe(projected ? 3 : 2)
    const recovered = MathOS.open(created.root)
    if (committed && !projected) expect(recovered.eventProjectionHealth().status).toBe("EVENT_PROJECTION_DEGRADED")
    recovered.rebuildEventProjection()
    expect(recovered.eventProjectionHealth().status).toBe("HEALTHY")
    recovered.close()
  }, 90_000) // Includes the owned process's bounded tree shutdown and close checks.
}

test("rebuild serializes with a live cross-process writer", async () => {
  const root = tempDir(false)
  let app: MathOS | null = null, childClosed = true
  try {
    const created = await MathOS.init(root, "concurrent-rebuild")
    app = MathOS.open(created.root)
    childClosed = false
    const writer = runOwnedProcess([process.execPath, join(import.meta.dir, "fixtures/event-writer-child.ts"), created.root, "20"], { cwd: repositoryRoot, env: process.env, budgetMs: 10_000 })
    let child: Awaited<typeof writer>
    try {
      for (let index = 0; index < 30; index += 1) app.rebuildEventProjection()
    } finally {
      try {
        child = await writer
        childClosed = true
      } catch (error) {
        throw new Error(`Event writer fixture retained at ${root}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
      }
    }
    if (child.timedOut || child.exitCode !== 0) throw new Error(`Event writer failed (exit ${child.exitCode}, timedOut=${child.timedOut}): ${child.output}`)
    app.rebuildEventProjection()
    const ids = readFileSync(eventLogPath(created.root), "utf8").trim().split("\n").map((line) => JSON.parse(line).event_id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(app.eventProjectionHealth().status).toBe("HEALTHY")
    expect(app.listClaims()).toHaveLength(20)
  } finally {
    try { app?.close() }
    catch (error) { throw new Error(`Event fixture retained at ${root}: parent database close failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error }) }
    if (childClosed) removeEventRoot(root)
  }
}, 90_000)

test("events rebuild is available through the CLI", async () => {
  const created = await MathOS.init(tempDir(), "cli-rebuild")
  writeFileSync(eventLogPath(created.root), "drift\n", "utf8")
  const cli = join(repositoryRoot, "apps/tui/src/cli.ts")
  const result = Bun.spawnSync([process.execPath, cli, "events", "rebuild"], { cwd: created.root, stdout: "pipe", stderr: "pipe" })
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString()).toContain("Event projection rebuilt")
})
