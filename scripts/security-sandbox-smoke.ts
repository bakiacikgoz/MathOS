import { randomUUID } from "node:crypto"
import { access, mkdtemp, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { ContainerSandboxRuntime, PythonRuntime, type SandboxedExecutionRequest } from "../packages/computation/src"

type Check = { passed: boolean; detail: string }

const checks: Record<string, Check> = {}
const roots: string[] = []
const INSPECTION_TIMEOUT_MS = 1_000

type DockerPsResult = { exitCode: number | null; stdout: string }
type DockerPsRunner = (command: string[], timeoutMs: number) => DockerPsResult

function runDockerPs(command: string[], timeoutMs: number): DockerPsResult {
  const result = Bun.spawnSync(command, { stdout: "pipe", stderr: "ignore", timeout: timeoutMs })
  return { exitCode: result.exitCode, stdout: result.stdout.toString() }
}

export function runningSandboxContainerIds(docker: string | null = Bun.which("docker"), run: DockerPsRunner = runDockerPs): string[] {
  if (!docker) throw new Error("SANDBOX_INSPECTION_FAILED: docker executable unavailable")
  let result: DockerPsResult
  try {
    result = run([docker, "ps", "--filter", "name=mathos-sandbox-", "--format", "{{.ID}}"], INSPECTION_TIMEOUT_MS)
  } catch {
    throw new Error("SANDBOX_INSPECTION_FAILED: docker ps could not run")
  }
  if (result.exitCode !== 0) throw new Error("SANDBOX_INSPECTION_FAILED: docker ps did not complete successfully")
  return result.stdout.trim().split("\n").filter(Boolean).sort()
}

async function execute(code: string, options: Partial<SandboxedExecutionRequest> = {}) {
  const inputRoot = await mkdtemp(join(tmpdir(), "mathos-security-input-"))
  roots.push(inputRoot)
  const scriptPath = join(inputRoot, "attack.py")
  await writeFile(scriptPath, code)
  return new PythonRuntime().execute({
    executable: "python3",
    scriptPath,
    cwd: inputRoot,
    timeoutMs: 5_000,
    maxOutputBytes: 8_192,
    origin: "MODEL_GENERATED",
    ...options,
  })
}

if (import.meta.main) try {
  const capability = await new ContainerSandboxRuntime().inspect()
  if (!capability.available) throw new Error(capability.reason ?? "EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE")

  const hostRoot = await mkdtemp(join(homedir(), ".mathos-security-host-"))
  roots.push(hostRoot)
  const hostCanaryPath = join(hostRoot, "outside-read-canary")
  const outsideWritePath = join(hostRoot, "outside-write-canary")
  await writeFile(hostCanaryPath, `MATHOS_HOST_CANARY_${randomUUID()}`)

  const isolation = await execute(`
import json, os, socket, subprocess

def denied(operation):
    try:
        operation()
        return False
    except Exception:
        return True

host_home = ${JSON.stringify(homedir())}
host_canary = ${JSON.stringify(hostCanaryPath)}
outside_write = ${JSON.stringify(outsideWritePath)}
sensitive = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "AWS_ACCESS_KEY_ID", "GOOGLE_APPLICATION_CREDENTIALS", "SSH_AUTH_SOCK", "MATHOS_HOST_ENV_CANARY"]
result = {
    "networkDenied": denied(lambda: socket.create_connection(("1.1.1.1", 443), timeout=2)),
    "hostEnvironmentDenied": all(name not in os.environ for name in sensitive),
    "hostSecretDenied": denied(lambda: open(host_canary).read()),
    "hostHomeInaccessible": not os.path.exists(host_home),
    "outsideReadDenied": denied(lambda: open(host_canary).read()),
    "outsideWriteDenied": denied(lambda: open(outside_write, "w").write("BAD")),
    "sshAuthSockDenied": "SSH_AUTH_SOCK" not in os.environ and not os.path.exists("/tmp/mathos-ssh-agent-canary.sock"),
    "dockerSocketDenied": not os.path.exists("/var/run/docker.sock"),
    "subprocessDenied": denied(lambda: subprocess.run(["/bin/sh", "-c", "echo BAD"], check=True, capture_output=True)),
    "temporaryHome": os.environ.get("HOME") == "/work" and os.environ.get("TMPDIR") == "/work",
}
try:
    with open(os.path.join(os.environ["HOME"], "sandbox-home-canary"), "w") as handle:
        handle.write("OK")
    result["temporaryHome"] = result["temporaryHome"] and True
except Exception:
    result["temporaryHome"] = False
print(json.dumps(result, sort_keys=True))
`, {
    extraEnv: {
      HOME: "/host-home-canary",
      OPENAI_API_KEY: "OPENAI_CANARY",
      ANTHROPIC_API_KEY: "ANTHROPIC_CANARY",
      AWS_ACCESS_KEY_ID: "AWS_CANARY",
      GOOGLE_APPLICATION_CREDENTIALS: "/host/cloud-canary.json",
      SSH_AUTH_SOCK: "/tmp/mathos-ssh-agent-canary.sock",
      MATHOS_HOST_ENV_CANARY: "ENV_CANARY",
    },
  })
  if (isolation.blockedReason || isolation.exitCode !== 0) throw new Error(`isolation probe did not execute: ${isolation.blockedReason ?? `exit ${isolation.exitCode}`}`)
  const isolationChecks = JSON.parse(isolation.stdout) as Record<string, boolean>
  for (const [name, passed] of Object.entries(isolationChecks)) checks[name] = { passed, detail: passed ? "denied" : "escape succeeded" }
  try {
    await access(outsideWritePath)
    checks.outsideWriteDenied = { passed: false, detail: "host canary was created" }
  } catch {
    checks.outsideWriteDenied = { passed: true, detail: "host canary absent" }
  }

  const beforeTimeout = runningSandboxContainerIds()
  const timeout = await execute("while True: pass\n", { timeoutMs: 150 })
  checks.timeoutEnforced = { passed: timeout.timedOut && timeout.exitCode === null, detail: timeout.timedOut ? "timed out" : "did not time out" }
  checks.childCleanup = { passed: JSON.stringify(runningSandboxContainerIds()) === JSON.stringify(beforeTimeout), detail: "running sandbox container set unchanged" }

  const output = await execute("import sys; sys.stdout.write('o'*100000); sys.stdout.flush(); sys.stderr.write('e'*100000)\n", { maxOutputBytes: 1_024 })
  const outputBytes = Buffer.byteLength(output.stdout) + Buffer.byteLength(output.stderr)
  checks.outputBounded = { passed: outputBytes <= 1_024 && (output.stdoutTruncated || output.stderrTruncated), detail: `${outputBytes} bytes retained` }

  const unavailableInput = await mkdtemp(join(tmpdir(), "mathos-security-unavailable-"))
  roots.push(unavailableInput)
  const unavailableScript = join(unavailableInput, "attack.py")
  await writeFile(unavailableScript, "print('UNSANDBOXED_CANARY')\n")
  const unavailable = await new PythonRuntime("python3", new ContainerSandboxRuntime(null)).execute({
    executable: "python3",
    scriptPath: unavailableScript,
    cwd: unavailableInput,
    timeoutMs: 500,
    maxOutputBytes: 1_024,
    origin: "MODEL_GENERATED",
  })
  checks.unavailableFailsClosed = {
    passed: Boolean(unavailable.blockedReason?.includes("SANDBOX_UNAVAILABLE")) && !unavailable.stdout.includes("UNSANDBOXED_CANARY"),
    detail: unavailable.blockedReason ?? "execution was not blocked",
  }

  const failed = Object.entries(checks).filter(([, check]) => !check.passed).map(([name]) => name)
  if (failed.length > 0) throw new Error(`sandbox attack matrix failed: ${failed.join(", ")}`)
  console.log(JSON.stringify({ passed: true, backend: capability.backend, origin: "MODEL_GENERATED", checks }, null, 2))
} finally {
  for (const root of roots.reverse()) await rm(root, { recursive: true, force: true })
}
