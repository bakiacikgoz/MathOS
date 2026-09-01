import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import { DatabaseClient, EventRepository } from "@mathos/storage"
import { databasePath, eventLogPath } from "@mathos/shared"

const temps: string[] = []
const tempDir = () => { const value = mkdtempSync(join(tmpdir(), "mathos-events-")); temps.push(value); return value }
afterEach(() => { for (const value of temps.splice(0)) rmSync(value, { recursive: true, force: true }) })

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
    const app = MathOS.open(created.root, { eventProjectionHook: (point, event) => { if (point === "after_db_event" && event.action === "claim_created") throw new Error("crash") } })
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
