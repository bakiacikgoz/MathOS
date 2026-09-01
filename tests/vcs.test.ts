import { describe, expect, test } from "bun:test"
import { FakeVcs } from "@mathos/vcs"

describe("FakeVcs", () => {
  test("setup, branch, worktree, pause/abandon bookkeeping", async () => {
    const vcs = new FakeVcs()
    expect((await vcs.detect("/tmp/x")).initialized).toBe(false)
    await vcs.initialize("/tmp/x")
    expect((await vcs.detect("/tmp/x")).initialized).toBe(true)
    await vcs.createBranch("/tmp/x", "mathos/B-001-x")
    const tree = await vcs.createWorktree("/tmp/x", "mathos/B-001-x", "/tmp/mathos-wt")
    expect(tree.branch).toBe("mathos/B-001-x")
    await vcs.removeWorktree("/tmp/x", tree.path, tree.branch)
    expect(vcs.worktrees.size).toBe(0)
  })
})
