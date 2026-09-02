#!/usr/bin/env bun
import { MathOS } from "@mathos/core"
import { cliExitCode, currentBuildIdentity, formatCliError, formatUserError } from "@mathos/shared"
import { runHeadless } from "./headless.ts"

const args = process.argv.slice(2)

if (args[0] === "bridge" && args[1] === "stdio") {
  const { runBridgeStdio } = await import("@mathos/core/bridge-stdio"), workspaceRoot = MathOS.locate(process.cwd()), app = MathOS.open(workspaceRoot), workspace = app.requireWorkspace(), trusted = process.env.MATHOS_WORKSPACE_TRUST === "trusted"
  try { await runBridgeStdio({ workspaceRoot, workspaceId: workspace.id, trusted, handlers: {
    "claims.list": async () => app.listClaims(),
    "claims.create": async params => { const value = params as { kind?: string; title?: string; statement?: string }; if (!value.kind || !value.title || !value.statement) throw new Error("BRIDGE_PARAMS_INVALID"); return app.createClaim({ kind: value.kind as never, title: value.title, statement: value.statement }) },
    "graph.snapshot": async () => app.buildGraph({ includeLiterature: true }),
    "research.run": async (params, signal, progress) => { const id = String((params as {id?:unknown})?.id ?? ""); if (!id) throw new Error("BRIDGE_PARAMS_INVALID"); signal.addEventListener("abort", () => { try { app.pauseResearch(id) } catch {} }, { once: true }); progress({ phase: "started" }); const result = await app.runResearch(id); progress({ phase: "finished", status: result.status }); return result },
  } }) } finally { app.close() }
  process.exit(0)
}

if (args.includes("--version") || args[0] === "version" || args[0] === "--version") {
  process.stdout.write(args.includes("--json")?`${JSON.stringify(currentBuildIdentity())}\n`:`${MathOS.versionText()}\n`)
  process.exit(0)
}

if(args[0]==="about"&&args.includes("--json")){process.stdout.write(`${JSON.stringify(currentBuildIdentity())}\n`);process.exit(0)}

if (args.includes("--debug")) {
  process.env.MATHOS_DEBUG = "1"
}

if (args.length === 0) {
  const { startTui } = await import("./main.tsx")
  const code = await startTui()
  process.exit(code)
} else {
  try {
    const code = await runHeadless(args.filter((item) => item !== "--debug"))
    process.exit(code)
  } catch (error) {
    if (args.includes("--json")) process.stderr.write(`${JSON.stringify(formatCliError(error, { debug: process.env.MATHOS_DEBUG === "1" }))}\n`)
    else process.stderr.write(`${formatUserError(error)}${process.env.MATHOS_DEBUG === "1" && error instanceof Error && error.stack ? `\n${error.stack}` : ""}\n`)
    process.exit(cliExitCode(error))
  }
}
