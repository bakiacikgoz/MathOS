import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ContainerSandboxRuntime, PythonRuntime, cleanupSandboxContainer, dockerRunArguments } from "@mathos/computation"
import { runningSandboxContainerIds } from "../scripts/security-sandbox-smoke.ts"

test("container sandbox denies network and constrains process and filesystem", () => {
  const args = dockerRunArguments("/tmp/mathos")
  expect(args).toContain("none")
  expect(args).toContain("--read-only")
  expect(args).toContain("ALL")
  expect(args).toContain("no-new-privileges")
  expect(args).toContain("--pids-limit")
  expect(args[args.indexOf("--pids-limit") + 1]).toBe("1")
  expect(args).toContain("--memory")
  expect(args).toContain("--cpus")
  expect(args).toContain("65534:65534")
  expect(args.join(" ")).not.toMatch(/OPENAI|OPENROUTER|API_KEY|SSH_AUTH_SOCK/)
})

test("container sandbox fails closed when Docker is unavailable", async () => {
  if (Bun.which("docker")) return
  const capability = await new ContainerSandboxRuntime().inspect()
  expect(capability.available).toBe(false)
  expect(capability.reason).toContain("SANDBOX_UNAVAILABLE")
})

test("container sandbox explicitly configured without Docker fails closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "mathos-container-unavailable-"))
  try {
    const scriptPath = join(root, "main.py")
    await writeFile(scriptPath, "print('UNSANDBOXED_CANARY')\n")
    const result = await new PythonRuntime("python3", new ContainerSandboxRuntime(null)).execute({ executable: "python3", origin: "MODEL_GENERATED", scriptPath, cwd: root, timeoutMs: 500, maxOutputBytes: 1_024 })
    expect(result.blockedReason).toContain("SANDBOX_UNAVAILABLE")
    expect(result.stdout).not.toContain("UNSANDBOXED_CANARY")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("container cleanup is bounded and reports failed removal", () => {
  const calls: Array<{ command: string[]; timeoutMs: number }> = []
  const failure = cleanupSandboxContainer("/fake/docker", "mathos-sandbox-test", (command, timeoutMs) => {
    calls.push({ command, timeoutMs })
    return command.includes("inspect")
      ? { exitCode: 0, signalCode: null, stderr: "" }
      : { exitCode: 42, signalCode: null, stderr: "remove failed" }
  })

  expect(failure).toContain("SANDBOX_CLEANUP_FAILED")
  expect(calls.map(({ command }) => command.slice(1, 3))).toEqual([["container", "inspect"], ["rm", "--force"]])
  expect(calls.every(({ timeoutMs }) => timeoutMs > 0 && timeoutMs <= 2_000)).toBe(true)
})

test("container cleanup accepts a container already removed by --rm", () => {
  const failure = cleanupSandboxContainer("/fake/docker", "mathos-sandbox-test", () => ({
    exitCode: 1,
    signalCode: null,
    stderr: "Error response from daemon: No such container: mathos-sandbox-test",
  }))

  expect(failure).toBeNull()
})

test("container cleanup reports a timed-out or throwing Docker client", () => {
  const timedOut = cleanupSandboxContainer("/fake/docker", "mathos-sandbox-test", (command) => command.includes("inspect")
    ? { exitCode: 0, signalCode: null, stderr: "" }
    : { exitCode: null, signalCode: "SIGTERM", stderr: "" })
  const threw = cleanupSandboxContainer("/fake/docker", "mathos-sandbox-test", () => {
    throw new Error("docker disappeared")
  })

  expect(timedOut).toContain("SANDBOX_CLEANUP_FAILED")
  expect(threw).toContain("SANDBOX_CLEANUP_FAILED")
})

test("container execution blocks its result when removal cannot be confirmed", async () => {
  const docker = Bun.which("docker")
  if (!docker) return
  const available = await new ContainerSandboxRuntime(docker).inspect()
  if (!available.available) return
  const root = await mkdtemp(join(tmpdir(), "mathos-container-cleanup-failure-"))
  try {
    const scriptPath = join(root, "main.py")
    await writeFile(scriptPath, "print('UNTRUSTED_OUTPUT')\n")
    const runtime = new ContainerSandboxRuntime(docker, (command) => command.includes("inspect")
      ? { exitCode: 0, signalCode: null, stderr: "" }
      : { exitCode: 42, signalCode: null, stderr: "remove failed" })
    const result = await new PythonRuntime("python3", runtime).execute({ executable: "python3", origin: "MODEL_GENERATED", scriptPath, cwd: root, timeoutMs: 2_000, maxOutputBytes: 1_024 })
    expect(result.blockedReason).toContain("SANDBOX_CLEANUP_FAILED")
    expect(result.securityReport?.blockedReason).toBe(result.blockedReason)
    expect(result.stdout).toBe("")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("sandbox cleanup inspection fails when docker ps fails", () => {
  let timeoutMs = 0
  expect(() => runningSandboxContainerIds("/fake/docker", (_command, timeout) => {
    timeoutMs = timeout
    return { exitCode: 17, stdout: "" }
  })).toThrow("SANDBOX_INSPECTION_FAILED")
  expect(timeoutMs).toBeGreaterThan(0)
  expect(timeoutMs).toBeLessThanOrEqual(2_000)
})
