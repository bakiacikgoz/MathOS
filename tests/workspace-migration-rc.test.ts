import { expect, test } from "bun:test"
import { existsSync, mkdtempSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { DatabaseClient, SCHEMA_EPOCH } from "@mathos/storage"

test("supported older epoch is backed up before migration", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-migrate-")), path = join(root, ".mathos", "mathos.db")
  let client = new DatabaseClient(path); client.migrate(); client.db.query("UPDATE mathos_meta SET value=? WHERE key='schema_epoch'").run(String(SCHEMA_EPOCH - 1)); client.close()
  client = new DatabaseClient(path); client.migrate(); expect(client.schemaEpoch()).toBe(SCHEMA_EPOCH); client.close()
  const backups = join(root, ".mathos", "backups"); expect(existsSync(backups)).toBe(true); expect(readdirSync(backups).some(name => name.startsWith(`pre-migration-${SCHEMA_EPOCH - 1}-`))).toBe(true)
})
