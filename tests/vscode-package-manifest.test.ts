import { expect, test } from "bun:test"
import manifest from "../apps/vscode-extension/package.json"

test("VS Code manifest is marketplace- and VSIX-ready", () => {
  expect(manifest).toMatchObject({ name: "mathos", publisher: "mathos-research", license: "MIT", engines: { vscode: expect.any(String) } })
  expect(manifest.activationEvents).toContain("onCommand:mathos.openAtlas")
  expect(manifest.categories).toContain("Other")
  const properties = manifest.contributes.configuration.properties
  expect(properties["mathos.executablePath"]).toBeTruthy()
  expect(properties["mathos.autoStartBridge"]).toBeTruthy()
  expect(properties["mathos.openAtlasInExternalBrowser"]).toBeTruthy()
  expect(JSON.stringify(properties)).not.toMatch(/api.?key|password|secret/i)
})
