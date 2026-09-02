import { expect, test } from "bun:test"
import { WorkspaceController } from "../apps/vscode-extension/src/workspace-controller.ts"

test("untrusted workspaces expose metadata but block executable and mutation capabilities", () => {
  const controller = new WorkspaceController("C:/workspace", false)
  expect(controller.allowedCapabilities()).toEqual(["claims.read", "docs.read", "graph.read", "status.read"])
  for (const operation of ["model.call", "lean.run", "experiment.run", "claim.write", "plugin.run"]) expect(() => controller.assertAllowed(operation)).toThrow("WORKSPACE_UNTRUSTED")
  expect(controller.explainBlocked("lean.run")).toContain("Workspace Trust")
})
