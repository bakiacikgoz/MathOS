#!/usr/bin/env bun
import { MathOS } from "@mathos/core"
import { formatUserError, isMathOSError } from "@mathos/shared"
import { runHeadless } from "./headless.ts"

const args = process.argv.slice(2)

if (args.includes("--version") || args[0] === "version" || args[0] === "--version") {
  process.stdout.write(`${MathOS.versionText()}\n`)
  process.exit(0)
}

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
    process.stderr.write(`${formatUserError(error)}\n`)
    process.exit(isMathOSError(error) ? 1 : 2)
  }
}
