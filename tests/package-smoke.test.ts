import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import * as computation from "@mathos/computation"
import * as core from "@mathos/core"
import * as domain from "@mathos/domain"
import * as events from "@mathos/events"
import * as graph from "@mathos/graph"
import * as lean from "@mathos/lean"
import * as literature from "@mathos/literature"
import * as models from "@mathos/models"
import * as retrieval from "@mathos/retrieval"
import * as shared from "@mathos/shared"
import * as storage from "@mathos/storage"
import * as vcs from "@mathos/vcs"
import * as workspace from "@mathos/workspace"

describe("package smoke", () => {
  test("all public workspace packages import and the CLI bin starts", () => {
    const packages = [computation, core, domain, events, graph, lean, literature, models, retrieval, shared, storage, vcs, workspace]
    expect(packages.every((item) => Object.keys(item).length > 0)).toBe(true)
    const root = resolve(import.meta.dir, "..")
    const cli = Bun.spawnSync([process.execPath, resolve(root, "apps/tui/src/cli.ts"), "--version"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(cli.exitCode).toBe(0)
    expect(new TextDecoder().decode(cli.stdout)).toContain(shared.mathosVersion())
  })
})
