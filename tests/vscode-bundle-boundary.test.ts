import { expect, test } from "bun:test"
import { builtinModules } from "node:module"
import { relative, resolve } from "node:path"

test("VS Code client bundles only first-party code and retains only host runtime imports", async () => {
  const root = resolve(import.meta.dir, "..")
  const built = await Bun.build({
    entrypoints: [resolve(root, "apps/vscode-extension/src/extension.ts")],
    target: "node", format: "esm", external: ["vscode"], minify: false,
    metafile: true,
  })
  expect(built.success).toBe(true)
  expect(built.metafile).toBeDefined()
  const outputs = Object.values(built.metafile!.outputs)
  expect(outputs).toHaveLength(1)
  const contributing = outputs.flatMap(output => Object.entries(output.inputs)
    .filter(([, input]) => input.bytesInOutput > 0)
    .map(([path]) => path))
  const bundled = contributing.map(path => relative(root, resolve(root, path)).replaceAll("\\", "/"))
  expect(bundled).toContain("apps/vscode-extension/src/extension.ts")
  const sharedHelpers = new Set(["packages/models/src/redact.ts", "packages/models/src/auth/external-client-auth.ts"])
  expect(bundled.filter(path => /(^|\/)node_modules(\/|$)/.test(path) || (!path.startsWith("apps/vscode-extension/src/") && !sharedHelpers.has(path)))).toEqual([])
  const hostImports = new Set(["vscode", ...builtinModules, ...builtinModules.map(name => `node:${name}`)])
  const externalInputs = contributing.flatMap(path => built.metafile!.inputs[path]?.imports ?? []).filter(imported => imported.external)
  expect(externalInputs.filter(imported => !hostImports.has(imported.path))).toEqual([])
  expect(outputs.flatMap(output => output.imports).filter(imported => !hostImports.has(imported.path))).toEqual([])
})
