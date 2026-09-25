import { expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"

const cli = join(import.meta.dir, "..", "apps", "tui", "src", "cli.ts")
const run = (cwd: string, ...args: string[]) => { const proc = Bun.spawnSync([process.execPath, cli, ...args], { cwd, stdout: "pipe", stderr: "pipe" }); return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() } }

test("claim depend records a relation once, refuses self links and unknown relations, and feeds the graph", async () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-depend-")), created = await MathOS.init(root, "depend")
  const app = MathOS.open(created.root)
  const lemma = app.createClaim({ kind: "lemma", title: "L", statement: "P" }), theorem = app.createClaim({ kind: "theorem", title: "T", statement: "Q" }), definition = app.createClaim({ kind: "definition", title: "D", statement: "R" })
  app.close()
  const first = JSON.parse(run(created.root, "claim", "depend", theorem.id, "--on", lemma.id, "--json").out)
  expect(first.created).toBe(true)
  expect(JSON.parse(run(created.root, "claim", "depend", theorem.id, "--on", lemma.id, "--json").out).created).toBe(false)
  expect(run(created.root, "claim", "depend", theorem.id, "--on", theorem.id).err).toContain("DEPENDENCY_SELF_REFERENCE")
  expect(run(created.root, "claim", "depend", theorem.id, "--on", lemma.id, "--relation", "loves").err).toContain("DEPENDENCY_RELATION_INVALID")
  expect(run(created.root, "claim", "depend", lemma.id, "--on", definition.id, "--relation", "uses_definition").code).toBe(0)
  const graph = JSON.parse(run(created.root, "graph", "show", "--json").out) as { edges: Array<{ kind: string; fromNodeId: string; toNodeId: string }> }
  expect(graph.edges).toContainEqual(expect.objectContaining({ kind: "DEPENDS_ON", fromNodeId: theorem.id, toNodeId: lemma.id }))
  expect(graph.edges).toContainEqual(expect.objectContaining({ kind: "REQUIRES", fromNodeId: lemma.id, toNodeId: definition.id }))
}, 60_000)
