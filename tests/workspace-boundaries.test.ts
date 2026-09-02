import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createNotebookRegistry } from "@mathos/notebook"
import { createSolverRegistry } from "@mathos/solvers"
import { createPluginRegistry } from "@mathos/plugins"

const root = resolve(import.meta.dir, "..")

describe("MathOS v1 workspace boundaries", () => {
  test("new bounded contexts expose typed empty registries", () => {
    expect(createNotebookRegistry().documents).toEqual([])
    expect(createSolverRegistry().adapters).toEqual([])
    expect(createPluginRegistry().plugins).toEqual([])
  })

  test("Atlas and VS Code entrypoints are wired to real build commands", () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { scripts: Record<string, string> }
    expect(packageJson.scripts["typecheck:all"]).toBeTruthy()
    expect(packageJson.scripts["build:atlas"]).toContain("scripts/build-atlas.ts")
    expect(packageJson.scripts["build:vscode"]).toContain("scripts/build-vscode.ts")
    expect(packageJson.scripts["test:v1"]).toContain("workspace-boundaries.test.ts")
    expect(existsSync(resolve(root, "apps/atlas/src/main.tsx"))).toBe(true)
    expect(existsSync(resolve(root, "apps/vscode-extension/src/extension.ts"))).toBe(true)
  })
})
