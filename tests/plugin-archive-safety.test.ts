import { afterEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, join, resolve, sep } from "node:path"
import { PersistentPluginRegistry } from "@mathos/plugins"
import { writeTarGzip } from "@mathos/shared/archive"

const roots: string[] = []
function temp(): string { const root = mkdtempSync(join(tmpdir(), "mathos-plugin-archive-")); roots.push(root); return root }
afterEach(() => {
  for (const root of roots.splice(0)) {
    const safe = resolve(root)
    if (!safe.startsWith(`${resolve(tmpdir())}${sep}`) || !safe.split(sep).at(-1)?.startsWith("mathos-plugin-archive-")) throw new Error(`Unsafe test cleanup: ${safe}`)
    rmSync(safe, { recursive: true, force: true })
  }
})

const manifest = JSON.stringify({
  schemaVersion: "mathos-plugin-v1", id: "example.solver", name: "Example", version: "1.0.0",
  protocol: "json-rpc-2.0-stdio", kind: "SOLVER", executable: "node", args: ["main.js"],
  permissions: { networkHosts: [], readRoots: [], writeRoots: [], executables: ["node"], environmentVariables: [], maxRuntimeMs: 1000, maxOutputBytes: 1000 },
  supportedSchemaVersions: ["solver-v1"],
})
type Entry = { name: string; body?: string; type?: "0" | "1" | "2" | "5"; link?: string }
function archive(root: string, entries: Entry[]): string {
  const octal = (header: Buffer, value: number, offset: number, length: number) => header.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, length, "ascii")
  const blocks: Buffer[] = []
  for (const entry of entries) {
    const body = Buffer.from(entry.body ?? "")
    const header = Buffer.alloc(512)
    header.write(entry.name, 0, 100, "utf8")
    octal(header, entry.type === "5" ? 0o755 : 0o644, 100, 8)
    octal(header, 0, 108, 8); octal(header, 0, 116, 8)
    octal(header, body.length, 124, 12); octal(header, 0, 136, 12)
    header.fill(0x20, 148, 156)
    header.write(entry.type ?? "0", 156, 1, "ascii")
    header.write(entry.link ?? "", 157, 100, "utf8")
    header.write("ustar\0", 257, 6, "ascii"); header.write("00", 263, 2, "ascii")
    octal(header, header.reduce((sum, byte) => sum + byte, 0), 148, 8)
    blocks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  const output = join(root, "plugin.tar")
  writeFileSync(output, Buffer.concat(blocks))
  return output
}
const validEntries: Entry[] = [
  { name: "plugin/", type: "5" },
  { name: "plugin/mathos-plugin.json", body: manifest },
  { name: "plugin/main.js", body: "process.exit(0)" },
]
const windowsGitTar = join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "usr", "bin", "tar.exe")

test("plugin archive installs regular files from a versioned root", () => {
  const root = temp(), registry = new PersistentPluginRegistry(join(root, "data"))
  const installed = registry.install(archive(root, validEntries))
  expect(installed.id).toBe("example.solver")
  expect(readFileSync(join(installed.installPath, "main.js"), "utf8")).toBe("process.exit(0)")
})

test("plugin archive installs a gzip package with Unicode payload names", () => {
  const root = temp(), packageRoot = join(root, "source", "plugin"), registry = new PersistentPluginRegistry(join(root, "Türkçe Veri"))
  mkdirSync(packageRoot, { recursive: true })
  writeFileSync(join(packageRoot, "mathos-plugin.json"), manifest)
  writeFileSync(join(packageRoot, "main.js"), "process.exit(0)")
  writeFileSync(join(packageRoot, "Özet.txt"), "Türkçe içerik")
  const packed = join(root, "package.tar.gz")
  writeTarGzip(dirname(packageRoot), packed, ["plugin"])
  const installed = registry.install(packed)
  expect(readFileSync(join(installed.installPath, "Özet.txt"), "utf8")).toBe("Türkçe içerik")
})

test("plugin archive rejects traversal before writing outside the extraction root", () => {
  const root = temp(), registry = new PersistentPluginRegistry(join(root, "data"))
  const canary = join(root, "outside.txt")
  writeFileSync(canary, "untouched")
  const crafted = archive(root, [...validEntries, { name: "plugin/../../outside.txt", body: "modified" }])
  expect(() => registry.install(crafted)).toThrow("PLUGIN_ARCHIVE_TRAVERSAL")
  expect(readFileSync(canary, "utf8")).toBe("untouched")
  expect(registry.list()).toEqual([])
})

test("plugin archive rejects duplicate member names before activation", () => {
  const root = temp(), registry = new PersistentPluginRegistry(join(root, "data"))
  const crafted = archive(root, [...validEntries, { name: "plugin/main.js", body: "process.exit(1)" }])
  expect(() => registry.install(crafted)).toThrow("DUPLICATE")
  expect(registry.list()).toEqual([])
})

for (const type of ["2", "1"] as const) {
  test(`plugin archive rejects ${type === "2" ? "symbolic" : "hard"} links before extraction`, () => {
    const root = temp(), data = join(root, "data"), registry = new PersistentPluginRegistry(data)
    const canary = join(root, "outside")
    mkdirSync(canary)
    writeFileSync(join(canary, "keep.txt"), "untouched")
    const crafted = archive(root, [
      ...validEntries,
      { name: "plugin/escape", type, link: type === "2" ? canary : join(canary, "keep.txt") },
      { name: "plugin/escape/keep.txt", body: "modified" },
    ])
    expect(() => registry.install(crafted)).toThrow("PLUGIN_ARCHIVE_ENTRY_TYPE_UNSAFE")
    expect(readFileSync(join(canary, "keep.txt"), "utf8")).toBe("untouched")
    expect(registry.list()).toEqual([])
  })
}

test.skipIf(process.platform !== "win32" || !existsSync(windowsGitTar))("plugin archive installs Unicode names when Git tar is first on PATH", () => {
  const gitTar = windowsGitTar
  if (process.env.MATHOS_PLUGIN_ARCHIVE_CHILD !== "1") {
    const environment: Record<string, string | undefined> = { ...process.env, MATHOS_PLUGIN_ARCHIVE_CHILD: "1" }
    for (const key of Object.keys(environment)) if (key.toLowerCase() === "path") delete environment[key]
    environment.Path = `${dirname(gitTar)}${delimiter}${process.env.PATH ?? ""}`
    const result = Bun.spawnSync([process.execPath, "test", join(import.meta.dir, "plugin-archive-safety.test.ts"), "--test-name-pattern", "plugin archive installs Unicode names when Git tar"], {
      cwd: join(import.meta.dir, ".."), env: environment,
      stdout: "pipe", stderr: "pipe",
    })
    if (result.exitCode !== 0) throw new Error(`${result.stdout}${result.stderr}`)
    expect(result.exitCode).toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain("1 pass")
    return
  }
  const selected = Bun.spawnSync([join(process.env.SystemRoot!, "System32", "where.exe"), "tar.exe"], { stdout: "pipe" }).stdout.toString().split(/\r?\n/)[0]?.trim()
  expect(selected?.toLowerCase()).toBe(gitTar.toLowerCase())
  const root = temp(), dataRoot = join(root, "Türkçe Veri"), sourceRoot = join(root, "Kaynak Dosyalar")
  const packageRoot = join(sourceRoot, "plugin")
  mkdirSync(packageRoot, { recursive: true })
  writeFileSync(join(packageRoot, "mathos-plugin.json"), manifest)
  writeFileSync(join(packageRoot, "main.js"), "process.exit(0)")
  writeFileSync(join(packageRoot, "Özet.txt"), "Türkçe içerik")
  writeFileSync(join(packageRoot, "measurement-π.txt"), "pi")
  const packed = join(sourceRoot, "plugin.tar.gz")
  writeTarGzip(sourceRoot, packed, ["plugin"])
  const registry = new PersistentPluginRegistry(dataRoot)
  const installed = registry.install(packed)
  expect(installed.id).toBe("example.solver")
  expect(readdirSync(installed.installPath)).toContain("Özet.txt")
  expect(readFileSync(join(installed.installPath, "Özet.txt"), "utf8")).toBe("Türkçe içerik")
  expect(readFileSync(join(installed.installPath, "measurement-π.txt"), "utf8")).toBe("pi")
})
