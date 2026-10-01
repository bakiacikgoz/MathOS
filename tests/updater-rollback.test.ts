import { afterEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { applyAtomicUpdate, rollbackUpdate } from "../packages/update/src/index.ts"

async function lockOnWindows(path: string) {
  const quoted = path.replaceAll("'", "''")
  const script = `$stream=[System.IO.File]::Open('${quoted}',[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::None);[Console]::Out.WriteLine('LOCKED');[Console]::Out.Flush();[Console]::In.ReadLine();$stream.Dispose()`
  const child = Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], { stdin: "pipe", stdout: "pipe", stderr: "pipe" })
  const reader = child.stdout.getReader()
  const ready = await reader.read()
  if (new TextDecoder().decode(ready.value).trim() !== "LOCKED") {
    child.kill()
    throw new Error("Windows lock fixture failed to start")
  }
  return async () => {
    child.stdin.write("release\n")
    child.stdin.end()
    await child.exited
  }
}

const roots: string[] = []
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-update-"))
  roots.push(root)
  const current = join(root, "mathos")
  const candidate = join(root, "candidate")
  writeFileSync(current, "working")
  writeFileSync(candidate, "new")
  return { root, current, candidate, previous: `${current}.previous` }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

test("successful update preserves prior executable for manual rollback", () => {
  const { current, candidate, previous } = fixture()
  expect(applyAtomicUpdate({ current, candidate, preSmoke: () => true, postSmoke: () => true })).toMatchObject({ applied: true, current, rollback: previous })
  expect(readFileSync(current, "utf8")).toBe("new")
  expect(readFileSync(previous, "utf8")).toBe("working")
  expect(rollbackUpdate(current).rolledBack).toBe(true)
  expect(readFileSync(current, "utf8")).toBe("working")
})

test("successful update replaces older rollback only after candidate passes smoke", () => {
  const { root, current, candidate, previous } = fixture()
  writeFileSync(previous, "older")
  expect(applyAtomicUpdate({ current, candidate, preSmoke: () => true, postSmoke: () => true }).applied).toBe(true)
  expect(readFileSync(current, "utf8")).toBe("new")
  expect(readFileSync(previous, "utf8")).toBe("working")
  expect(readdirSync(root).filter(name => name.includes("staged") || name.includes("update-old"))).toEqual([])
})

test("post-install smoke failure restores executable and keeps older rollback", () => {
  const { root, current, candidate, previous } = fixture()
  writeFileSync(previous, "older")
  expect(() => applyAtomicUpdate({ current, candidate, preSmoke: () => true, postSmoke: () => false })).toThrow("UPDATE_POST_SMOKE_FAILED_ROLLED_BACK")
  expect(readFileSync(current, "utf8")).toBe("working")
  expect(readFileSync(previous, "utf8")).toBe("older")
  expect(readdirSync(root).filter(name => name.includes("staged") || name.includes("update-old"))).toEqual([])
})

test("post-smoke exception also restores executable and older rollback", () => {
  const { current, candidate, previous } = fixture()
  writeFileSync(previous, "older")
  expect(() => applyAtomicUpdate({ current, candidate, preSmoke: () => true, postSmoke: () => { throw new Error("smoke crashed") } })).toThrow("UPDATE_POST_SMOKE_FAILED_ROLLED_BACK")
  expect(readFileSync(current, "utf8")).toBe("working")
  expect(readFileSync(previous, "utf8")).toBe("older")
})

test("hard process exit inside post-smoke leaves canonical executable and both recovery generations", () => {
  const { root, current, candidate, previous } = fixture()
  writeFileSync(previous, "older")
  const entry = pathToFileURL(resolve(import.meta.dir, "../packages/update/src/index.ts")).href
  const script = `import { applyAtomicUpdate } from ${JSON.stringify(entry)}; applyAtomicUpdate({ current: process.env.MATHOS_UPDATE_CURRENT, candidate: process.env.MATHOS_UPDATE_CANDIDATE, preSmoke: () => true, postSmoke: () => { process.exit(77) } })`
  const child = Bun.spawnSync([process.execPath, "-e", script], {
    cwd: root,
    env: { ...process.env, MATHOS_UPDATE_CURRENT: current, MATHOS_UPDATE_CANDIDATE: candidate },
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(child.exitCode).toBe(77)
  expect(readFileSync(current, "utf8")).toBe("new")
  expect(readFileSync(previous, "utf8")).toBe("older")
  const recovery = readdirSync(root).filter(name => name.startsWith("mathos.update-old-"))
  expect(recovery).toHaveLength(1)
  expect(readFileSync(join(root, recovery[0]!), "utf8")).toBe("working")
})

test("hard process exit after first real rename never leaves canonical path missing", () => {
  const { root, current, candidate, previous } = fixture()
  writeFileSync(previous, "older")
  const entry = pathToFileURL(resolve(import.meta.dir, "../packages/update/src/index.ts")).href
  const script = `
    import { mock } from "bun:test";
    import * as fs from "node:fs";
    const renameReal = fs.renameSync;
    mock.module("node:fs", () => ({
      ...fs,
      renameSync(from, to) {
        renameReal(from, to);
        process.exit(78);
      }
    }));
    const { applyAtomicUpdate } = await import(${JSON.stringify(entry)});
    applyAtomicUpdate({ current: process.env.MATHOS_UPDATE_CURRENT, candidate: process.env.MATHOS_UPDATE_CANDIDATE, preSmoke: () => true, postSmoke: () => true });
  `
  const child = Bun.spawnSync([process.execPath, "-e", script], {
    cwd: root,
    env: { ...process.env, MATHOS_UPDATE_CURRENT: current, MATHOS_UPDATE_CANDIDATE: candidate },
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(child.exitCode).toBe(78)
  expect(readFileSync(current, "utf8")).toBe("new")
  expect(readFileSync(previous, "utf8")).toBe("older")
  const recovery = readdirSync(root).filter(name => name.startsWith("mathos.update-old-"))
  expect(recovery).toHaveLength(1)
  expect(readFileSync(join(root, recovery[0]!), "utf8")).toBe("working")
})

test("hard process exit before rollback replacement leaves canonical candidate and recovery copy", () => {
  const { root, current, candidate, previous } = fixture()
  writeFileSync(previous, "older")
  const entry = pathToFileURL(resolve(import.meta.dir, "../packages/update/src/index.ts")).href
  const script = `
    import { mock } from "bun:test";
    import * as fs from "node:fs";
    const renameReal = fs.renameSync;
    const current = process.env.MATHOS_UPDATE_CURRENT;
    mock.module("node:fs", () => ({
      ...fs,
      renameSync(from, to) {
        if (to === current && (from.includes(".update-old-") || from.endsWith(".previous"))) process.exit(79);
        renameReal(from, to);
      }
    }));
    const { applyAtomicUpdate } = await import(${JSON.stringify(entry)});
    applyAtomicUpdate({ current, candidate: process.env.MATHOS_UPDATE_CANDIDATE, preSmoke: () => true, postSmoke: () => false });
  `
  const child = Bun.spawnSync([process.execPath, "-e", script], {
    cwd: root,
    env: { ...process.env, MATHOS_UPDATE_CURRENT: current, MATHOS_UPDATE_CANDIDATE: candidate },
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(child.exitCode).toBe(79)
  expect(readFileSync(current, "utf8")).toBe("new")
  expect(readFileSync(previous, "utf8")).toBe("older")
  const recovery = readdirSync(root).filter(name => name.startsWith("mathos.update-old-"))
  expect(recovery).toHaveLength(1)
  expect(readFileSync(join(root, recovery[0]!), "utf8")).toBe("working")
})

test("hard process exit after first rollback filesystem mutation keeps canonical executable", () => {
  const { root, current, previous } = fixture()
  writeFileSync(previous, "older")
  const entry = pathToFileURL(resolve(import.meta.dir, "../packages/update/src/index.ts")).href
  const script = `
    import { mock } from "bun:test";
    import * as fs from "node:fs";
    const copyReal = fs.copyFileSync;
    const renameReal = fs.renameSync;
    mock.module("node:fs", () => ({
      ...fs,
      copyFileSync(from, to, flags) {
        copyReal(from, to, flags);
        process.exit(80);
      },
      renameSync(from, to) {
        renameReal(from, to);
        process.exit(80);
      }
    }));
    const { rollbackUpdate } = await import(${JSON.stringify(entry)});
    rollbackUpdate(process.env.MATHOS_UPDATE_CURRENT);
  `
  const child = Bun.spawnSync([process.execPath, "-e", script], {
    cwd: root,
    env: { ...process.env, MATHOS_UPDATE_CURRENT: current },
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(child.exitCode).toBe(80)
  expect(readFileSync(current, "utf8")).toBe("working")
  expect(readFileSync(previous, "utf8")).toBe("older")
  const recovery = readdirSync(root).filter(name => name.startsWith("mathos.failed-"))
  expect(recovery).toHaveLength(1)
  expect(readFileSync(join(root, recovery[0]!), "utf8")).toBe("working")
})

test("pre-smoke failure leaves executable and rollback untouched", () => {
  const { root, current, candidate, previous } = fixture()
  writeFileSync(previous, "older")
  expect(() => applyAtomicUpdate({ current, candidate, preSmoke: () => false, postSmoke: () => true })).toThrow("UPDATE_PRE_SMOKE_FAILED")
  expect(readFileSync(current, "utf8")).toBe("working")
  expect(readFileSync(previous, "utf8")).toBe("older")
  expect(readdirSync(root).sort()).toEqual(["candidate", "mathos", "mathos.previous"])
})

test("staging copy failure leaves executable and rollback untouched", () => {
  const { root, current, previous } = fixture()
  writeFileSync(previous, "older")
  expect(() => applyAtomicUpdate({ current, candidate: root, preSmoke: () => true, postSmoke: () => true })).toThrow()
  expect(readFileSync(current, "utf8")).toBe("working")
  expect(readFileSync(previous, "utf8")).toBe("older")
  expect(readdirSync(root).filter(name => name.includes("staged"))).toEqual([])
})

test("candidate and current cannot be the same executable", () => {
  const { current } = fixture()
  expect(() => applyAtomicUpdate({ current, candidate: current, preSmoke: () => true, postSmoke: () => true })).toThrow("UPDATE_ARTIFACT_SAME_AS_CURRENT")
  expect(readFileSync(current, "utf8")).toBe("working")
})

test("rollback refuses a directory in place of an executable backup", () => {
  const { current, previous } = fixture()
  mkdirSync(previous)
  expect(() => rollbackUpdate(current)).toThrow("UPDATE_ROLLBACK_INVALID")
  expect(readFileSync(current, "utf8")).toBe("working")
})

test.skipIf(process.platform !== "win32")("locked current executable aborts rename without losing current or older rollback", async () => {
  const { root, current, candidate, previous } = fixture()
  writeFileSync(previous, "older")
  const release = await lockOnWindows(current)
  try {
    expect(() => applyAtomicUpdate({ current, candidate, preSmoke: () => true, postSmoke: () => true })).toThrow("UPDATE_APPLY_FAILED_ROLLED_BACK")
  } finally {
    await release()
  }
  expect(readFileSync(current, "utf8")).toBe("working")
  expect(readFileSync(previous, "utf8")).toBe("older")
  expect(readdirSync(root).filter(name => name.includes("staged") || name.includes("update-old"))).toEqual([])
})

test.skipIf(process.platform !== "win32")("locked rollback source leaves current and backup recoverable", async () => {
  const { current, previous } = fixture()
  writeFileSync(previous, "older")
  const release = await lockOnWindows(previous)
  try {
    expect(() => rollbackUpdate(current)).toThrow()
  } finally {
    await release()
  }
  expect(readFileSync(current, "utf8")).toBe("working")
  expect(readFileSync(previous, "utf8")).toBe("older")
})
