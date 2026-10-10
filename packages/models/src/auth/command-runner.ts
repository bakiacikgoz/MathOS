import type { SecretCommandRunner } from "./types.ts"

const SECRET_COMMAND_TIMEOUT_MS = 60_000

export const bunSecretCommandRunner: SecretCommandRunner = {
  async run(executable, args, stdin) {
    const process = Bun.spawn([executable, ...args], { stdin: stdin === undefined ? "ignore" : "pipe", stdout: "pipe", stderr: "pipe", env: processEnvWithoutMathOSSecrets() })
    if (stdin !== undefined && process.stdin && typeof process.stdin !== "number") { process.stdin.write(stdin); process.stdin.end() }
    // A locked keychain or keyring can wait for an unlock prompt forever; give the user a minute, then fail the call.
    const timer = setTimeout(() => { try { process.kill() } catch {} }, SECRET_COMMAND_TIMEOUT_MS)
    try {
      const [exitCode, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()])
      return { exitCode, stdout, stderr }
    } finally { clearTimeout(timer) }
  },
}

function processEnvWithoutMathOSSecrets(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("MATHOS_SECRET_") && key !== "MATHOS_API_KEY"))
}
