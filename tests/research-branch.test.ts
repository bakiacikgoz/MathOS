import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import { FakeVcs } from "@mathos/vcs"

const dirs: string[] = []
function temp() {
  const dir = mkdtempSync(join(tmpdir(), "mathos-branch-"))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("research branches", () => {
  test("MAIN exists with sequential IDs, inheritance and local isolation", async () => {
    const created = await MathOS.init(temp(), "ws")
    const vcs = new FakeVcs()
    const app = MathOS.open(created.root, { vcs })
    expect(app.currentBranch().id).toBe("B-000")
    expect(app.currentBranch().name).toBe("MAIN")
    const parentClaim = app.createClaim({ kind: "conjecture", title: "Root", statement: "P" })
    const child = await app.createBranch("contradiction approach")
    expect(child.id).toBe("B-001")
    expect(child.parentBranchId).toBe("B-000")
    app.switchBranch("B-001")
    expect(app.listClaims().map((item) => item.id)).toContain(parentClaim.id)
    expect(app.claimRelation(parentClaim.id)).toBe("INHERITED")
    const local = app.createClaim({ kind: "lemma", title: "Local", statement: "Q" })
    expect(app.claimRelation(local.id)).toBe("LOCAL")
    app.switchBranch("MAIN")
    expect(app.listClaims().map((item) => item.id)).not.toContain(local.id)
    expect(() => app.claimRelation(local.id)).toThrow(`Claim ${local.id} is not visible on branch B-000.`)
    expect(app.listClaims().map((item) => item.id)).toContain(parentClaim.id)
    app.pauseBranch("B-001")
    expect(app.getBranch("B-001").status).toBe("PAUSED")
    app.resumeBranch("B-001")
    expect(app.currentBranch().id).toBe("B-001")
    const preview = app.previewMerge("B-001")
    expect(preview.additiveClaims).toBe(1)
    expect(preview.conflicts).toBe(0)
    app.mergeBranch("B-001", { applySafe: true })
    app.switchBranch("MAIN")
    expect(app.listClaims().map((item) => item.id)).toContain(local.id)
    app.close()
  })

  test("FakeVcs rollback on worktree failure", async () => {
    const created = await MathOS.init(temp(), "ws")
    const vcs = new FakeVcs()
    await vcs.initialize(created.root)
    vcs.failNext = "createWorktree"
    const app = MathOS.open(created.root, { vcs })
    await expect(app.createBranch("broken")).rejects.toThrow("fake createWorktree failed")
    expect(app.listBranches().map((item) => item.id)).toEqual(["B-000"])
    app.close()
  })

  test("abandon preserves history and last active persists", async () => {
    const created = await MathOS.init(temp(), "ws")
    const app = MathOS.open(created.root, { vcs: new FakeVcs() })
    const child = await app.createBranch("lemma-route")
    app.switchBranch(child.id)
    app.close()
    const reopened = MathOS.open(created.root, { vcs: new FakeVcs() })
    expect(reopened.currentBranch().id).toBe(child.id)
    reopened.abandonBranch(child.id)
    expect(reopened.currentBranch().id).toBe("B-000")
    expect(reopened.getBranch(child.id).status).toBe("ABANDONED")
    reopened.close()
  })
})

describe("real git worktree isolation", () => {
  test("child file edits do not change MAIN", async () => {
    const created = await MathOS.init(temp(), "gitws")
    const app = MathOS.open(created.root)
    await app.setupResearchVersioning()
    const child = await app.createBranch("isolated")
    expect(child.worktreePath).toBeTruthy()
    mkdirSync(join(child.worktreePath!, "formal"), { recursive: true })
    const childFile = join(child.worktreePath!, "formal", "note.lean")
    writeFileSync(childFile, "theorem foo : True := by trivial\n", "utf8")
    const mainFile = join(created.root, "formal", "note.lean")
    expect(() => readFileSync(mainFile, "utf8")).toThrow()
    writeFileSync(join(created.root, "formal", "Main.lean"), "theorem main_foo : True := by trivial\n", "utf8")
    expect(readFileSync(join(created.root, "formal", "Main.lean"), "utf8")).toContain("main_foo")
    expect(readFileSync(childFile, "utf8")).toContain("foo")
    expect(readFileSync(childFile, "utf8")).not.toContain("main_foo")
    app.close()
  })
})
